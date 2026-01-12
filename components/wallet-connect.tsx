/**
 * Modern Wallet Connection Component
 * Patterns from Uniswap, Aave, Curve DeFi apps
 * 
 * Features:
 * - Inline wallet selection (no modal)
 * - One-tap connection
 * - Clear connection status
 * - Beautiful animations
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Animated } from "react-native";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import * as Haptics from "expo-haptics";

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

const WALLETS: WalletOption[] = [
  {
    id: "metamask",
    name: "MetaMask",
    icon: "🦊",
    color: "#F6851B",
    description: "Most popular Web3 wallet",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    icon: "🔵",
    color: "#0052FF",
    description: "Easy to use for beginners",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    icon: "💎",
    color: "#3375BB",
    description: "Secure multi-chain wallet",
  },
  {
    id: "rainbow",
    name: "Rainbow",
    icon: "🌈",
    color: "#FF5CA0",
    description: "Beautiful mobile wallet",
  },
];

interface WalletConnectProps {
  onConnected?: () => void;
  compact?: boolean;
}

export function WalletConnect({ onConnected, compact = false }: WalletConnectProps) {
  const { connectWallet, isConnecting, error } = useWeb3();
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [scaleAnim] = useState(new Animated.Value(1));

  const handleConnect = async (walletId: string) => {
    if (isConnecting) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedWallet(walletId);

    // Button press animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      await connectWallet(walletId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConnected?.();
    } catch (err: any) {
      console.error("Connection failed:", err);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSelectedWallet(null);
    }
  };

  if (compact) {
    return (
      <View className="gap-3">
        {WALLETS.slice(0, 2).map((wallet) => (
          <TouchableOpacity
            key={wallet.id}
            onPress={() => handleConnect(wallet.id)}
            disabled={isConnecting}
            className={`flex-row items-center p-4 rounded-2xl border-2 ${
              isConnecting && selectedWallet === wallet.id
                ? "bg-primary/10 border-primary"
                : "bg-surface border-border"
            } active:opacity-70`}
          >
            <View className="bg-white/10 p-3 rounded-xl mr-3">
              <Text className="text-3xl">{wallet.icon}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-foreground">
                {wallet.name}
              </Text>
            </View>
            {isConnecting && selectedWallet === wallet.id ? (
              <ActivityIndicator size="small" color="#F7931A" />
            ) : (
              <Text className="text-xl text-muted">›</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <View>
      {/* Header */}
      <View className="mb-6">
        <Text className="text-2xl font-bold text-foreground mb-2">
          Connect Your Wallet
        </Text>
        <Text className="text-base text-muted">
          Choose your preferred wallet to get started
        </Text>
      </View>

      {/* Error Message */}
      {error && !isConnecting && (
        <View className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center">
            <Text className="text-2xl mr-2">⚠️</Text>
            <Text className="flex-1 text-sm text-destructive font-medium">
              {error}
            </Text>
          </View>
        </View>
      )}

      {/* Wallet Grid */}
      <View className="gap-3">
        {WALLETS.map((wallet) => {
          const isSelected = selectedWallet === wallet.id;
          const isLoading = isConnecting && isSelected;

          return (
            <TouchableOpacity
              key={wallet.id}
              onPress={() => handleConnect(wallet.id)}
              disabled={isConnecting}
              className={`flex-row items-center p-5 rounded-2xl border-2 ${
                isLoading
                  ? "bg-primary/10 border-primary"
                  : "bg-surface border-border"
              } ${isConnecting ? "opacity-50" : "active:opacity-80"}`}
            >
              {/* Icon */}
              <View className="bg-white/10 p-4 rounded-2xl mr-4">
                <Text className="text-4xl">{wallet.icon}</Text>
              </View>

              {/* Info */}
              <View className="flex-1">
                <Text className="text-lg font-bold text-foreground mb-1">
                  {wallet.name}
                </Text>
                <Text className="text-sm text-muted">
                  {wallet.description}
                </Text>
              </View>

              {/* Status */}
              {isLoading ? (
                <ActivityIndicator size="small" color="#F7931A" />
              ) : (
                <View className="bg-primary/20 px-4 py-2 rounded-full">
                  <Text className="text-sm font-semibold text-primary">
                    Connect
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Connection Status */}
      {isConnecting && (
        <View className="mt-6 p-4 bg-info/10 border border-info/30 rounded-2xl">
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color="#3B82F6" className="mr-3" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-info mb-1">
                Opening wallet app...
              </Text>
              <Text className="text-xs text-muted">
                Please approve the connection in your wallet
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Footer */}
      <View className="mt-6 pt-6 border-t border-border">
        <Text className="text-xs text-muted text-center leading-5">
          By connecting, you agree to our Terms of Service and acknowledge that you have read our Privacy Policy
        </Text>
      </View>

      {/* Help Section */}
      <View className="mt-4 p-4 bg-surface rounded-2xl border border-border">
        <View className="flex-row items-start">
          <Text className="text-2xl mr-3">💡</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground mb-1">
              New to crypto wallets?
            </Text>
            <Text className="text-xs text-muted leading-5">
              A wallet lets you connect to decentralized apps. We recommend starting with MetaMask or Coinbase Wallet.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
