/**
 * State-of-the-Art Network Manager for DeFi Mobile Apps
 * 
 * Patterns from top DeFi protocols:
 * - Uniswap: Instant network detection + user-friendly prompts
 * - Aave: Network validation before every action
 * - Curve: Automatic network switching support
 * - MetaMask: Clear network status indicators
 */

import { ethers } from "ethers";
import { Alert } from "react-native";

// Supported networks configuration
export const SUPPORTED_NETWORKS = {
  BASE_SEPOLIA: {
    chainId: 84532,
    name: "Base Sepolia",
    shortName: "Base",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://sepolia.base.org",
      "https://base-sepolia.blockpi.network/v1/rpc/public",
      "https://base-sepolia-rpc.publicnode.com",
      "https://base-sepolia.gateway.tenderly.co",
    ],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
    iconUrl: "https://base.org/images/base-logo.svg",
    isTestnet: true,
  },
  BASE_MAINNET: {
    chainId: 8453,
    name: "Base",
    shortName: "Base",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base.blockpi.network/v1/rpc/public",
      "https://base-rpc.publicnode.com",
    ],
    blockExplorerUrls: ["https://basescan.org"],
    iconUrl: "https://base.org/images/base-logo.svg",
    isTestnet: false,
  },
} as const;

// Default network for the app
export const DEFAULT_NETWORK = SUPPORTED_NETWORKS.BASE_SEPOLIA;
export const DEFAULT_CHAIN_ID = DEFAULT_NETWORK.chainId;

// Network validation result
export interface NetworkValidation {
  isValid: boolean;
  isSupported: boolean;
  currentChainId: number | null;
  expectedChainId: number;
  networkName: string;
  needsSwitch: boolean;
  error?: string;
}

/**
 * Validate if the current network is correct for the app
 * Used by all contract interactions to ensure correct network
 */
export async function validateNetwork(
  provider: ethers.Provider | null,
  expectedChainId: number = DEFAULT_CHAIN_ID
): Promise<NetworkValidation> {
  if (!provider) {
    return {
      isValid: false,
      isSupported: false,
      currentChainId: null,
      expectedChainId,
      networkName: "Unknown",
      needsSwitch: false,
      error: "No provider available",
    };
  }

  try {
    const network = await provider.getNetwork();
    const currentChainId = Number(network.chainId);

    console.log("🌐 Network validation:", {
      current: currentChainId,
      expected: expectedChainId,
      match: currentChainId === expectedChainId,
    });

    const isValid = currentChainId === expectedChainId;
    const networkConfig = Object.values(SUPPORTED_NETWORKS).find(
      (n) => n.chainId === currentChainId
    );

    return {
      isValid,
      isSupported: !!networkConfig,
      currentChainId,
      expectedChainId,
      networkName: networkConfig?.name || `Chain ${currentChainId}`,
      needsSwitch: !isValid && !!networkConfig,
      error: isValid ? undefined : `Wrong network. Please switch to Base.`,
    };
  } catch (error: any) {
    console.error("❌ Network validation error:", error);
    return {
      isValid: false,
      isSupported: false,
      currentChainId: null,
      expectedChainId,
      networkName: "Unknown",
      needsSwitch: false,
      error: error.message || "Failed to detect network",
    };
  }
}

/**
 * Get network display info for UI
 */
export function getNetworkInfo(chainId: number | null) {
  console.log('📊 getNetworkInfo called with chainId:', chainId);
  
  if (!chainId) {
    return {
      name: "Not Connected",
      shortName: "N/A",
      icon: "⚠️",
      color: "#gray",
      isCorrect: false,
    };
  }

  const network = Object.values(SUPPORTED_NETWORKS).find(
    (n) => n.chainId === chainId
  );

  const isCorrect = chainId === DEFAULT_CHAIN_ID;
  
  const info = {
    name: network?.name || `Chain ${chainId}`,
    shortName: network?.shortName || `${chainId}`,
    icon: isCorrect ? "✅" : "⚠️",
    color: isCorrect ? "#10B981" : "#EF4444",
    isCorrect,
    isSupported: !!network,
    isTestnet: network?.isTestnet,
  };
  
  console.log('📊 getNetworkInfo result:', info);
  return info;
}

/**
 * Request network switch (WalletConnect compatible)
 * Works with WalletConnect, MetaMask, and other mobile wallets
 */
export async function requestNetworkSwitch(
  wcProvider: any, // WalletConnect EthereumProvider
  targetChainId: number = DEFAULT_CHAIN_ID
): Promise<{ success: boolean; error?: string }> {
  try {
    const networkConfig = Object.values(SUPPORTED_NETWORKS).find(
      (n) => n.chainId === targetChainId
    );

    if (!networkConfig) {
      return {
        success: false,
        error: "Unsupported network",
      };
    }

    console.log(`🔄 Requesting switch to ${networkConfig.name}...`);

    // For WalletConnect provider, use the request method
    if (wcProvider && typeof wcProvider.request === 'function') {
      try {
        // Try wallet_switchEthereumChain first
        await wcProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        });

        console.log(`✅ Switched to ${networkConfig.name}`);
        return { success: true };
      } catch (switchError: any) {
        // Error code 4902 means the chain has not been added to the wallet
        if (switchError.code === 4902) {
          console.log(`📝 Adding ${networkConfig.name} to wallet...`);

          try {
            // Try to add the network
            await wcProvider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${targetChainId.toString(16)}`,
                  chainName: networkConfig.name,
                  nativeCurrency: networkConfig.nativeCurrency,
                  rpcUrls: networkConfig.rpcUrls,
                  blockExplorerUrls: networkConfig.blockExplorerUrls,
                },
              ],
            });

            console.log(`✅ Added and switched to ${networkConfig.name}`);
            return { success: true };
          } catch (addError: any) {
            console.error("❌ Failed to add network:", addError);
            return {
              success: false,
              error: addError.message || "Failed to add network to wallet",
            };
          }
        }

        // User rejected the request or other error
        console.error("❌ Network switch rejected:", switchError);
        return {
          success: false,
          error: switchError.message || "User rejected network switch",
        };
      }
    }

    return {
      success: false,
      error: "No WalletConnect provider available",
    };
  } catch (error: any) {
    console.error("❌ Network switch error:", error);
    return {
      success: false,
      error: error.message || "Failed to switch network",
    };
  }
}

/**
 * Show user-friendly network error alert
 * Pattern from Uniswap mobile app
 */
export function showNetworkError(
  currentChainId: number | null,
  expectedChainId: number = DEFAULT_CHAIN_ID,
  onSwitch?: () => void
) {
  const currentNetwork = getNetworkInfo(currentChainId);
  const expectedNetwork = getNetworkInfo(expectedChainId);

  Alert.alert(
    "⚠️ Wrong Network",
    `You're connected to ${currentNetwork.name}, but this app requires ${expectedNetwork.name}.\n\nPlease switch networks in your wallet app.`,
    [
      { text: "Cancel", style: "cancel" },
      onSwitch
        ? {
            text: "Try Switch",
            onPress: onSwitch,
          }
        : { text: "OK" },
    ]
  );
}

/**
 * Check if network is correct before action
 * Returns true if can proceed, false if blocked
 */
export async function checkNetworkBeforeAction(
  provider: ethers.Provider | null,
  actionName: string = "this action"
): Promise<boolean> {
  const validation = await validateNetwork(provider);

  // Accept both Base Sepolia and Base Mainnet
  const ALLOWED_CHAIN_IDS = [84532, 8453];
  const isValid = validation.currentChainId !== null && 
                  ALLOWED_CHAIN_IDS.includes(validation.currentChainId);

  if (!isValid) {
    console.warn(`⚠️ Network check failed for ${actionName}:`, validation);

    Alert.alert(
      "Wrong Network",
      `Cannot ${actionName}. Please switch to Base network in your wallet.`,
      [{ text: "OK" }]
    );

    return false;
  }

  return true;
}

/**
 * Get RPC provider for reading (no wallet needed)
 * Uses fallback RPCs for resilience
 */
export function getReadOnlyProvider(chainId: number = DEFAULT_CHAIN_ID): ethers.JsonRpcProvider {
  const network = Object.values(SUPPORTED_NETWORKS).find((n) => n.chainId === chainId);

  if (!network) {
    console.warn(`⚠️ Unknown chainId ${chainId}, using default`);
    return new ethers.JsonRpcProvider(DEFAULT_NETWORK.rpcUrls[0], DEFAULT_CHAIN_ID);
  }

  // Use FallbackProvider for automatic failover
  return createFallbackProvider(network.rpcUrls, chainId);
}

/**
 * Create a provider with automatic fallback to backup RPCs
 * If primary RPC fails, automatically switches to next available
 */
function createFallbackProvider(rpcUrls: readonly string[], chainId: number): ethers.JsonRpcProvider {
  // For now, use the first RPC with fallback logic in hooks
  // ethers.js v6 FallbackProvider requires more complex setup
  // We'll implement retry logic at the hook level instead
  return new ethers.JsonRpcProvider(rpcUrls[0], chainId);
}

/**
 * Monitor network changes (for React components)
 * Returns cleanup function
 */
export function monitorNetworkChanges(
  provider: any,
  onNetworkChange: (chainId: number) => void
): () => void {
  const handleChainChanged = (chainIdHex: string) => {
    const newChainId = parseInt(chainIdHex, 16);
    console.log("🔄 Network changed to:", newChainId);
    onNetworkChange(newChainId);
  };

  provider?.on?.("chainChanged", handleChainChanged);

  // Return cleanup function
  return () => {
    provider?.off?.("chainChanged", handleChainChanged);
  };
}
