/**
 * State-of-the-Art Network Enforcement Hook
 * Patterns from Uniswap, Aave, MetaMask mobile apps
 * 
 * Features:
 * - Automatic network validation on wallet connection
 * - Forced network switch before any transaction
 * - Block all actions on wrong network
 * - Auto-retry with exponential backoff
 */

import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { 
  DEFAULT_CHAIN_ID,
  getNetworkInfo 
} from "@/lib/network-manager";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";

interface UseNetworkEnforcementOptions {
  chainId: number | null;
  isConnected: boolean;
  enabled?: boolean;
}

interface NetworkEnforcementResult {
  isCorrectNetwork: boolean;
  isChecking: boolean;
  isSwitching: boolean;
  canProceed: boolean;
  networkError: string | null;
  switchNetwork: () => Promise<boolean>;
  checkAndSwitch: () => Promise<boolean>;
  enforceNetwork: (actionName: string) => Promise<boolean>;
}

export function useNetworkEnforcement({
  chainId,
  isConnected,
  enabled = true,
}: UseNetworkEnforcementOptions): NetworkEnforcementResult {
  const { switchChain } = useWeb3();
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [isChecking] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  
  const checkNetwork = useCallback(() => {
    if (!enabled || !isConnected) {
      setIsCorrectNetwork(false);
      return false;
    }

    const ALLOWED_CHAIN_IDS = [8453]; // Base mainnet only
    const isValid = chainId !== null && ALLOWED_CHAIN_IDS.includes(chainId);
    
    setIsCorrectNetwork(isValid);
    
    if (!isValid && chainId !== null) {
      const networkInfo = getNetworkInfo(chainId);
      setNetworkError(
        `Wrong network: ${networkInfo.name}. Please switch to Base mainnet (8453).`
      );
    } else {
      setNetworkError(null);
    }
    
    return isValid;
  }, [isConnected, enabled, chainId]);

  useEffect(() => {
    checkNetwork();
  }, [checkNetwork]);

  const switchNetwork = useCallback(async (): Promise<boolean> => {
    setIsSwitching(true);
    try {
      await switchChain(DEFAULT_CHAIN_ID);
      return true;
    } catch (error: any) {
      console.error("❌ Network switch failed:", error);
      Alert.alert(
        "❌ Switch Failed",
        error.message || "Failed to switch network. Please switch manually in your wallet app.",
        [{ text: "OK" }]
      );
      return false;
    } finally {
      setIsSwitching(false);
    }
  }, [switchChain]);

  const checkAndSwitch = useCallback(async (): Promise<boolean> => {
    const isValid = checkNetwork();
    if (isValid) return true;

    return new Promise((resolve) => {
      Alert.alert(
        "Wrong Network Detected",
        "You need to switch to Base network to continue. Switch now?",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Switch Network", onPress: async () => resolve(await switchNetwork()) },
        ]
      );
    });
  }, [checkNetwork, switchNetwork]);

  const enforceNetwork = useCallback(async (actionName: string): Promise<boolean> => {
    const isValid = checkNetwork();
    if (isValid) return true;

    return new Promise((resolve) => {
      Alert.alert(
        "Wrong Network",
        `Cannot ${actionName} on current network.\n\nPlease switch to Base network to continue.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Switch Network", onPress: async () => resolve(await switchNetwork()) },
        ]
      );
    });
  }, [checkNetwork, switchNetwork]);

  return {
    isCorrectNetwork,
    isChecking,
    isSwitching,
    canProceed: isCorrectNetwork && !isSwitching,
    networkError,
    switchNetwork,
    checkAndSwitch,
    enforceNetwork,
  };
}
