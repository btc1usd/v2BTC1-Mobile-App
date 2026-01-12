import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useThemeContext } from "@/lib/theme-provider";

interface WalletHeaderProps {
  address: string | null;
  chainId: number | null;
  onDisconnect?: () => void;
  compact?: boolean; // New: compact mode for space optimization
}

export function WalletHeader({ address, chainId, onDisconnect, compact = false }: WalletHeaderProps) {
  const { colorScheme, setColorScheme } = useThemeContext();
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getChainInfo = (id: number | null) => {
    if (!id) return { name: "Unknown", color: "bg-muted" };
    
    const chains: Record<number, { name: string; color: string }> = {
      1: { name: "Ethereum", color: "bg-blue-500" },
      8453: { name: "Base", color: "bg-blue-600" },
      84532: { name: "Base Sepolia", color: "bg-success" },
      137: { name: "Polygon", color: "bg-purple-500" },
      42161: { name: "Arbitrum", color: "bg-blue-400" },
    };
    
    return chains[id] || { name: `Chain ${id}`, color: "bg-muted" };
  };

  const handleCopyAddress = async () => {
    if (address) {
      // Industry standard: Show full address with truncated version
      Alert.alert(
        "Wallet Address",
        `${address}\n\n${formatAddress(address)}`,
        [{ text: "OK" }]
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  };

  const handleDisconnect = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDisconnect?.();
  };

  if (!address) return null;

  const chainInfo = getChainInfo(chainId);

  // Compact mode - optimized for space
  if (compact) {
    return (
      <View className="px-6 pt-3 pb-2">
        {/* First Row: Address and Network */}
        <View className="flex-row items-center justify-between mb-2">
          {/* Left: Address - Full display */}
          <TouchableOpacity
            onPress={handleCopyAddress}
            className="flex-row items-center flex-1 mr-2"
            activeOpacity={0.7}
          >
            <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center mr-2">
              <Text className="text-base">👤</Text>
            </View>
            <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
              {address}
            </Text>
          </TouchableOpacity>

          {/* Right: Network Badge */}
          <View className="bg-surface rounded-full px-3 py-1.5 flex-row items-center border border-border">
            <View className={`w-1.5 h-1.5 rounded-full ${chainInfo.color} mr-1.5`} />
            <Text className="text-xs font-semibold text-foreground">
              {chainInfo.name}
            </Text>
          </View>
        </View>

        {/* Second Row: Theme Toggle and Disconnect */}
        <View className="flex-row items-center justify-end gap-2">
          {/* Theme Toggle */}
          <TouchableOpacity
            onPress={handleToggleTheme}
            className="bg-surface w-8 h-8 rounded-full border border-border items-center justify-center"
            activeOpacity={0.7}
          >
            <Text className="text-sm">{colorScheme === "dark" ? "🌙" : "☀️"}</Text>
          </TouchableOpacity>
          
          {/* Disconnect Button */}
          {onDisconnect && (
            <TouchableOpacity
              onPress={handleDisconnect}
              className="bg-surface px-3 py-1.5 rounded-full border border-border"
              activeOpacity={0.7}
            >
              <Text className="text-xs font-medium text-muted">Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Full mode - original design

  return (
    <View className="px-6 pt-4 pb-3">
      <View className="bg-surface rounded-2xl p-4 border border-border">
        <View className="flex-row items-center justify-between">
          {/* Left: Address */}
          <TouchableOpacity
            onPress={handleCopyAddress}
            className="flex-1 flex-row items-center"
            activeOpacity={0.7}
          >
            <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center mr-3">
              <Text className="text-lg">👤</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-muted mb-1">Connected Wallet</Text>
              <Text className="text-sm font-bold text-foreground">
                {formatAddress(address)}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Right: Network Badge */}
          <View className="flex-row items-center gap-2">
            <View className="bg-background rounded-full px-3 py-2 flex-row items-center">
              <View className={`w-2 h-2 rounded-full ${chainInfo.color} mr-2`} />
              <Text className="text-xs font-semibold text-foreground">
                {chainInfo.name}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
