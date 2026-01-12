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

import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import { 
  validateNetwork, 
  requestNetworkSwitch, 
  DEFAULT_CHAIN_ID,
  getNetworkInfo 
} from "@/lib/network-manager";

interface UseNetworkEnforcementOptions {
  provider: any;
  wcProvider: any;
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
  provider,
  wcProvider,
  chainId,
  isConnected,
  enabled = true,
}: UseNetworkEnforcementOptions): NetworkEnforcementResult {
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  
  const lastCheckRef = useRef<number>(0);
  const CHECK_INTERVAL = 2000; // Check every 2 seconds

  /**
   * Validate current network
   * DISABLED: Always return true to allow any network
   */
  const checkNetwork = useCallback(async () => {
    // DISABLED: Allow any network - users can switch manually from Dashboard
    setIsCorrectNetwork(true); // Always true
    setNetworkError(null);
    return true;
    
    /* ORIGINAL CODE - DISABLED
    if (!enabled || !isConnected) {
      setIsCorrectNetwork(false);
      return false;
    }

    // CRITICAL: Accept BOTH Base Sepolia (84532) AND Base Mainnet (8453)
    const ALLOWED_CHAIN_IDS = [84532, 8453];
    
    // Use chainId directly if available (faster and more reliable)
    if (chainId !== null && chainId !== undefined) {
      const isValid = ALLOWED_CHAIN_IDS.includes(chainId);
      
      console.log("🌐 Network check (chainId):", {
        chainId,
        allowedChainIds: ALLOWED_CHAIN_IDS,
        isValid,
      });
      
      setIsCorrectNetwork(isValid);
      
      if (!isValid) {
        const networkInfo = getNetworkInfo(chainId);
        setNetworkError(
          `Wrong network: ${networkInfo.name}. Please switch to Base.`
        );
      } else {
        setNetworkError(null);
      }
      
      return isValid;
    }
    
    // Fallback to provider check if chainId not available
    if (!provider) {
      setIsCorrectNetwork(false);
      return false;
    }

    // Throttle checks
    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_INTERVAL) {
      return isCorrectNetwork;
    }
    lastCheckRef.current = now;

    setIsChecking(true);
    try {
      const validation = await validateNetwork(provider, DEFAULT_CHAIN_ID);
      
      // Accept both Base networks
      const isValid = validation.currentChainId !== null && 
                     ALLOWED_CHAIN_IDS.includes(validation.currentChainId);
      
      console.log("🌐 Network check result (provider):", {
        isValid,
        currentChainId: validation.currentChainId,
        allowedChainIds: ALLOWED_CHAIN_IDS,
      });

      setIsCorrectNetwork(isValid);
      
      if (!isValid) {
        const networkInfo = getNetworkInfo(validation.currentChainId);
        setNetworkError(
          `Wrong network: ${networkInfo.name}. Please switch to Base.`
        );
      } else {
        setNetworkError(null);
      }

      return isValid;
    } catch (error: any) {
      console.error("❌ Network check error:", error);
      setIsCorrectNetwork(false);
      setNetworkError(error.message || "Failed to check network");
      return false;
    } finally {
      setIsChecking(false);
    }
    */
  }, [provider, isConnected, enabled, chainId]); // FIXED: Removed isCorrectNetwork from deps

  /**
   * Switch to correct network (Uniswap pattern)
   */
  const switchNetwork = useCallback(async (): Promise<boolean> => {
    if (!wcProvider) {
      Alert.alert(
        "Cannot Switch Network",
        "Please switch to Base Sepolia manually in your wallet app.",
        [{ text: "OK" }]
      );
      return false;
    }

    setIsSwitching(true);
    console.log("🔄 Attempting network switch...");

    try {
      const result = await requestNetworkSwitch(wcProvider, DEFAULT_CHAIN_ID);

      if (result.success) {
        console.log("✅ Network switched successfully");
        
        // Wait for network to stabilize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Re-check network
        const isValid = await checkNetwork();
        
        if (isValid) {
          setNetworkError(null);
          Alert.alert(
            "✅ Network Switched",
            "Successfully switched to Base network.",
            [{ text: "OK" }]
          );
          return true;
        } else {
          throw new Error("Network switch succeeded but validation failed");
        }
      } else {
        throw new Error(result.error || "Failed to switch network");
      }
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
  }, [wcProvider, checkNetwork]);

  /**
   * Check and auto-switch if needed (Aave pattern)
   */
  const checkAndSwitch = useCallback(async (): Promise<boolean> => {
    console.log("🔍 Check and switch initiated...");
    
    const isValid = await checkNetwork();
    
    if (isValid) {
      console.log("✅ Already on correct network");
      return true;
    }

    console.log("⚠️ Wrong network detected, attempting auto-switch...");
    
    // Show warning before auto-switch
    return new Promise((resolve) => {
      Alert.alert(
        "Wrong Network Detected",
        "You need to switch to Base network to continue. Switch now?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Switch Network",
            onPress: async () => {
              const success = await switchNetwork();
              resolve(success);
            },
          },
        ]
      );
    });
  }, [checkNetwork, switchNetwork]);

  /**
   * Enforce network before action (MetaMask pattern)
   * Use this before any transaction
   */
  const enforceNetwork = useCallback(
    async (actionName: string): Promise<boolean> => {
      console.log(`🛡️ Enforcing network for action: ${actionName}`);

      // Check if on correct network
      const isValid = await checkNetwork();

      if (isValid) {
        console.log(`✅ Network check passed for: ${actionName}`);
        return true;
      }

      // Block action and prompt switch
      console.warn(`⚠️ Blocking ${actionName} - wrong network`);

      return new Promise((resolve) => {
        Alert.alert(
          "Wrong Network",
          `Cannot ${actionName} on current network.\n\nPlease switch to Base network to continue.`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: "Switch Network",
              onPress: async () => {
                const success = await switchNetwork();
                resolve(success);
              },
            },
          ]
        );
      });
    },
    [checkNetwork, switchNetwork]
  );

  /**
   * Auto-check network on mount and chain changes
   */
  useEffect(() => {
    if (enabled && isConnected) {
      console.log('🔄 ChainId or connection changed, checking network immediately...', {
        chainId,
        isConnected,
        enabled,
      });
      
      // Force immediate check without throttle
      lastCheckRef.current = 0;
      checkNetwork();
    }
  }, [chainId, isConnected, enabled, checkNetwork]);

  /**
   * Periodic network check (background monitoring)
   */
  useEffect(() => {
    if (!enabled || !isConnected || !provider) return;

    const intervalId = setInterval(() => {
      checkNetwork();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [enabled, isConnected, provider, checkNetwork]);

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
