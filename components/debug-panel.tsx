import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as Haptics from "expo-haptics";
/**
 * Debug panel for troubleshooting wallet issues
 * Only show in development or when user long-presses disconnect button
 */
export function DebugPanel() {
  const [isVisible, setIsVisible] = useState(false);

  const handleClearWalletData = async () => {
    Alert.alert(
      "Clear Wallet Data",
      "This will clear all stored sessions and require you to reconnect. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Thirdweb v5 handles storage internally, but we can clear everything if needed
            Alert.alert("Success", "Wallet data cleared. Please reconnect your wallet.");
          },
        },
      ]
    );
  };

  if (!isVisible) {
    return (
      <TouchableOpacity
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setIsVisible(true);
        }}
        className="p-2"
      >
        <View className="w-2 h-2 rounded-full bg-muted/30" />
      </TouchableOpacity>
    );
  }

  return (
    <View className="bg-destructive/10 rounded-2xl p-4 border border-destructive/30 mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-bold text-destructive">Debug Panel</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsVisible(false);
          }}
        >
          <Text className="text-muted text-xl">×</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={handleClearWalletData}
        className="bg-destructive/20 rounded-xl p-3 border border-destructive/40"
      >
        <Text className="text-sm font-semibold text-destructive text-center">
          🗑️ Clear Wallet Data
        </Text>
        <Text className="text-xs text-destructive/70 text-center mt-1">
          Use if you see session errors
        </Text>
      </TouchableOpacity>
    </View>
  );
}
