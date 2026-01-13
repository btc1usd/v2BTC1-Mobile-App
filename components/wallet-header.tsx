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

  // Compact mode - Beautiful modern design
  if (compact) {
    return (
      <View className="px-6 pt-4 pb-3">
        <View className="flex-row items-center justify-between">
          {/* Left: Wallet Info with Gradient Background */}
          <TouchableOpacity
            onPress={handleCopyAddress}
            className="flex-1 mr-3"
            activeOpacity={0.7}
          >
            <View className="bg-gradient-to-r from-primary/10 to-success/10 rounded-2xl px-4 py-3 border border-primary/20">
              <View className="flex-row items-center">
                {/* Avatar with Gradient */}
                <View className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 items-center justify-center mr-3 shadow-lg">
                  <Text className="text-lg">👤</Text>
                </View>
                
                {/* Address Info */}
                <View className="flex-1">
                  <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
                    {formatAddress(address)}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Right: Actions Column */}
          <View className="gap-2">
            {/* Network Badge with Glow */}
            <View className="bg-surface rounded-xl px-3 py-2 border border-border shadow-sm">
              <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full ${chainInfo.color} mr-2 shadow-md`} />
                <Text className="text-xs font-bold text-foreground">
                  {chainInfo.name}
                </Text>
              </View>
            </View>

            {/* Action Buttons Row */}
            <View className="flex-row gap-2">
              {/* Theme Toggle with Icon */}
              <TouchableOpacity
                onPress={handleToggleTheme}
                className="bg-surface rounded-xl px-3 py-2 border border-border shadow-sm items-center justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-base">{colorScheme === "dark" ? "🌙" : "☀️"}</Text>
              </TouchableOpacity>
              
              {/* Disconnect Button - White in Dark Mode */}
              {onDisconnect && (
                <TouchableOpacity
                  onPress={handleDisconnect}
                  className="bg-gradient-to-r from-destructive/30 to-destructive/20 rounded-xl px-3 py-2 border-2 border-destructive/60 shadow-lg items-center justify-center"
                  activeOpacity={0.7}
                >
                  <Text 
                    className="font-bold text-xl" 
                    style={{ 
                      color: colorScheme === 'dark' ? '#ffffff' : '#ef4444',
                      textShadowColor: 'rgba(0,0,0,0.3)', 
                      textShadowOffset: {width: 0, height: 1}, 
                      textShadowRadius: 2 
                    }}
                  >⏻</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Full mode - Beautiful card design
  return (
    <View className="px-6 pt-4 pb-3">
      <View className="bg-gradient-to-br from-surface via-surface to-primary/5 rounded-3xl p-5 border-2 border-border shadow-xl">
        <View className="flex-row items-center justify-between">
          {/* Left: Wallet Info */}
          <TouchableOpacity
            onPress={handleCopyAddress}
            className="flex-1 flex-row items-center mr-3"
            activeOpacity={0.7}
          >
            {/* Avatar with Gradient Ring */}
            <View className="relative mr-3">
              <View className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-success items-center justify-center shadow-lg">
                <Text className="text-xl">👤</Text>
              </View>
              {/* Online Status Indicator */}
              <View className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-success border-2 border-surface" />
            </View>
            
            <View className="flex-1">
              <Text className="text-xs text-muted font-semibold mb-1 uppercase tracking-wider">Connected Wallet</Text>
              <Text className="text-base font-bold text-foreground">
                {formatAddress(address)}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Right: Network & Actions */}
          <View className="items-end gap-2">
            {/* Network Badge */}
            <View className="bg-background rounded-2xl px-4 py-2.5 flex-row items-center border border-border shadow-sm">
              <View className={`w-2.5 h-2.5 rounded-full ${chainInfo.color} mr-2 shadow-lg`} />
              <Text className="text-sm font-bold text-foreground">
                {chainInfo.name}
              </Text>
            </View>
            
            {/* Action Buttons */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleToggleTheme}
                className="bg-background rounded-xl px-3 py-2 border border-border shadow-sm"
                activeOpacity={0.7}
              >
                <Text className="text-base">{colorScheme === "dark" ? "🌙" : "☀️"}</Text>
              </TouchableOpacity>
              
              {onDisconnect && (
                <TouchableOpacity
                  onPress={handleDisconnect}
                  className="bg-gradient-to-r from-destructive/30 to-destructive/20 rounded-xl px-3 py-2 border-2 border-destructive/60 shadow-lg items-center justify-center"
                  activeOpacity={0.7}
                >
                  <Text 
                    className="font-bold text-2xl" 
                    style={{ 
                      color: colorScheme === 'dark' ? '#ffffff' : '#ef4444',
                      textShadowColor: 'rgba(0,0,0,0.3)', 
                      textShadowOffset: {width: 0, height: 1}, 
                      textShadowRadius: 2 
                    }}
                  >⏻</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
