/**
 * Network Guard Component
 * Pattern from Uniswap mobile app - blocks entire UI on wrong network
 * 
 * Usage:
 * <NetworkGuard>
 *   <YourProtectedContent />
 * </NetworkGuard>
 */

import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useNetworkEnforcement } from "@/hooks/use-network-enforcement";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import * as Haptics from "expo-haptics";

interface NetworkGuardProps {
  children: React.ReactNode;
  showWhenDisconnected?: boolean;
  customMessage?: string;
}

export function NetworkGuard({
  children,
  showWhenDisconnected = false,
  customMessage,
}: NetworkGuardProps) {
  const { provider, wcProvider, chainId, isConnected } = useWeb3();
  
  const {
    isCorrectNetwork,
    isChecking,
    isSwitching,
    networkError,
    switchNetwork,
  } = useNetworkEnforcement({
    provider,
    wcProvider,
    chainId,
    isConnected,
  });
  
  // Debug logging
  React.useEffect(() => {
    console.log('🛡️ NetworkGuard state:', {
      isConnected,
      chainId,
      isCorrectNetwork,
      isChecking,
      expectedChainId: 8453, // Base Mainnet
    });
  }, [isConnected, chainId, isCorrectNetwork, isChecking]);

  // Show children if disconnected (optional)
  if (!isConnected && showWhenDisconnected) {
    return <>{children}</>;
  }

  // Show loading during initial check
  if (isChecking && !isCorrectNetwork && isConnected) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#F7931A" className="mb-4" />
        <Text className="text-base text-muted">Checking network...</Text>
      </View>
    );
  }

  // Block UI if wrong network
  if (isConnected && !isCorrectNetwork) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <View className="items-center max-w-md">
          <Text className="text-7xl mb-6">⚠️</Text>
          
          <Text className="text-3xl font-bold text-destructive mb-3 text-center">
            Wrong Network
          </Text>
          
          <Text className="text-base text-muted text-center mb-6">
            {customMessage || 
              "This app only works on Base Mainnet network. Please switch networks to continue."}
          </Text>

          {networkError && (
            <View className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6 w-full">
              <Text className="text-sm text-destructive text-center">
                {networkError}
              </Text>
            </View>
          )}
          
          {/* Debug Info */}
          {__DEV__ && (
            <View className="bg-info/10 border border-info/30 rounded-xl p-3 mb-4 w-full">
              <Text className="text-xs font-bold text-info mb-1">🐛 Debug Info:</Text>
              <Text className="text-xs text-muted">Current Chain ID: {chainId}</Text>
              <Text className="text-xs text-muted">Expected Chain ID: 8453 (Base Mainnet)</Text>
              <Text className="text-xs text-muted">Is Correct: {isCorrectNetwork ? 'Yes' : 'No'}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await switchNetwork();
            }}
            disabled={isSwitching}
            className={`bg-primary px-8 py-4 rounded-2xl ${
              isSwitching ? "opacity-50" : "active:opacity-70"
            } w-full`}
          >
            <Text className="text-white font-bold text-center text-base">
              {isSwitching ? "Switching Network..." : "Switch to Base Mainnet"}
            </Text>
          </TouchableOpacity>

          <Text className="text-xs text-muted text-center mt-4">
            This will open your wallet app to confirm the network change
          </Text>
        </View>
      </View>
    );
  }

  // Show children only on correct network
  return <>{children}</>;
}

/**
 * Compact Network Guard (for specific sections)
 */
export function CompactNetworkGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { provider, wcProvider, chainId, isConnected } = useWeb3();
  
  const { isCorrectNetwork, isSwitching, switchNetwork } = useNetworkEnforcement({
    provider,
    wcProvider,
    chainId,
    isConnected,
  });

  if (!isConnected || isCorrectNetwork) {
    return <>{children}</>;
  }

  return (
    <View className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 my-4">
      <View className="flex-row items-center mb-2">
        <Text className="text-2xl mr-2">⚠️</Text>
        <Text className="text-sm font-bold text-destructive">Wrong Network</Text>
      </View>
      
      <Text className="text-sm text-muted mb-3">
        Switch to Base Mainnet to access this feature
      </Text>

      <TouchableOpacity
        onPress={switchNetwork}
        disabled={isSwitching}
        className={`bg-destructive px-4 py-2 rounded-lg ${
          isSwitching ? "opacity-50" : "active:opacity-70"
        }`}
      >
        <Text className="text-sm font-semibold text-white text-center">
          {isSwitching ? "Switching..." : "Switch Network"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
