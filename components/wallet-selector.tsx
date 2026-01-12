import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useWeb3, SUPPORTED_WALLETS, WalletId } from "@/lib/web3-walletconnect-v2";

interface Props {
  onConnected?: () => void;
}

export function WalletSelector({ onConnected }: Props) {
  const { connectWallet, cancelConnection, isConnecting, error } = useWeb3();
  const [selectedWallet, setSelectedWallet] = useState<WalletId | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const [canCancel, setCanCancel] = useState(false);

  const handleConnect = async (walletId: WalletId) => {
    setSelectedWallet(walletId);
    setLastError(null);
    setShowSlowWarning(false);
    setCanCancel(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Allow cancellation after 10 seconds
    const cancelTimer = setTimeout(() => {
      setCanCancel(true);
    }, 10000); // 10 seconds
    
    // Show warning if taking too long
    const warningTimer = setTimeout(() => {
      setShowSlowWarning(true);
    }, 15000); // 15 seconds
    
    try {
      await connectWallet(walletId);
      clearTimeout(cancelTimer);
      clearTimeout(warningTimer);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConnected?.();
    } catch (err: any) {
      clearTimeout(cancelTimer);
      clearTimeout(warningTimer);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLastError(err.message || "Connection failed");
      setSelectedWallet(null);
      setShowSlowWarning(false);
      setCanCancel(false);
    }
  };

  const handleCancel = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    console.log("🚫 User canceling connection to choose different wallet...");
    
    // Cancel the ongoing connection attempt
    await cancelConnection();
    
    // Clear the selected wallet so user can immediately choose another
    setSelectedWallet(null);
    setCanCancel(false);
    setShowSlowWarning(false);
    
    console.log("✅ Ready to select new wallet");
  };

  // Convert wallet object to array for rendering
  const wallets = Object.entries(SUPPORTED_WALLETS).map(([_, wallet]) => wallet);

  return (
    <View className="flex-1">
      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-foreground mb-2">
          Connect Wallet
        </Text>
        <Text className="text-base text-muted">
          Choose your preferred wallet to get started
        </Text>
      </View>

      {/* Wallet Grid */}
      <ScrollView 
        className="flex-1"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3 mb-6">
          {wallets.map((wallet) => {
            const isSelected = selectedWallet === wallet.id;
            // Only disable other wallets if connecting AND cancel not available
            const isDisabled = isConnecting && selectedWallet !== null && !canCancel && !isSelected;
            
            return (
              <TouchableOpacity
                key={wallet.id}
                onPress={() => handleConnect(wallet.id)}
                disabled={isDisabled}
                className={`bg-surface rounded-3xl p-5 border-2 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border"
                } ${isDisabled ? "opacity-30" : "active:opacity-70"}`}
              >
                <View className="flex-row items-center">
                  {/* Wallet Icon */}
                  <View className="w-14 h-14 rounded-2xl bg-background items-center justify-center mr-4 overflow-hidden">
                    <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                      <Text className="text-2xl">🔷</Text>
                    </View>
                  </View>

                  {/* Wallet Info */}
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-foreground mb-1">
                      {wallet.name}
                    </Text>
                    <Text className="text-xs text-muted">
                      {isConnecting && isSelected
                        ? "Opening wallet..."
                        : isDisabled
                        ? "Please wait..."
                        : "Tap to connect"}
                    </Text>
                  </View>

                  {/* Loading or Arrow */}
                  <View className="w-8 h-8 items-center justify-center">
                    {isConnecting && isSelected ? (
                      <ActivityIndicator size="small" color="#F7931A" />
                    ) : (
                      <Text className="text-muted text-xl">→</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Cancel Button - shows after 10 seconds */}
        {canCancel && isConnecting && (
          <View className="mb-6">
            <TouchableOpacity
              onPress={handleCancel}
              className="bg-surface rounded-2xl p-4 border-2 border-warning/30 active:opacity-70"
            >
              <View className="flex-row items-center justify-center">
                <Text className="text-base font-semibold text-warning mr-2">
                  ✕ Choose Different Wallet
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Error Display with Retry */}
        {(error || lastError) && (
          <View className="bg-destructive/10 rounded-2xl p-4 border border-destructive/30 mb-6">
            <View className="flex-row items-start">
              <Text className="text-2xl mr-3">⚠️</Text>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-destructive mb-1">
                  Connection Failed
                </Text>
                <Text className="text-xs text-destructive/80 mb-3">
                  {error || lastError}
                </Text>
                {selectedWallet && (
                  <TouchableOpacity
                    onPress={() => handleConnect(selectedWallet)}
                    disabled={isConnecting}
                    className="bg-destructive/20 rounded-lg px-4 py-2 self-start active:opacity-70"
                  >
                    <Text className="text-xs font-semibold text-destructive">
                      {isConnecting ? "Retrying..." : "Try Again"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Slow Connection Warning */}
        {showSlowWarning && isConnecting && (
          <View className="bg-warning/10 rounded-2xl p-4 border border-warning/30 mb-6">
            <View className="flex-row items-start">
              <Text className="text-2xl mr-3">⏳</Text>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-warning mb-1">
                  Taking Longer Than Expected
                </Text>
                <Text className="text-xs text-warning/80">
                  Please check that your wallet app is open and responding. You can choose a different wallet or wait up to 2 minutes.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Info Card */}
        <View className="bg-primary/5 rounded-2xl p-5 border border-primary/20 mb-4">
          <View className="flex-row items-start">
            <Text className="text-xl mr-3">💡</Text>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground mb-2">
                What is a Wallet?
              </Text>
              <Text className="text-xs text-muted leading-5">
                A wallet lets you connect to BTC1USD and manage your funds. 
                We recommend MetaMask or Rainbow for the best experience.
              </Text>
            </View>
          </View>
        </View>

        {/* Security Note */}
        <View className="bg-surface rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-center">
            <View className="w-2 h-2 rounded-full bg-success mr-2" />
            <Text className="text-xs text-muted">
              Secured by WalletConnect
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
