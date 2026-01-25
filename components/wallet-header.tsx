import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import * as Haptics from "expo-haptics";
import { useThemeContext } from "@/lib/theme-provider";
import { setStringAsync } from "expo-clipboard";
import { MotiView } from "moti";

interface WalletHeaderProps {
  address: string | null;
  chainId: number | null;
  onDisconnect?: () => void;
  compact?: boolean; // New: compact mode for space optimization
}

export function WalletHeader({ address, chainId, onDisconnect, compact = false }: WalletHeaderProps) {
  const { colorScheme, setColorScheme } = useThemeContext();
  const [copied, setCopied] = useState(false);
  
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getChainInfo = (id: number | null) => {
    if (!id) return { name: "Unknown", color: "bg-muted" };
    
    const chains: Record<number, { name: string; color: string }> = {
      1: { name: "Ethereum", color: "bg-blue-500" },
      8453: { name: "Base Mainnet", color: "bg-success" },
      137: { name: "Polygon", color: "bg-purple-500" },
      42161: { name: "Arbitrum", color: "bg-blue-400" },
    };
    
    return chains[id] || { name: `Chain ${id}`, color: "bg-muted" };
  };

  const handleCopyAddress = async () => {
    if (address) {
      try {
        await setStringAsync(address);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCopied(true);
        
        // Reset copied state after animation
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (error) {
        console.error("Failed to copy address:", error);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
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
      <View className="px-4 pt-2 pb-1">
        <View className="flex-row items-center justify-between">
          {/* Left: Wallet Info with Gradient Background */}
          <TouchableOpacity
            onPress={handleCopyAddress}
            className="flex-1 mr-3"
            activeOpacity={0.7}
          >
            <MotiView
              animate={{
                scale: copied ? [1, 1.02, 1] : 1,
                backgroundColor: copied 
                  ? (colorScheme === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                  : (colorScheme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)'),
              }}
              transition={{ type: 'timing', duration: 300 }}
              className="rounded-2xl px-4 py-3 border border-primary/20"
            >
              <View className="flex-row items-center">
                {/* Avatar with Gradient */}
                <View className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 items-center justify-center mr-3 shadow-lg">
                  <Text className="text-lg">{copied ? "✓" : "👤"}</Text>
                </View>
                
                {/* Address Info */}
                <View className="flex-1">
                  <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
                    {copied ? "Address Copied!" : formatAddress(address)}
                  </Text>
                  {copied && (
                    <MotiView
                      from={{ opacity: 0, translateY: 5 }}
                      animate={{ opacity: 1, translateY: 0 }}
                      transition={{ type: 'timing', duration: 200 }}
                    >
                      <Text className="text-xs text-success font-semibold mt-0.5">Tap to copy again</Text>
                    </MotiView>
                  )}
                </View>
                
                {/* Copy Icon */}
                <MotiView
                  animate={{
                    scale: copied ? [1, 1.3, 1] : 1,
                    opacity: copied ? 1 : 0.6,
                  }}
                  transition={{ type: 'spring', duration: 400 }}
                  className="ml-2"
                >
                  <Text className="text-xl">{copied ? "✓" : "📋"}</Text>
                </MotiView>
              </View>
            </MotiView>
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
              <MotiView
                animate={{
                  scale: copied ? [1, 1.1, 1] : 1,
                }}
                transition={{ type: 'spring', duration: 400 }}
              >
                <View className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-success items-center justify-center shadow-lg">
                  <Text className="text-xl">{copied ? "✓" : "👤"}</Text>
                </View>
              </MotiView>
              {/* Online Status Indicator / Copy Success */}
              <MotiView
                animate={{
                  scale: copied ? [1, 1.3, 1] : 1,
                  backgroundColor: copied ? '#22c55e' : '#22c55e',
                }}
                transition={{ type: 'spring', duration: 300 }}
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-surface"
              />
            </View>
            
            <View className="flex-1">
              <MotiView
                animate={{
                  opacity: copied ? 1 : 0.7,
                }}
                transition={{ type: 'timing', duration: 200 }}
              >
                <Text className="text-xs text-muted font-semibold mb-1 uppercase tracking-wider">
                  {copied ? "Copied to Clipboard" : "Connected Wallet"}
                </Text>
              </MotiView>
              <View className="flex-row items-center gap-2">
                <Text className="text-base font-bold text-foreground">
                  {formatAddress(address)}
                </Text>
                <MotiView
                  animate={{
                    scale: copied ? [1, 1.2, 1] : 1,
                    opacity: copied ? 1 : 0.5,
                  }}
                  transition={{ type: 'spring', duration: 400 }}
                >
                  <Text className="text-sm">{copied ? "✓" : "📋"}</Text>
                </MotiView>
              </View>
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
