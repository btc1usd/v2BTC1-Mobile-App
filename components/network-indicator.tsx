/**
 * State-of-the-Art Network Indicator Component
 * Pattern from Uniswap, Aave, and MetaMask mobile apps
 */

import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { getNetworkInfo } from "@/lib/network-manager";
import * as Haptics from "expo-haptics";

interface NetworkIndicatorProps {
  chainId: number | null;
  size?: "small" | "medium" | "large";
  showName?: boolean;
  onPress?: () => void;
}

export function NetworkIndicator({
  chainId,
  size = "medium",
  showName = true,
  onPress,
}: NetworkIndicatorProps) {
  const networkInfo = getNetworkInfo(chainId);

  const handlePress = async () => {
    if (onPress) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  // Size variants
  const sizeStyles = {
    small: {
      container: "px-2 py-1",
      text: "text-xs",
      dot: "w-1.5 h-1.5",
    },
    medium: {
      container: "px-3 py-1.5",
      text: "text-sm",
      dot: "w-2 h-2",
    },
    large: {
      container: "px-4 py-2",
      text: "text-base",
      dot: "w-2.5 h-2.5",
    },
  };

  const styles = sizeStyles[size];

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Component
      onPress={onPress ? handlePress : undefined}
      className={`flex-row items-center ${styles.container} rounded-lg border ${
        networkInfo.isCorrect
          ? "bg-success/10 border-success/30"
          : "bg-destructive/10 border-destructive/30"
      } ${onPress ? "active:opacity-70" : ""}`}
    >
      {/* Status Dot */}
      <View
        className={`${styles.dot} rounded-full mr-2`}
        style={{
          backgroundColor: networkInfo.color,
        }}
      />

      {/* Network Name */}
      {showName && (
        <Text
          className={`${styles.text} font-semibold`}
          style={{
            color: networkInfo.color,
          }}
        >
          {networkInfo.shortName}
        </Text>
      )}

      {/* Wrong Network Warning */}
      {!networkInfo.isCorrect && (
        <Text className={`${styles.text} font-bold ml-1`}>
          {networkInfo.icon}
        </Text>
      )}
    </Component>
  );
}

/**
 * Full Network Status Banner
 * Shows prominent warning when on wrong network with functional switch button
 */
interface NetworkBannerProps {
  chainId: number | null;
  onSwitchSuccess?: () => void;
}

export function NetworkBanner({ chainId, onSwitchSuccess }: NetworkBannerProps) {
  const { switchChain } = require("@/lib/web3-walletconnect-v2").useWeb3();
  const networkInfo = getNetworkInfo(chainId);
  const [isSwitching, setIsSwitching] = React.useState(false);

  // Don't show banner if on correct network
  if (networkInfo.isCorrect) {
    return null;
  }

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { DEFAULT_CHAIN_ID } = require("@/lib/network-manager");
      
      await switchChain(DEFAULT_CHAIN_ID);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "✅ Network Switched",
        "Successfully switched to Base Sepolia network.",
        [{ text: "OK" }]
      );
      onSwitchSuccess?.();
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "❌ Switch Failed",
        error.message || "Failed to switch network. Please switch manually in your wallet app.",
        [{ text: "OK" }]
      );
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <View className="bg-gradient-to-br from-warning/20 to-destructive/20 rounded-3xl p-6 mb-4 border-2 border-warning/40 shadow-lg">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1">
          <View className="w-12 h-12 rounded-full bg-warning/20 items-center justify-center mr-3">
            <Text className="text-3xl">⚠️</Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground mb-1">Wrong Network</Text>
            <Text className="text-xs text-muted">
              Connected to {networkInfo.name}
            </Text>
          </View>
        </View>
      </View>

      <View className="bg-background/50 rounded-2xl p-3 mb-4">
        <Text className="text-sm text-muted text-center">
          This app requires <Text className="font-bold text-primary">Base Sepolia</Text> network
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleSwitchNetwork}
        disabled={isSwitching}
        className={`bg-primary px-6 py-4 rounded-2xl flex-row items-center justify-center shadow-md ${
          isSwitching ? 'opacity-50' : 'active:opacity-80'
        }`}
      >
        {isSwitching ? (
          <>
            <Text className="text-base font-bold text-white mr-2">Switching</Text>
            <Text className="text-white">⏳</Text>
          </>
        ) : (
          <>
            <Text className="text-base font-bold text-white mr-2">Switch to Base Sepolia</Text>
            <Text className="text-white">→</Text>
          </>
        )}
      </TouchableOpacity>

      <Text className="text-xs text-muted text-center mt-3 leading-4">
        💡 Your wallet will prompt you to approve the network change
      </Text>
    </View>
  );
}

/**
 * Compact Network Chip (for headers/top bars)
 */
export function NetworkChip({ chainId }: { chainId: number | null }) {
  const networkInfo = getNetworkInfo(chainId);

  return (
    <View
      className="flex-row items-center px-2 py-1 rounded-full"
      style={{
        backgroundColor: `${networkInfo.color}20`,
      }}
    >
      <View
        className="w-1.5 h-1.5 rounded-full mr-1.5"
        style={{
          backgroundColor: networkInfo.color,
        }}
      />
      <Text
        className="text-xs font-semibold"
        style={{
          color: networkInfo.color,
        }}
      >
        {networkInfo.shortName}
      </Text>
    </View>
  );
}
