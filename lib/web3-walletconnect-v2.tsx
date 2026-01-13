// Industry-Standard WalletConnect Implementation
// Following patterns from Uniswap, Rainbow, MetaMask Mobile Apps
// MUST be first
import "react-native-get-random-values";

// Suppress WalletConnect/Pino logger errors in production
if (__DEV__ === false) {
  // @ts-ignore - Suppress pino logger
  global.pino = { child: () => ({ error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }) };
}

// Override console.error to filter out pino logs
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Filter out pino/WalletConnect logger messages with level: 50
  const stringified = JSON.stringify(args);
  if (stringified.includes('"level":50') || stringified.includes('"level": 50')) {
    return; // Suppress this log
  }
  originalConsoleError(...args);
};

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { ethers } from "ethers";
import { Linking, Platform, AppState, AppStateStatus } from "react-native";
import Constants from "expo-constants";
import EthereumProvider from "@walletconnect/ethereum-provider";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_CHAIN_ID,
  DEFAULT_NETWORK,
} from "./network-manager";

/* ============================================================
   CONFIGURATION
============================================================ */

const WALLETCONNECT_PROJECT_ID = "0471f7c4c7ea7ebc0de0e852cc4aea66";
const BASE_CHAIN_ID = DEFAULT_CHAIN_ID;
const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_RPC_URL = DEFAULT_NETWORK.rpcUrls[0];

const APP_SCHEME = Constants.expoConfig?.scheme || "btc1usd";
const APP_URL = `${APP_SCHEME}://`;

// Supported chains - both Base Sepolia and Base Mainnet
const SUPPORTED_CHAINS = [BASE_CHAIN_ID, BASE_MAINNET_CHAIN_ID];

/* ============================================================
   WALLET REGISTRY - Industry Standard Wallets
============================================================ */

export const SUPPORTED_WALLETS = {
  metamask: {
    id: "metamask",
    name: "MetaMask",
    scheme: "metamask://",
    deepLink: (uri: string) => `metamask://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
    icon: "https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg",
  },
  rainbow: {
    id: "rainbow",
    name: "Rainbow",
    scheme: "rainbow://",
    deepLink: (uri: string) => `rainbow://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
    icon: "https://avatars.githubusercontent.com/u/48327834?s=200&v=4",
  },
  trust: {
    id: "trust",
    name: "Trust Wallet",
    scheme: "trust://",
    deepLink: (uri: string) => `trust://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
    icon: "https://trustwallet.com/assets/images/media/assets/TWT.png",
  },
  coinbase: {
    id: "coinbase",
    name: "Coinbase Wallet",
    scheme: "cbwallet://",
    deepLink: (uri: string) => `cbwallet://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
    icon: "https://www.coinbase.com/img/favicon/favicon-32x32.png",
  },
  zerion: {
    id: "zerion",
    name: "Zerion",
    scheme: "zerion://",
    deepLink: (uri: string) => `zerion://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://wallet.zerion.io/wc?uri=${encodeURIComponent(uri)}`,
    icon: "https://zerion.io/icon.png",
  },
  omni: {
    id: "omni",
    name: "Omni",
    scheme: "omni://",
    deepLink: (uri: string) => `omni://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://links.omni.app/wc?uri=${encodeURIComponent(uri)}`,
    icon: "https://omni.app/favicon.ico",
  },
} as const;

export type WalletId = keyof typeof SUPPORTED_WALLETS;

/* ============================================================
   TYPES
============================================================ */

interface Web3ContextType {
  // READ-ONLY Provider (Singleton RPC - NEVER uses WalletConnect)
  readProvider: ethers.JsonRpcProvider;
  
  // WRITE-ONLY Providers (Only for transactions/signatures)
  signer: ethers.Signer | null;
  wcProvider: any | null; // EthereumProvider instance
  
  // Account & Network
  address: string | null;
  chainId: number | null;
  
  // Connection State
  isConnected: boolean;
  isConnecting: boolean;
  isInitializing: boolean;
  error: string | null;
  
  // Actions
  connectWallet: (walletId: WalletId) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  cancelConnection: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  wakeWallet: () => Promise<void>; // NEW: Wake wallet on user intent
}

/* ============================================================
   CONTEXT
============================================================ */

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within Web3Provider");
  }
  return context;
};

/* ============================================================
   DEEP LINK HELPER
============================================================ */

async function openWalletDeepLink(walletId: WalletId, uri: string) {
  const wallet = SUPPORTED_WALLETS[walletId];
  
  try {
    // Try deep link first (faster if app is installed)
    const deepLinkUrl = wallet.deepLink(uri);
    const canOpen = await Linking.canOpenURL(deepLinkUrl);
    
    if (canOpen) {
      await Linking.openURL(deepLinkUrl);
      return;
    }
    
    // Fallback to universal link (opens app store if not installed)
    await Linking.openURL(wallet.universalLink(uri));
  } catch (error) {
    console.error(`Failed to open ${wallet.name}:`, error);
    // Fallback to universal link on error
    await Linking.openURL(wallet.universalLink(uri));
  }
}

/* ============================================================
   STORAGE HELPERS
============================================================ */

const STORAGE_KEYS = {
  CONNECTED: "wc_connected",
  PREFERRED_WALLET: "wc_preferred_wallet",
  SESSION: "wc_session",
} as const;

async function saveConnection(walletId: WalletId) {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.CONNECTED, "true"],
    [STORAGE_KEYS.PREFERRED_WALLET, walletId],
  ]);
}

async function clearConnection() {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.CONNECTED,
    STORAGE_KEYS.PREFERRED_WALLET,
    STORAGE_KEYS.SESSION,
  ]);
}

async function getPreferredWallet(): Promise<WalletId | null> {
  const wallet = await AsyncStorage.getItem(STORAGE_KEYS.PREFERRED_WALLET);
  return wallet as WalletId | null;
}

/**
 * Clears all WalletConnect data including sessions
 * Use this if user encounters persistent connection issues
 */
export async function clearAllWalletConnectData() {
  try {
    await clearConnection();
    // Clear WalletConnect SDK storage
    const keys = await AsyncStorage.getAllKeys();
    const wcKeys = keys.filter(key => 
      key.startsWith('wc@2') || 
      key.startsWith('walletconnect') ||
      key.includes('walletconnect')
    );
    if (wcKeys.length > 0) {
      await AsyncStorage.multiRemove(wcKeys);
    }
    console.log("✅ Cleared all WalletConnect data");
  } catch (error) {
    console.error("Failed to clear WalletConnect data:", error);
  }
}

/* ============================================================
   PROVIDER COMPONENT
============================================================ */

export function Web3Provider({ children }: { children: ReactNode }) {
  /* ---------------- READ-ONLY RPC PROVIDER (SINGLETON - ALWAYS AVAILABLE) ---------------- */
  // This provider is ONLY for reads: balanceOf, decimals, allowance, getNetwork, etc.
  // NEVER use WalletConnect for reads - causes slow communication
  const readProvider = useRef(
    new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID)
  ).current;

  /* ---------------- WRITE-ONLY STATE ---------------- */
  // Only used for transactions and signatures
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [wcProvider, setWcProvider] = useState<any | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(BASE_CHAIN_ID);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  /* ---------------- REFS ---------------- */
  const wcInstanceRef = useRef<any>(null);
  const connectLockRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  /* ============================================================
     INITIALIZE WC PROVIDER (SINGLETON PATTERN)
  ============================================================ */

  const initializeWalletConnect = useCallback(async () => {
    if (wcInstanceRef.current) return wcInstanceRef.current;

    try {
      // CRITICAL: Clear any stored invalid sessions before init
      // This prevents "session topic doesn't exist" errors
      const keys = await AsyncStorage.getAllKeys();
      const wcSessionKeys = keys.filter(key => 
        key.includes('wc@2:client') || 
        key.includes('wc@2:session')
      );
      
      if (wcSessionKeys.length > 0) {
        console.log("🧹 Cleaning up old WalletConnect sessions...");
        // Check each session for validity
        for (const key of wcSessionKeys) {
          try {
            const data = await AsyncStorage.getItem(key);
            if (data) {
              const parsed = JSON.parse(data);
              // Remove sessions older than 7 days
              if (parsed.expiry && parsed.expiry < Date.now() / 1000) {
                console.log(`🗑️ Removing expired session: ${key}`);
                await AsyncStorage.removeItem(key);
              }
            }
          } catch (e) {
            // Invalid JSON, remove it
            console.log(`🗑️ Removing invalid session: ${key}`);
            await AsyncStorage.removeItem(key);
          }
        }
      }

      const provider = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [BASE_CHAIN_ID],
        showQrModal: false,
        metadata: {
          name: "BTC1USD",
          description: "Bitcoin-Backed Stable Asset",
          url: APP_URL,
          icons: ["https://btc1usd.com/btc1usd-logo-transparent.png"],
        },
        // Optional chains for multi-network support
        optionalChains: [BASE_MAINNET_CHAIN_ID],
        rpcMap: {
          [BASE_CHAIN_ID]: BASE_RPC_URL,
          [BASE_MAINNET_CHAIN_ID]: "https://mainnet.base.org",
        },
      });

      wcInstanceRef.current = provider;
      return provider;
    } catch (error) {
      console.error("Failed to initialize WalletConnect:", error);
      throw error;
    }
  }, []);

  /* ============================================================
     EVENT HANDLERS
  ============================================================ */

  const setupEventListeners = useCallback((provider: any) => {
    // Account changed
    provider.on("accountsChanged", (accounts: string[]) => {
      console.log("WC: accountsChanged", accounts);
      if (accounts.length > 0) {
        setAddress(accounts[0]);
      } else {
        disconnectWallet();
      }
    });

    // Chain changed
    provider.on("chainChanged", (chainId: number) => {
      console.log("WC: chainChanged", chainId);
      setChainId(Number(chainId));
      
      // Recreate signer on chain change
      const newProvider = new ethers.BrowserProvider(provider);
      newProvider.getSigner().then((newSigner: ethers.Signer) => {
        setSigner(newSigner);
      }).catch(console.error);
    });

    // Disconnected
    provider.on("disconnect", () => {
      console.log("WC: disconnect event");
      disconnectWallet();
    });

    // Session events
    provider.on("session_event", (event: any) => {
      console.log("WC: session_event", event);
    });

    provider.on("session_update", ({ topic, params }: any) => {
      console.log("WC: session_update", topic, params);
    });

    provider.on("session_delete", () => {
      console.log("WC: session_delete");
      disconnectWallet();
    });

    // CRITICAL: Handle session errors globally
    provider.on("session_error", (error: any) => {
      console.error("WC: session_error", error);
      if (error.message?.includes("session topic doesn't exist") || error.message?.includes("No matching key")) {
        console.log("Session expired or invalid - auto-disconnecting");
        disconnectWallet();
      }
    });
  }, []);

  /* ============================================================
     CONNECT WALLET
  ============================================================ */

  const connectWallet = useCallback(async (walletId: WalletId) => {
    if (connectLockRef.current) {
      console.log("Connection already in progress");
      return;
    }

    connectLockRef.current = true;
    setIsConnecting(true);
    setError(null);

    try {
      console.log(`Connecting to ${walletId}...`);
      
      // CRITICAL: Clear all stale WC sessions before connecting
      try {
        const keys = await AsyncStorage.getAllKeys();
        const wcSessionKeys = keys.filter(key => 
          key.includes('wc@2:client') || 
          key.includes('wc@2:session') ||
          key.includes('walletconnect')
        );
        
        if (wcSessionKeys.length > 0) {
          await AsyncStorage.multiRemove(wcSessionKeys);
          console.log(`🧹 Pre-cleared ${wcSessionKeys.length} stale session keys`);
        }
      } catch (cleanupError) {
        console.log("⚠️ Session cleanup error (non-critical):", cleanupError);
      }

      // Force clear any existing instance
      if (wcInstanceRef.current) {
        try {
          await wcInstanceRef.current.disconnect();
        } catch {}
        wcInstanceRef.current = null;
      }
      
      // Wrap entire connection flow with 2 minute timeout
      const connectWithTimeout = async () => {
        // Initialize fresh provider
        const wcProvider = await initializeWalletConnect();
        
        // Set up deep link handler
        wcProvider.on("display_uri", async (uri: string) => {
          console.log("Opening wallet with URI...");
          await openWalletDeepLink(walletId, uri);
        });

        // Connect (this will trigger display_uri)
        console.log("🔗 Initiating WalletConnect session...");
        await wcProvider.enable();
        
        // Create ethers provider
        const ethersProvider = new ethers.BrowserProvider(wcProvider);
        
        // Wake up wallet session
        await ethersProvider.send("eth_accounts", []);
        
        // Get signer and address
        const signer = await ethersProvider.getSigner();
        const address = await signer.getAddress();
        const network = await ethersProvider.getNetwork();
        let chainId = Number(network.chainId);

        console.log("Connected:", { address, chainId });

        // Don't force network switch - allow connection on any network
        if (!SUPPORTED_CHAINS.includes(chainId)) {
          console.log(`⚠️ Connected to chain ${chainId} (expected Base Sepolia ${BASE_CHAIN_ID})`);
          console.log("📌 User can switch network from Dashboard");
          // Continue without forcing network switch
        }

        // Set up event listeners
        setupEventListeners(wcProvider);

        return {
          wcProvider,
          ethersProvider,
          signer,
          address,
          chainId
        };
      };

      // Apply 2 minute timeout to entire connection flow
      const result = await Promise.race([
        connectWithTimeout(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Connection timed out. Please ensure your wallet app is open and responding.")),
            120000 // 2 minutes
          )
        ),
      ]);

      // Update state with connected wallet
      setWcProvider(result.wcProvider);
      setSigner(result.signer);
      setAddress(result.address);
      setChainId(result.chainId);
      setIsConnected(true);

      // Save to storage
      await saveConnection(walletId);

      console.log("✅ Connection successful");
    } catch (error: any) {
      console.error("Connection failed:", error);
      
      // User-friendly error messages
      let errorMessage = "Failed to connect wallet";
      
      if (error.message?.includes("timed out")) {
        errorMessage = "Connection timed out. Please open your wallet app and try again.";
      } else if (error.message?.includes("rejected")) {
        errorMessage = "Connection rejected by user";
      } else if (error.message?.includes("session topic") || error.message?.includes("No matching key")) {
        errorMessage = "Session error - please try connecting again";
        // Force cleanup
        try {
          const keys = await AsyncStorage.getAllKeys();
          const wcKeys = keys.filter(key => key.includes('wc@2') || key.includes('walletconnect'));
          if (wcKeys.length > 0) await AsyncStorage.multiRemove(wcKeys);
        } catch {}
      } else if (error.message?.includes("User closed modal")) {
        errorMessage = "Connection cancelled";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      
      // Clean up on error
      if (wcInstanceRef.current) {
        try {
          await wcInstanceRef.current.disconnect();
        } catch {}
        wcInstanceRef.current = null;
      }
      
      await clearConnection();
      
      throw error;
    } finally {
      connectLockRef.current = false;
      setIsConnecting(false);
    }
  }, [initializeWalletConnect, setupEventListeners]);

  /* ============================================================
     DISCONNECT WALLET
  ============================================================ */

  const disconnectWallet = useCallback(async () => {
    console.log("Disconnecting wallet...");
    
    try {
      if (wcInstanceRef.current) {
        await wcInstanceRef.current.disconnect();
        console.log("✅ WalletConnect session terminated");
        wcInstanceRef.current = null;
      }
      
      await clearConnection();
      console.log("✅ Storage cleared");

      // CRITICAL: Clear all WalletConnect session data
      const keys = await AsyncStorage.getAllKeys();
      const wcSessionKeys = keys.filter(key => 
        key.includes('wc@2:client') || 
        key.includes('wc@2:session') ||
        key.includes('walletconnect')
      );
      
      if (wcSessionKeys.length > 0) {
        await AsyncStorage.multiRemove(wcSessionKeys);
        console.log(`🧹 Cleaned up ${wcSessionKeys.length} WalletConnect session keys`);
      }

      // Reset connection lock
      connectLockRef.current = false;
      
      console.log("✅ Wallet disconnected and all data cleared");
    } catch (error) {
      console.error("Disconnect error:", error);
    } finally {
      setWcProvider(null);
      setSigner(null);
      setAddress(null);
      setChainId(BASE_CHAIN_ID);
      setIsConnected(false);
      setError(null);
    }
  }, []);

  /* ============================================================
     CANCEL ONGOING CONNECTION
  ============================================================ */

  const cancelConnection = useCallback(async () => {
    console.log("🚫 Canceling ongoing connection...");
    
    try {
      // Disconnect any active WalletConnect session
      if (wcInstanceRef.current) {
        try {
          await wcInstanceRef.current.disconnect();
        } catch (disconnectError) {
          console.log("Disconnect during cancel:", disconnectError);
        }
        wcInstanceRef.current = null;
      }
      
      // Clear storage
      await clearConnection();
      
      // Reset connection lock to allow new connection
      connectLockRef.current = false;
      
      console.log("✅ Connection canceled, ready for new attempt");
    } catch (error) {
      console.error("Cancel error:", error);
    }
  }, []);

  /* ============================================================
     SWITCH CHAIN
  ============================================================ */

  const switchChain = useCallback(async (targetChainId: number) => {
    if (!wcProvider) {
      throw new Error("Not connected");
    }

    if (!SUPPORTED_CHAINS.includes(targetChainId)) {
      throw new Error("Unsupported chain");
    }

    try {
      await wcProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (error: any) {
      console.error("Chain switch failed:", error);
      throw error;
    }
  }, [wcProvider]);

  /* ============================================================
     AUTO-RECONNECT ON APP START
  ============================================================ */

  useEffect(() => {
    const tryReconnect = async () => {
      try {
        const connected = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTED);
        const preferredWallet = await getPreferredWallet();
        
        if (connected !== "true" || !preferredWallet) {
          console.log("✅ No previous session to restore");
          setIsInitializing(false);
          return;
        }

        console.log("🔍 Checking for existing WalletConnect session...");
        
        // Use timeout to prevent hanging on startup
        const reconnectWithTimeout = async () => {
          // Initialize WalletConnect to check for existing session
          const wc = await initializeWalletConnect();
          
          // Check if session exists and is valid
          if (!wc.session) {
            console.log("⚠️ No active session found - user needs to reconnect");
            await clearConnection();
            return null;
          }

          console.log("🔄 Restoring previous session...");
          
          // Try to restore session with error handling
          const ethersProvider = new ethers.BrowserProvider(wc);
          
          // Test the connection with timeout and error handling
          try {
            await ethersProvider.send("eth_accounts", []);
          } catch (sessionError: any) {
            // CRITICAL: If session is invalid, clear it
            if (sessionError.message?.includes("session topic doesn't exist") || 
                sessionError.message?.includes("No matching key")) {
              console.log("⚠️ Session invalid - clearing and requiring fresh connection");
              await clearConnection();
              if (wcInstanceRef.current) {
                try {
                  await wcInstanceRef.current.disconnect();
                } catch {}
                wcInstanceRef.current = null;
              }
              return null;
            }
            throw sessionError;
          }
          
          const signer = await ethersProvider.getSigner();
          const address = await signer.getAddress();
          const network = await ethersProvider.getNetwork();
          
          return {
            wc,
            ethersProvider,
            signer,
            address,
            chainId: Number(network.chainId)
          };
        };

        // Wrap reconnection with 10 second timeout
        const result = await Promise.race([
          reconnectWithTimeout(),
          new Promise<null>((resolve) => 
            setTimeout(() => {
              console.log("⏰ Auto-reconnect timeout - clearing session");
              resolve(null);
            }, 10000) // 10 seconds timeout
          )
        ]);

        if (!result) {
          console.log("⚠️ Session restoration failed or timed out");
          await clearConnection();
          if (wcInstanceRef.current) {
            try {
              await wcInstanceRef.current.disconnect();
            } catch {}
            wcInstanceRef.current = null;
          }
          setIsInitializing(false);
          return;
        }

        // Successfully restored session
        setWcProvider(result.wc);
        setSigner(result.signer);
        setAddress(result.address);
        setChainId(result.chainId);
        setIsConnected(true);
        
        setupEventListeners(result.wc);
        console.log("✅ Auto-reconnect successful:", result.address);
      } catch (error: any) {
        console.log("⚠️ Auto-reconnect failed:", error.message);
        // Clear stale session data gracefully
        await clearConnection();
        if (wcInstanceRef.current) {
          try {
            await wcInstanceRef.current.disconnect();
          } catch {}
          wcInstanceRef.current = null;
        }
        // Don't throw - allow app to start normally
        console.log("✅ App starting without previous session");
      } finally {
        // Always mark initialization as complete
        setIsInitializing(false);
      }
    };

    // Run reconnection attempt
    tryReconnect();
  }, [initializeWalletConnect, setupEventListeners]);

  /* ============================================================
     WAKE WALLET ON USER INTENT
  ============================================================ */

  const wakeWallet = useCallback(async () => {
    if (!wcProvider || !isConnected) {
      console.log("No wallet connected to wake");
      return;
    }

    try {
      console.log("🔔 Waking wallet session...");
      await wcProvider.request({ method: "eth_accounts", params: [] });
      console.log("✅ Wallet session active");
    } catch (error: any) {
      console.error("Failed to wake wallet:", error.message);
      
      // CRITICAL: If session is invalid, auto-disconnect
      if (error.message?.includes("session topic doesn't exist") || 
          error.message?.includes("No matching key") ||
          error.message?.includes("session")) {
        console.log("Session invalid during wake - disconnecting");
        await disconnectWallet();
      }
    }
  }, [wcProvider, isConnected]);

  /* ============================================================
     APP STATE HANDLER (REMOVED - NO AUTO-WAKE ON FOREGROUND)
  ============================================================ */

  // REMOVED: No longer wake wallet on app foreground
  // Wallet should only wake on explicit user action (Mint/Redeem/Approve buttons)

  /* ============================================================
     CONTEXT VALUE
  ============================================================ */

  const value: Web3ContextType = {
    readProvider,
    signer,
    wcProvider,
    address,
    chainId,
    isConnected,
    isConnecting,
    isInitializing,
    error,
    connectWallet,
    disconnectWallet,
    cancelConnection,
    switchChain,
    wakeWallet,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}
