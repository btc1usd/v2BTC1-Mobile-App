// Industry-Standard WalletConnect Implementation
// Following patterns from Uniswap, Rainbow, MetaMask Mobile Apps
// MUST be first
import "react-native-get-random-values";

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
  // Providers
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  readOnlyProvider: ethers.JsonRpcProvider;
  wcProvider: any | null; // EthereumProvider instance
  
  // Account & Network
  address: string | null;
  chainId: number | null;
  
  // Connection State
  isConnected: boolean;
  isConnecting: boolean;
  isInitializing: boolean; // New: startup initialization state
  error: string | null;
  
  // Actions
  connectWallet: (walletId: WalletId) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  cancelConnection: () => Promise<void>; // New: cancel ongoing connection
  switchChain: (chainId: number) => Promise<void>;
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
  /* ---------------- READ-ONLY PROVIDER (ALWAYS AVAILABLE) ---------------- */
  const readOnlyProvider = useRef(
    new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID)
  ).current;

  /* ---------------- STATE ---------------- */
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [wcProvider, setWcProvider] = useState<any | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(BASE_CHAIN_ID);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true); // New: track startup initialization

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
      
      // Recreate ethers provider on chain change (CRITICAL)
      const newProvider = new ethers.BrowserProvider(provider);
      setProvider(newProvider);
      
      newProvider.getSigner().then(newSigner => {
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
      
      // Wrap entire connection flow with 2 minute timeout
      const connectWithTimeout = async () => {
        // Initialize or get existing provider
        const wcProvider = await initializeWalletConnect();
        
        // Check if there's an existing session and clear it if invalid
        if (wcProvider.session) {
          try {
            // Test if session is valid
            await wcProvider.request({ method: "eth_chainId" });
          } catch (sessionError: any) {
            console.log("Existing session is invalid, clearing...");
            await wcProvider.disconnect();
            wcInstanceRef.current = null;
            // Reinitialize
            const newProvider = await initializeWalletConnect();
            wcInstanceRef.current = newProvider;
          }
        }
        
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
      setProvider(result.ethersProvider);
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
      } else if (error.message?.includes("session")) {
        errorMessage = "Session error - please try again";
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
        wcInstanceRef.current = null;
      }
      
      await clearConnection();
    } catch (error) {
      console.error("Disconnect error:", error);
    } finally {
      setWcProvider(null);
      setProvider(null);
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
          
          // Try to restore session
          const ethersProvider = new ethers.BrowserProvider(wc);
          
          // Test the connection with timeout
          await ethersProvider.send("eth_accounts", []);
          
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
        setProvider(result.ethersProvider);
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
     APP STATE HANDLER (WAKE UP ON FOREGROUND)
  ============================================================ */

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextAppState === "active" &&
          isConnected &&
          provider
        ) {
          // Wake up provider when app comes to foreground
          console.log("App resumed, waking provider...");
          provider.send("eth_accounts", []).catch(console.error);
        }
        appStateRef.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [isConnected, provider]);

  /* ============================================================
     CONTEXT VALUE
  ============================================================ */

  const value: Web3ContextType = {
    provider,
    signer,
    readOnlyProvider,
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
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}
