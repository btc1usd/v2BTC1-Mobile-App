import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";

interface NetworkSwitchModalProps {
  visible: boolean;
  currentChainId: number | null;
  targetChainId: number;
  targetChainName: string;
  onSwitch: () => Promise<void>;
  onCancel: () => void;
  isSwitching?: boolean;
}

export function NetworkSwitchModal({
  visible,
  currentChainId,
  targetChainId,
  targetChainName,
  onSwitch,
  onCancel,
  isSwitching = false,
}: NetworkSwitchModalProps) {
  const handleSwitch = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await onSwitch();
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  const getChainName = (chainId: number | null) => {
    if (!chainId) return "Unknown";
    const chains: Record<number, string> = {
      1: "Ethereum",
      8453: "Base",
      84532: "Base Sepolia",
      137: "Polygon",
      42161: "Arbitrum",
    };
    return chains[chainId] || `Chain ${chainId}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View className="flex-1 bg-black/60 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleCancel}
          className="flex-1"
        />
        
        <View className="bg-surface rounded-t-3xl p-6 border-t-2 border-border">
          {/* Icon */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-warning/20 items-center justify-center mb-4">
              <Text className="text-4xl">⚠️</Text>
            </View>
            <Text className="text-2xl font-bold text-foreground mb-2">
              Wrong Network
            </Text>
            <Text className="text-sm text-muted text-center">
              Please switch to the correct network to continue
            </Text>
          </View>

          {/* Network Info */}
          <View className="bg-background rounded-2xl p-4 mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs text-muted uppercase tracking-wide">
                Current Network
              </Text>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-destructive mr-2" />
                <Text className="text-sm font-semibold text-destructive">
                  {getChainName(currentChainId)}
                </Text>
              </View>
            </View>

            <View className="h-px bg-border my-2" />

            <View className="flex-row items-center justify-between mt-3">
              <Text className="text-xs text-muted uppercase tracking-wide">
                Required Network
              </Text>
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-success mr-2" />
                <Text className="text-sm font-semibold text-success">
                  {targetChainName}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="gap-3">
            <TouchableOpacity
              onPress={handleSwitch}
              disabled={isSwitching}
              className={`py-4 rounded-2xl items-center ${
                isSwitching ? "bg-primary/50" : "bg-primary"
              }`}
            >
              {isSwitching ? (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text className="text-white font-bold ml-2">
                    Switching Network...
                  </Text>
                </View>
              ) : (
                <Text className="text-white font-bold text-lg">
                  Switch to {targetChainName}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCancel}
              disabled={isSwitching}
              className="py-4 rounded-2xl items-center bg-surface border-2 border-border"
            >
              <Text className="text-foreground font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View className="mt-4 p-3 bg-primary/5 rounded-xl">
            <Text className="text-xs text-muted text-center">
              💡 This will open your wallet to approve the network switch
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
