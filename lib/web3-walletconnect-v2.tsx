// MUST be first
import "react-native-get-random-values";

// 1. GLOBAL LOG SUPPRESSION (Fastest possible execution)
if (!__DEV__) {
  // @ts-ignore
  global.pino = { child: () => ({ error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }) };
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const str = JSON.stringify(args);
    if (str.includes('"level":50') || str.includes('session topic')) return;
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
import { Linking } from "react-native";
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
                // 3. Hydrate State Immediately (Zero Network Delay)
                setWcProvider(provider);
                setAddress(sessionData.address);
                setChainId(sessionData.chainId);
                setIsConnected(true);
                
                // 4. Lazy Load Signer (Non-blocking)
                const ethersProvider = new ethers.BrowserProvider(provider);
                ethersProvider.getSigner().then(s => {
                    if(mounted) setSigner(s);
                }).catch(err => console.log("Signer load warning:", err));

                setupEventListeners(provider);
            }
        }
      } catch (e) {
        console.log("Init warning:", e);
      } finally {
        if(mounted) setIsInitializing(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

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

        // 2. Setup URI Handler
        const wallet = SUPPORTED_WALLETS[walletId];
        const onDisplayUri = async (uri: string) => {
             // Race condition check
             if (!connectLockRef.current) return;
             
             try {
                // Try Deep Link first (Fastest)
                const deep = wallet.deepLink(uri);
                const canOpen = await Linking.canOpenURL(deep);
                if (canOpen) {
                    await Linking.openURL(deep);
                } else {
                    await Linking.openURL(wallet.universalLink(uri));
                }
             } catch {
                 await Linking.openURL(wallet.universalLink(uri));
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
        
        // Save connection state flag
        await AsyncStorage.setItem("wc_connected", "true");
        
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
    setIsConnected(false); // Optimistic UI update
    setAddress(null);
    setSigner(null);
    
    try {
        const provider = await getWcProvider();
        if (provider) {
            // SAFE CLEANUP
            if (typeof provider.removeAllListeners === 'function') {
                try { provider.removeAllListeners(); } catch (e) { /* ignore */ }
            }
            try { await provider.disconnect(); } catch (e) { /* ignore */ }
        }
        
        // Clean storage
        await AsyncStorage.removeItem("wc_connected");
        
        // Cleanup internal WC keys
        const keys = await AsyncStorage.getAllKeys();
        const wcKeys = keys.filter(k => k.startsWith('wc@2'));
        if (wcKeys.length > 0) await AsyncStorage.multiRemove(wcKeys);
        
    } catch (e) {
        console.warn("Disconnect cleanup error", e);
    }
    
    setWcProvider(null);
    connectLockRef.current = false;
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
        // Lightweight ping to keep socket alive, don't await strictly
        wcProvider.request({ method: "eth_blockNumber" }).catch(() => {});
    } catch {}
  }, [wcProvider, isConnected]);

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