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
import { Linking, Alert, Platform, AppState } from "react-native";
import Constants from "expo-constants";
import EthereumProvider from "@walletconnect/ethereum-provider";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_CHAIN_ID,
  DEFAULT_NETWORK,
  validateNetwork,
  showNetworkError,
} from "./network-manager";

/* ============================================================
   CONSTANTS
============================================================ */

const BASE_CHAIN_ID = DEFAULT_CHAIN_ID; // e.g. 84532
const BASE_RPC_URL = DEFAULT_NETWORK.rpcUrls[0];
const WC_PROJECT_ID = "0471f7c4c7ea7ebc0de0e852cc4aea66";

const APP_SCHEME = Constants.expoConfig?.scheme || "btc1usd";
const APP_URL = `${APP_SCHEME}://`;

/* ============================================================
   TYPES
============================================================ */

enum ConnectionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

interface Web3ContextType {
  /** WRITE ONLY (WalletConnect) */
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;

  /** READ ONLY (RPC – authoritative) */
  readOnlyProvider: ethers.JsonRpcProvider;

  address: string | null;
  chainId: number | null;

  isConnected: boolean;
  isConnecting: boolean;
  connectionStatus: ConnectionStatus;
  error: string | null;

  connectWallet: (wallet: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
}

/* ============================================================
   CONTEXT
============================================================ */

const Web3Context = createContext<Web3ContextType>(null as any);
export const useWeb3 = () => useContext(Web3Context);

/* ============================================================
   WALLET WAKE (CRITICAL)
============================================================ */

async function ensureWalletActive(
  provider: ethers.BrowserProvider
) {
  try {
    await provider.send("eth_accounts", []);
  } catch {
    /* silent */
  }
}

/* ============================================================
   PROVIDER
============================================================ */

export function Web3ProviderWithWalletConnect({
  children,
}: {
  children: ReactNode;
}) {
  /* ---------------- READ PROVIDER (AUTHORITATIVE) ---------------- */
  const readOnlyProvider = useRef(
    new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID)
  ).current;

  /* ---------------- WRITE PROVIDER ---------------- */
  const [provider, setProvider] =
    useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  /* ---------------- STATE ---------------- */
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(BASE_CHAIN_ID);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState(ConnectionStatus.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);

  /* ---------------- WC SINGLETON ---------------- */
  const wcRef = useRef<any>(null);
  const connectingRef = useRef(false);

  /* ============================================================
     AUTHORITATIVE NETWORK DETECTION (RPC ONLY)
  ============================================================ */

  const syncNetworkFromRPC = useCallback(async () => {
    const net = await readOnlyProvider.getNetwork();
    setChainId(Number(net.chainId));
    return Number(net.chainId);
  }, [readOnlyProvider]);

  /* Poll network – mobile wallets lie */
  useEffect(() => {
    syncNetworkFromRPC();
    const id = setInterval(syncNetworkFromRPC, 8000);
    return () => clearInterval(id);
  }, [syncNetworkFromRPC]);

  /* ============================================================
     CONNECT WALLET
  ============================================================ */

  const connectWallet = useCallback(
    async (walletType: string) => {
      if (connectingRef.current) return;

      connectingRef.current = true;
      setIsConnecting(true);
      setConnectionStatus(ConnectionStatus.CONNECTING);
      setError(null);

      try {
        /* ---------- INIT WC ---------- */
        const wc =
          wcRef.current ??
          (await EthereumProvider.init({
            projectId: WC_PROJECT_ID,
            chains: [BASE_CHAIN_ID],
            showQrModal: false,
            metadata: {
              name: "BTC1USD",
              description: "Bitcoin-Backed Stable Asset",
              url: APP_URL,
              icons: ["https://btc1usd.com/btc1usd-logo-transparent.png"],
            },
          }));

        wcRef.current = wc;

        /* ---------- DEEP LINK ---------- */
        wc.on("display_uri", async (uri: string) => {
          const schemes: Record<string, string> = {
            metamask: `metamask://wc?uri=${encodeURIComponent(uri)}`,
            coinbase: `cbwallet://wc?uri=${encodeURIComponent(uri)}`,
            trust: `trust://wc?uri=${encodeURIComponent(uri)}`,
            rainbow: `rainbow://wc?uri=${encodeURIComponent(uri)}`,
          };

          const scheme =
            walletType !== "any"
              ? schemes[walletType]
              : Object.values(schemes)[0];

          // OPTIMIZED: Instant wallet opening (industry standard)
          if (scheme) {
            console.log(`📱 Opening ${walletType} wallet instantly...`);
            await Linking.openURL(scheme);
            console.log(`✅ Wallet deep link triggered`);
          }
        });

        /* ---------- CONNECT ---------- */
        // OPTIMIZED: Enable wallet with shorter timeout (30s - industry standard)
        const connectPromise = wc.enable();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Connection timed out. Please check your wallet app and try again.")), 30000)
        );
        
        try {
          await Promise.race([connectPromise, timeoutPromise]);
        } catch (error: any) {
          if (error.message.includes("timed out")) {
            console.error("⏰ Connection timed out after 30s");
          }
          throw error;
        }

        const wcProvider = new ethers.BrowserProvider(wc);

        /* WAKE WALLET IMMEDIATELY */
        await ensureWalletActive(wcProvider);

        /* ---------- NETWORK GATE ---------- */
        const walletNet = await wcProvider.getNetwork();
        const walletChainId = Number(walletNet.chainId);

        // Don't force network switch during connection - allow user to switch later
        if (walletChainId !== BASE_CHAIN_ID) {
          console.log(`⚠️ Connected to chain ${walletChainId} (expected ${BASE_CHAIN_ID})`);
          console.log("📌 User can switch network from Dashboard");
          // Skip automatic network switching - let user control it
        }

        /* ---------- SIGNER ---------- */
        const signer = await wcProvider.getSigner();
        const addr = await signer.getAddress();
        console.log(`✅ Wallet connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`);

        /* ---------- FINAL VALIDATION ---------- */
        const rpcChain = await syncNetworkFromRPC();
        // Don't show error during connection - just log for info
        if (rpcChain !== BASE_CHAIN_ID) {
          console.log(`📌 RPC network: ${rpcChain}, Expected: ${BASE_CHAIN_ID}`);
          console.log("📌 Network indicator in Dashboard will show wrong network warning");
        }

        setProvider(wcProvider);
        setSigner(signer);
        setAddress(addr);
        setIsConnected(true);
        setConnectionStatus(ConnectionStatus.CONNECTED);

        // Store preferred wallet for quick reopening
        await AsyncStorage.setItem("walletconnect_session", "true");
        await AsyncStorage.setItem("wc_preferred_wallet", walletType);
        console.log(`✅ Connection complete - ${walletType} saved as preferred wallet`);
      } catch (e: any) {
        console.error("❌ Connection failed:", e.message);
        const errorMsg = e.message?.includes("timed out") 
          ? "Connection timed out. Please ensure your wallet app is installed and try again."
          : e.message ?? "Wallet connection failed";
        setError(errorMsg);
        setConnectionStatus(ConnectionStatus.ERROR);
        throw new Error(errorMsg);
      } finally {
        connectingRef.current = false;
        setIsConnecting(false);
      }
    },
    [syncNetworkFromRPC]
  );

  /* ============================================================
     DISCONNECT
  ============================================================ */

  const disconnectWallet = useCallback(async () => {
    try {
      if (wcRef.current) {
        console.log("🔓 Disconnecting wallet...");
        await wcRef.current.disconnect();
        wcRef.current = null;
      }
      await AsyncStorage.removeItem("walletconnect_session");
      await AsyncStorage.removeItem("wc_preferred_wallet");
      console.log("✅ Wallet disconnected");
    } finally {
      setProvider(null);
      setSigner(null);
      setAddress(null);
      setIsConnected(false);
      setConnectionStatus(ConnectionStatus.DISCONNECTED);
      setError(null);
      setChainId(BASE_CHAIN_ID);
    }
  }, []);

  /* ============================================================
     CONTEXT VALUE
  ============================================================ */

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        readOnlyProvider,
        address,
        chainId,
        isConnected,
        isConnecting,
        connectionStatus,
        error,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}
