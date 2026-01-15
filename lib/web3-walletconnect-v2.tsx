// MUST be first
import "react-native-get-random-values";

// 1. GLOBAL LOG SUPPRESSION (Fastest possible execution)
if (!__DEV__) {
  // @ts-ignore - Completely disable Pino logger at global level
  global.pino = { child: () => ({ error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }) };
  
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  console.error = (...args: any[]) => {
    const str = JSON.stringify(args);
    // Suppress WalletConnect internal errors, relay messages, and session topic errors
    if (
      str.includes('"level":50') || 
      str.includes('"level": 50') ||
      str.includes('session topic') ||
      str.includes('No matching key') ||
      str.includes("doesn't exist") ||
      str.includes('onRelayMessage') ||
      str.includes('failed to process an inbound message')
    ) return;
    originalConsoleError(...args);
  };
  
  console.warn = (...args: any[]) => {
    const str = JSON.stringify(args);
    // Suppress session warnings and relay warnings
    if (
      str.includes('session topic') ||
      str.includes('No matching key') ||
      str.includes('onRelayMessage')
    ) return;
    originalConsoleWarn(...args);
  };
} else {
  // Also suppress in development but keep some debugging
  const originalConsoleError = console.error;
  
  console.error = (...args: any[]) => {
    const str = JSON.stringify(args);
    // Only suppress the noisy relay message errors in dev too
    if (
      str.includes('onRelayMessage') ||
      str.includes('failed to process an inbound message')
    ) return;
    originalConsoleError(...args);
  };
}

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
import { Linking, AppState, AppStateStatus } from "react-native";
import Constants from "expo-constants";
import EthereumProvider from "@walletconnect/ethereum-provider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_CHAIN_ID, DEFAULT_NETWORK } from "./network-manager";

/* ============================================================
   CONFIGURATION
============================================================ */

const PROJECT_ID = "0471f7c4c7ea7ebc0de0e852cc4aea66";
const BASE_CHAIN_ID = DEFAULT_CHAIN_ID;
const BASE_MAINNET_CHAIN_ID = 8453;
const RPC_URL = DEFAULT_NETWORK.rpcUrls[0];
const APP_SCHEME = Constants.expoConfig?.scheme || "btc1usd";
const APP_METADATA = {
  name: "BTC1USD",
  description: "Bitcoin-Backed Stable Asset",
  url: `${APP_SCHEME}://`,
  icons: ["https://btc1usd.com/btc1usd-logo-transparent.png"],
};

/* ============================================================
   SINGLETON INITIALIZATION (CRITICAL FOR SPEED)
   Start init process immediately when JS bundle loads
============================================================ */

let wcProviderPromise: Promise<any> | null = null;

const getWcProvider = () => {
  if (!wcProviderPromise) {
    wcProviderPromise = EthereumProvider.init({
      projectId: PROJECT_ID,
      chains: [BASE_CHAIN_ID],
      optionalChains: [BASE_MAINNET_CHAIN_ID],
      showQrModal: false,
      metadata: APP_METADATA,
      rpcMap: {
        [BASE_CHAIN_ID]: RPC_URL,
        [BASE_MAINNET_CHAIN_ID]: "https://mainnet.base.org",
      },
    });
  }
  return wcProviderPromise;
};

// HARD RESET helper – used by DebugPanel and disconnect flow
export async function clearAllWalletConnectData(): Promise<void> {
  console.log("🧹 Clearing all WalletConnect data (hard reset)");

  try {
    // If a provider has already been created, clean it up
    if (wcProviderPromise) {
      let provider: any = null;
      try {
        provider = await wcProviderPromise;
      } catch {
        provider = null;
      }

      if (provider) {
        // Remove listeners as defensively as possible
        try {
          if (typeof provider.removeAllListeners === "function") {
            provider.removeAllListeners();
          } else if (typeof provider.off === "function") {
            try {
              provider.off("accountsChanged");
              provider.off("chainChanged");
              provider.off("disconnect");
              provider.off("session_delete");
              provider.off("display_uri");
            } catch {}
          }
        } catch {}

        // Best‑effort disconnect with timeout
        try {
          await Promise.race([
            provider.disconnect(),
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch (e: any) {
          const msg = e?.message || "";
          if (
            !msg.includes("session topic") &&
            !msg.includes("No matching key")
          ) {
            console.warn("clearAllWalletConnectData disconnect warning:", msg);
          }
        }
      }
    }

    // Clear our own tracking keys
    await AsyncStorage.removeItem("wc_connected");
    await AsyncStorage.removeItem("wc_preferred_wallet");
    await AsyncStorage.removeItem("wc_session_timestamp");
    await AsyncStorage.removeItem("wc_session_address");

    // Clear WalletConnect internal keys
    try {
      const keys = await AsyncStorage.getAllKeys();
      const wcKeys = keys.filter((k) => k.startsWith("wc@2"));
      if (wcKeys.length > 0) {
        await AsyncStorage.multiRemove(wcKeys);
      }
    } catch (e: any) {
      console.warn(
        "clearAllWalletConnectData storage cleanup warning:",
        e?.message
      );
    }
  } finally {
    // Force a fresh EthereumProvider.init() on next connect
    wcProviderPromise = null;
  }

  console.log("✅ WalletConnect data cleared");
}

// Start initialization immediately
getWcProvider();

/* ============================================================
   WALLET CONFIG & TYPES
============================================================ */

export const SUPPORTED_WALLETS = {
  metamask: {
    id: "metamask",
    name: "MetaMask",
    deepLink: (uri: string) => `metamask://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
  },
  rainbow: {
    id: "rainbow",
    name: "Rainbow",
    deepLink: (uri: string) => `rainbow://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  trust: {
    id: "trust",
    name: "Trust Wallet",
    deepLink: (uri: string) => `trust://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  coinbase: {
    id: "coinbase",
    name: "Coinbase Wallet",
    deepLink: (uri: string) => `cbwallet://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  zerion: {
    id: "zerion",
    name: "Zerion",
    deepLink: (uri: string) => `zerion://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://wallet.zerion.io/wc?uri=${encodeURIComponent(uri)}`,
  },
  omni: {
    id: "omni",
    name: "Omni",
    deepLink: (uri: string) => `omni://wc?uri=${encodeURIComponent(uri)}`,
    universalLink: (uri: string) => `https://links.omni.app/wc?uri=${encodeURIComponent(uri)}`,
  },
} as const;

export type WalletId = keyof typeof SUPPORTED_WALLETS;

interface Web3ContextType {
  readProvider: ethers.JsonRpcProvider;
  signer: ethers.Signer | null;
  wcProvider: any | null;
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  isInitializing: boolean;
  error: string | null;
  connectWallet: (walletId: WalletId) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  cancelConnection: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  wakeWallet: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) throw new Error("useWeb3 must be used within Web3Provider");
  return context;
};

/* ============================================================
   PROVIDER COMPONENT
============================================================ */

export function Web3Provider({ children }: { children: ReactNode }) {
  // SINGLETON READ PROVIDER
  const readProvider = useRef(new ethers.JsonRpcProvider(RPC_URL, BASE_CHAIN_ID)).current;

  // STATE
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [wcProvider, setWcProvider] = useState<any | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(BASE_CHAIN_ID);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const connectLockRef = useRef(false);
  const sessionHealthCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateListener = useRef<any>(null);
  const lastHealthCheckRef = useRef<number>(Date.now());
  const connectionRetryCount = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to extract account info directly from WC Session (Zero RPC Calls)
  const extractSessionData = useCallback((provider: any) => {
    if (!provider.session) return null;
    
    // WC v2 namespaces format: "eip155:84532": { accounts: ["eip155:84532:0x..."] }
    const namespace = provider.session.namespaces['eip155'];
    if (!namespace || !namespace.accounts || namespace.accounts.length === 0) return null;

    const accountEntry = namespace.accounts[0]; // e.g., "eip155:84532:0xAddress"
    const [,, addr] = accountEntry.split(':');
    
    // Get chain ID from the session or default to what we set
    const chain = namespace.chains ? parseInt(namespace.chains[0].split(':')[1]) : BASE_CHAIN_ID;

    return { address: addr, chainId: chain };
  }, []);

  /* ============================================================
     INITIALIZATION (LIGHTNING FAST RECONNECT)
  ============================================================ */
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // 1. Await the global singleton promise
        const provider = await getWcProvider();
        
        if (!mounted) return;

        // 2. Check for existing session synchronously
        if (provider.session) {
            console.log("⚡ Instant restore from local session");
            const sessionData = extractSessionData(provider);
            
            if (sessionData) {
                // 3. Validate session storage consistency
                const storedConnected = await AsyncStorage.getItem("wc_connected");
                const storedWallet = await AsyncStorage.getItem("wc_preferred_wallet");
                
                if (storedConnected === "true") {
                    // 4. Hydrate State Immediately (Zero Network Delay)
                    setWcProvider(provider);
                    setAddress(sessionData.address);
                    setChainId(sessionData.chainId);
                    setIsConnected(true);
                    
                    console.log("✅ Session restored - Address:", sessionData.address.slice(0, 6) + "...");
                    if (storedWallet) {
                        console.log("🐛 Preferred wallet:", storedWallet);
                    }
                    
                    // 5. Lazy Load Signer (Non-blocking)
                    const ethersProvider = new ethers.BrowserProvider(provider);
                    ethersProvider.getSigner().then(s => {
                        if(mounted) setSigner(s);
                    }).catch(err => console.log("Signer load warning:", err));

                    setupEventListeners(provider);
                    
                    // 6. Verify session health after restore
                    setTimeout(() => {
                        if (mounted && provider.session) {
                            checkSessionHealth();
                        }
                    }, 3000);
                } else {
                    // Storage mismatch - clean up stale session
                    console.log("🧹 Storage mismatch detected, cleaning stale session...");
                    try {
                        await provider.disconnect();
                    } catch {}
                }
            }
        } else {
            // No session found - ensure storage is clean
            console.log("🆕 No existing session found");
            await AsyncStorage.removeItem("wc_connected");
            await AsyncStorage.removeItem("wc_preferred_wallet");
        }
      } catch (e) {
        console.log("Init warning:", e);
      } finally {
        if(mounted) setIsInitializing(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [extractSessionData]);

  /* ============================================================
     EVENT LISTENERS (SAFE)
  ============================================================ */
  const setupEventListeners = useCallback((provider: any) => {
    // FIX: Safely remove listeners
    if (provider) {
        if (typeof provider.removeAllListeners === 'function') {
            try { provider.removeAllListeners(); } catch (e) { /* ignore */ }
        } else if (typeof provider.off === 'function') {
            try {
                provider.off("accountsChanged");
                provider.off("chainChanged");
                provider.off("disconnect");
                provider.off("session_delete");
            } catch (e) { /* ignore */ }
        }
    }

    provider.on("accountsChanged", (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        // Update signer
        const ep = new ethers.BrowserProvider(provider);
        ep.getSigner().then(setSigner).catch(console.error);
      } else {
        disconnectWallet();
      }
    });

    provider.on("chainChanged", (newChain: any) => {
      // Handle hex or decimal
      const chainNum = typeof newChain === 'string' ? parseInt(newChain, 16) : newChain;
      setChainId(chainNum);
      const ep = new ethers.BrowserProvider(provider);
      ep.getSigner().then(setSigner).catch(console.error);
    });

    provider.on("disconnect", () => {
        disconnectWallet();
    });

    provider.on("session_delete", () => {
        disconnectWallet();
    });
  }, []);

  /* ============================================================
     CONNECT FLOW
  ============================================================ */
  const connectWallet = useCallback(async (walletId: WalletId) => {
    if (connectLockRef.current) return;
    connectLockRef.current = true;
    setIsConnecting(true);
    setError(null);

    try {
        const provider = await getWcProvider();

        // 1. Force disconnect if stale
        if (provider.session) {
            try { await provider.disconnect(); } catch {}
        }

        // 2. Setup URI Handler with redirect for auto-return (DeFi pattern)
        const wallet = SUPPORTED_WALLETS[walletId];
        const appScheme = "btc1usd://";
        
        const onDisplayUri = async (uri: string) => {
             // Race condition check
             if (!connectLockRef.current) return;
             
             // Format deep links with redirect based on wallet type
             let deepLinkUrl: string;
             let universalLinkUrl: string;
             
             if (walletId === 'metamask') {
               // MetaMask uses returnUrl parameter
               deepLinkUrl = `metamask://wc?uri=${encodeURIComponent(uri)}&returnUrl=${encodeURIComponent(appScheme)}`;
               universalLinkUrl = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}&returnUrl=${encodeURIComponent(appScheme)}`;
             } else {
               // Other wallets use redirect parameter
               deepLinkUrl = wallet.deepLink(uri) + `&redirect=${encodeURIComponent(appScheme)}`;
               universalLinkUrl = wallet.universalLink(uri) + `&redirect=${encodeURIComponent(appScheme)}`;
             }
             
             try {
                // Try Deep Link first (Fastest) with redirect
                const canOpen = await Linking.canOpenURL(deepLinkUrl);
                if (canOpen) {
                    await Linking.openURL(deepLinkUrl);
                } else {
                    await Linking.openURL(universalLinkUrl);
                }
             } catch {
                 await Linking.openURL(universalLinkUrl);
             }
        };

        provider.on("display_uri", onDisplayUri);

        // 3. Initiate Connection
        await provider.enable();
        
        // 4. Success - Hydrate State
        const ethersProvider = new ethers.BrowserProvider(provider);
        const newSigner = await ethersProvider.getSigner();
        const newAddr = await newSigner.getAddress();
        const net = await ethersProvider.getNetwork();

        // Cleanup listener
        if (typeof provider.removeListener === 'function') {
            provider.removeListener("display_uri", onDisplayUri);
        } else if (typeof provider.off === 'function') {
            provider.off("display_uri", onDisplayUri);
        }
        
        setWcProvider(provider);
        setSigner(newSigner);
        setAddress(newAddr);
        setChainId(Number(net.chainId));
        setIsConnected(true);
        
        // Save connection state and preferred wallet for future operations
        await AsyncStorage.setItem("wc_connected", "true");
        await AsyncStorage.setItem("wc_preferred_wallet", walletId);
        await AsyncStorage.setItem("wc_session_timestamp", Date.now().toString());
        await AsyncStorage.setItem("wc_session_address", newAddr);
        console.log("✅ Saved preferred wallet:", walletId);
        console.log("🔒 Session persisted with address:", newAddr.slice(0, 6) + "...");
        
        setupEventListeners(provider);

    } catch (error: any) {
        console.error("Connect failed:", error);
        let msg = "Connection failed";
        if (error.message?.includes("User closed")) msg = "Connection cancelled";
        setError(msg);
        disconnectWallet(); // Ensure clean state
    } finally {
        connectLockRef.current = false;
        setIsConnecting(false);
    }
  }, [setupEventListeners]);

  /* ============================================================
     DISCONNECT / CANCEL
  ============================================================ */
  const disconnectWallet = useCallback(async () => {
    console.log("🔌 Disconnecting wallet...");
    
    // Immediately update state to prevent any further operations
    setIsConnected(false);
    setAddress(null);
    setSigner(null);
    setWcProvider(null); // Clear provider reference FIRST to prevent async operations
    connectLockRef.current = false;
    
    try {
      // Hard reset all WalletConnect state (provider + storage)
      await clearAllWalletConnectData();
      console.log("✅ Wallet disconnected");
    } catch (e: any) {
      const msg = e?.message || "";
      if (
        !msg.includes("session topic") &&
        !msg.includes("No matching key")
      ) {
        console.warn("Disconnect cleanup:", msg);
      }
    }
  }, []);

  const cancelConnection = useCallback(async () => {
      connectLockRef.current = false;
      setIsConnecting(false);
      disconnectWallet();
  }, [disconnectWallet]);

  /* ============================================================
     ACTIONS
  ============================================================ */
  const switchChain = useCallback(async (targetChainId: number) => {
    if (!wcProvider) return;
    try {
        await wcProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        });
    } catch (error) {
        console.error("Switch chain error", error);
        throw error;
    }
  }, [wcProvider]);

  const wakeWallet = useCallback(async () => {
    if (!wcProvider || !isConnected) return;
    try {
        // Lightweight ping to keep socket alive with multiple fallback methods
        const keepAlivePromises = [
          wcProvider.request({ method: "eth_chainId" }),
          wcProvider.request({ method: "net_version" }),
        ];
        
        // Race between methods, use first successful response
        await Promise.race(keepAlivePromises).catch(() => {
          // If both fail, try one more time with eth_blockNumber
          wcProvider.request({ method: "eth_blockNumber" }).catch(() => {});
        });
        
        console.log("💚 Session keep-alive ping sent");
    } catch {}
  }, [wcProvider, isConnected]);

  /* ============================================================
     SESSION HEALTH MONITORING (DeFi Best Practice)
  ============================================================ */
  
  // Health check: Verify session is still valid
  const checkSessionHealth = useCallback(async () => {
    if (!wcProvider || !isConnected) return true;
    
    try {
      // Quick session validation via eth_chainId (lightweight)
      const result = await Promise.race([
        wcProvider.request({ method: "eth_chainId" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      
      lastHealthCheckRef.current = Date.now();
      connectionRetryCount.current = 0; // Reset retry count on success
      return !!result;
    } catch (error: any) {
      console.log("⚠️ Session health check failed:", error.message);
      
      // If session is truly dead, disconnect gracefully
      if (error.message?.includes('session') || error.message?.includes('No matching key')) {
        console.log("🔌 Session expired, disconnecting...");
        await disconnectWallet();
        return false;
      }
      
      // For network errors, implement retry with exponential backoff
      if (error.message?.includes('timeout') || error.message?.includes('network')) {
        connectionRetryCount.current++;
        
        if (connectionRetryCount.current <= 3) {
          const retryDelay = Math.min(1000 * Math.pow(2, connectionRetryCount.current), 10000);
          console.log(`🔄 Retrying session health check in ${retryDelay}ms (attempt ${connectionRetryCount.current}/3)`);
          
          retryTimeoutRef.current = setTimeout(() => {
            checkSessionHealth();
          }, retryDelay);
        } else {
          console.log("❌ Max retry attempts reached, keeping connection alive");
          connectionRetryCount.current = 0; // Reset for next cycle
        }
      }
      
      return true; // Network errors are ok, don't force disconnect
    }
  }, [wcProvider, isConnected, disconnectWallet]);

  // Auto-reconnect on app resume (modern DeFi pattern)
  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active' && wcProvider && isConnected) {
      console.log("📱 App resumed - verifying session...");
      
      // Check if session is still healthy after app was backgrounded
      const timeSinceLastCheck = Date.now() - lastHealthCheckRef.current;
      
      // If app was backgrounded for > 30s, do a health check
      if (timeSinceLastCheck > 30000) {
        await checkSessionHealth();
      }
    }
  }, [wcProvider, isConnected, checkSessionHealth]);

  // Setup app state listener
  useEffect(() => {
    appStateListener.current = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      if (appStateListener.current) {
        appStateListener.current.remove();
      }
    };
  }, [handleAppStateChange]);

  // Periodic session health checks (every 2 minutes when connected)
  useEffect(() => {
    if (isConnected && wcProvider) {
      console.log("🔄 Starting session health monitoring...");
      
      // Initial check after 5 seconds
      const initialTimer = setTimeout(() => {
        checkSessionHealth();
      }, 5000);
      
      // Periodic checks every 2 minutes
      sessionHealthCheckInterval.current = setInterval(() => {
        checkSessionHealth();
      }, 120000); // 2 minutes
      
      return () => {
        clearTimeout(initialTimer);
        if (sessionHealthCheckInterval.current) {
          clearInterval(sessionHealthCheckInterval.current);
          sessionHealthCheckInterval.current = null;
        }
      };
    }
  }, [isConnected, wcProvider, checkSessionHealth]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionHealthCheckInterval.current) {
        clearInterval(sessionHealthCheckInterval.current);
      }
      if (appStateListener.current) {
        appStateListener.current.remove();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

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