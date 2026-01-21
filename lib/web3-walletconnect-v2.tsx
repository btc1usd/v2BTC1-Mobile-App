// NOTE: Polyfills are loaded in polyfills.js (imported in app/_layout.tsx)
// DO NOT add polyfills here - they must load at app entry point

// 1. GLOBAL LOG SUPPRESSION (Fastest possible execution)
if (!__DEV__) {
  // @ts-ignore - Completely disable Pino logger at global level
  global.pino = { child: () => ({ error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }) };
  
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  console.error = (...args: any[]) => {
    try {
      const str = JSON.stringify(args, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
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
    } catch (e) {
      // If stringify fails for any reason, allow the log through
    }
    originalConsoleError(...args);
  };
  
  console.warn = (...args: any[]) => {
    try {
      const str = JSON.stringify(args, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
      // Suppress session warnings and relay warnings
      if (
        str.includes('session topic') ||
        str.includes('No matching key') ||
        str.includes('onRelayMessage')
      ) return;
    } catch (e) {
      // If stringify fails for any reason, allow the log through
    }
    originalConsoleWarn(...args);
  };
} else {
  // Also suppress in development but keep some debugging
  const originalConsoleError = console.error;
  
  console.error = (...args: any[]) => {
    try {
      const str = JSON.stringify(args, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
      // Only suppress the noisy relay message errors in dev too
      if (
        str.includes('onRelayMessage') ||
        str.includes('failed to process an inbound message')
      ) return;
    } catch (e) {
      // If stringify fails for any reason, allow the log through
    }
    originalConsoleError(...args);
  };
}

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { ethers } from "ethers";
import { 
  useActiveAccount, 
  useActiveWallet, 
  useDisconnect,
  useSwitchActiveWalletChain,
  useActiveWalletChain
} from "thirdweb/react";
import { client } from "./thirdweb";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { DEFAULT_CHAIN_ID, DEFAULT_NETWORK, SUPPORTED_NETWORKS } from "./network-manager";
import { defineChain } from "thirdweb";

/* ============================================================
   TYPES
============================================================ */

interface Web3ContextType {
  readProvider: ethers.JsonRpcProvider;
  signer: ethers.Signer | null;
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  disconnectWallet: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
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
  // 1. READ / WRITE separation (CRITICAL)
  // READ: direct RPC (JsonRpcProvider) with fallback support
  const [rpcIndex, setRpcIndex] = useState(0);
  const rpcUrls = DEFAULT_NETWORK.rpcUrls;
  
  const readProvider = useMemo(() => {
    const currentRpc = rpcUrls[rpcIndex];
    console.log(`🔌 Using RPC [${rpcIndex}]: ${currentRpc}`);
    
    const provider = new ethers.JsonRpcProvider(currentRpc, DEFAULT_CHAIN_ID);
    
    // Add error handler to switch to next RPC on persistent failures
    provider.on('error', (error) => {
      console.error(`❌ RPC error on ${currentRpc}:`, error.message);
      // Switch to next RPC if available
      if (rpcIndex < rpcUrls.length - 1) {
        console.log(`🔄 Switching to fallback RPC [${rpcIndex + 1}]`);
        setRpcIndex(prev => prev + 1);
      }
    });
    
    return provider;
  }, [rpcIndex]);

  // 2. Thirdweb v5 Hooks
  const account = useActiveAccount();
  const activeWallet = useActiveWallet();
  const activeChain = useActiveWalletChain();
  const { disconnect } = useDisconnect();
  const switchChainHook = useSwitchActiveWalletChain();

  // 3. Derived State
  const address = account?.address || null;
  const isConnected = !!account;
  const chainId = activeChain?.id || null;

  // 4. Signer (WRITE: thirdweb wallet signer only)
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  useEffect(() => {
    if (account && activeChain) {
      const ethersSigner = ethers6Adapter.signer.toEthers({
        client,
        chain: activeChain,
        account,
      });
      setSigner(ethersSigner);
    } else {
      setSigner(null);
    }
  }, [account, activeChain]);

  // 5. Actions
  const disconnectWallet = async () => {
    if (activeWallet) {
      disconnect(activeWallet);
    }
  };

  const switchChain = async (targetChainId: number) => {
    try {
      await switchChainHook(defineChain(targetChainId));
    } catch (error) {
      console.error("Failed to switch chain:", error);
      throw error;
    }
  };

  const value: Web3ContextType = {
    readProvider,
    signer,
    address,
    chainId,
    isConnected,
    isConnecting: false, // Thirdweb handles connection via UI components
    error: null,
    disconnectWallet,
    switchChain,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}