import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  AppState,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { useVaultStats } from "@/hooks/use-vault-stats-simple";
import { useBtc1Balance } from "@/hooks/use-btc1-balance-simple";
import { useNetworkEnforcement } from "@/hooks/use-network-enforcement";
import { redeemBTC1WithPermit, getTxUrl } from "@/lib/contract-utils";
import { COLLATERAL_TOKENS } from "@/lib/shared/contracts";
import { NetworkBanner } from "@/components/network-indicator";
import { NetworkGuard } from "@/components/network-guard";
import { WalletHeader } from "@/components/wallet-header";
import { useWallet } from "@/hooks/use-wallet-wc";

type RedeemStep = "idle" | "signing" | "success" | "error";

export default function RedeemScreen() {
  const web3 = useWeb3();
  const {
    address,
    isConnected,
    chainId,
    signer,
    wcProvider,
    readProvider,
  } = web3;
  const { disconnectWallet } = useWallet();

  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(COLLATERAL_TOKENS[0]);
  const [step, setStep] = useState<RedeemStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false); // Lock state during transaction
  
  // Scroll ref for auto-scroll to button
  const scrollViewRef = useRef<ScrollView>(null);

  // Keep loading state visible when app returns from wallet
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && isProcessing) {
        console.log("🔄 App returned to foreground - keeping loading state");
        // Keep the loading state - don't reset
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isProcessing]);

  const { enforceNetwork } = useNetworkEnforcement({
    provider: readProvider,
    wcProvider,
    chainId,
    isConnected,
  });

  const { collateralRatio, isLoading: isVaultLoading, btcPrice } = useVaultStats();
  const { balance, formattedBalance } = useBtc1Balance();
  const hasBalance = balance > 0;

  // Redeem calculation
  const redeemOutput = useMemo(() => {
    if (!amount || Number(amount) <= 0) {
      return { out: "0.00000000", fee: "0.00000000", net: "0.00000000", type: "stable" };
    }
    
    const btc1Amount = Number(amount);
    const ratioNum = Math.max(Number(collateralRatio) / 100, 1.1);
    
    // Stable redemption (CR >= 110%): 1:1
    // Stress redemption (CR < 110%): CR * 0.90
    let usdValue = btc1Amount;
    let redeemType = "stable";
    
    if (ratioNum < 1.10) {
      const stressPrice = ratioNum * 0.90;
      usdValue = btc1Amount * stressPrice;
      redeemType = "stress";
    }
    
    const collateralOut = usdValue / (btcPrice || 100000);
    const devFee = collateralOut * 0.001; // 0.1%
    const netAmount = collateralOut - devFee;
    
    return {
      out: collateralOut.toFixed(8),
      fee: devFee.toFixed(8),
      net: netAmount.toFixed(8),
      type: redeemType,
    };
  }, [amount, collateralRatio, btcPrice]);

  const canRedeem = amount && Number(amount) > 0 && Number(amount) <= balance && step === "idle";

  const handleRedeem = async () => {
    if (!signer || !wcProvider || !address) return;

    const ok = await enforceNetwork("Redeem BTC1");
    if (!ok) return;

    if (Number(amount) > balance) {
      setError("Insufficient balance");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      setError("");
      setStep("signing");
      setIsProcessing(true); // Lock UI
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // OPTIMIZED: Get signer directly - no session wake delay
      console.log("🚀 Starting redeem flow (lightning fast)...");
      
      const { ethers } = await import("ethers");
      const freshProvider = new ethers.BrowserProvider(wcProvider);
      const freshSigner = await freshProvider.getSigner();

      console.log("📝 [UI] Calling redeemBTC1WithPermit...");
      const result = await redeemBTC1WithPermit(amount, selectedToken.address, freshSigner);
      
      console.log("✅ [UI] Redeem result:", result.success, result.txHash);

      if (!result.success) {
        console.error("❌ [UI] Redeem failed:", result.error);
        throw new Error(result.error);
      }

      setTxHash(result.txHash!);
      setStep("success");
      setIsProcessing(false); // Unlock UI
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        setAmount("");
        setStep("idle");
        setTxHash("");
      }, 5000);
    } catch (e: any) {
      console.error("❌ [UI] Redeem error caught:", e);
      const msg = e.message?.includes("rejected") || e.message?.includes("user rejected") 
        ? "Transaction cancelled" 
        : e.message || "Transaction failed";
      setError(msg);
      setStep("error");
      setIsProcessing(false); // Unlock UI
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setStep("idle"), 4000);
    }
  };

  const setMaxAmount = () => {
    setAmount(formattedBalance);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─────────────────────────────────────────────────────────────
  // GUARDS
  // ─────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <Text className="text-4xl">🔐</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mb-2">Connect Wallet</Text>
          <Text className="text-base text-muted text-center">
            Connect your wallet to redeem BTC1 tokens
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (step === "success") {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center">
          <View className="w-24 h-24 rounded-full bg-success/20 items-center justify-center mb-6">
            <Text className="text-5xl">✓</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mb-2">Redeem Successful!</Text>
          <Text className="text-base text-muted text-center mb-2">
            You received ~{redeemOutput.net} {selectedToken.symbol}
          </Text>
          {txHash && (
            <TouchableOpacity
              onPress={() => Linking.openURL(getTxUrl(txHash, chainId === 84532))}
              className="mt-4 bg-primary/10 px-6 py-3 rounded-full"
            >
              <Text className="text-primary font-semibold">View Transaction →</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScreenContainer>
    );
  }

  if (step === "signing") {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center w-full">
          {/* Progress Steps */}
          <View className="flex-row items-center justify-center mb-8 w-full px-4">
            {/* Sign Step */}
            <View className="items-center flex-1">
              <View 
                className="w-14 h-14 rounded-full items-center justify-center bg-primary shadow-lg"
                style={{
                  shadowColor: '#F7931A',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                  elevation: 8,
                }}
              >
                <Text className="text-2xl">✍️</Text>
              </View>
              <Text className="text-xs mt-2 font-bold text-primary" style={{ opacity: 1 }}>Sign</Text>
            </View>
            
            {/* Connecting Line */}
            <View 
              className="h-1.5 flex-1 mx-2 rounded-full bg-border"
              style={{ opacity: 0.4 }}
            />
            
            {/* Confirm Step */}
            <View className="items-center flex-1">
              <View 
                className="w-14 h-14 rounded-full items-center justify-center bg-border shadow-lg"
                style={{
                  shadowColor: '#666',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.6,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              >
                <Text className="text-2xl">⚡</Text>
              </View>
              <Text className="text-xs mt-2 font-bold text-muted" style={{ opacity: 0.7 }}>Confirm</Text>
            </View>
          </View>

          {/* Spinner & Message */}
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <ActivityIndicator size="large" color="#F7931A" />
          </View>
          <Text className="text-2xl mb-3">✍️</Text>
          <Text className="text-xl font-bold text-foreground mb-2">
            Sign & Confirm
          </Text>
          <Text className="text-sm text-muted text-center mb-4">
            Sign the permit and confirm transaction in your wallet
          </Text>
          <Text className="text-xs text-muted/60 text-center px-8">
            📱 Check your wallet app to continue...
          </Text>
          <Text className="text-xs text-muted/60 text-center px-8 mt-2">
            Do not close this screen
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (step === "error") {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center">
          <View className="w-20 h-20 rounded-full bg-destructive/20 items-center justify-center mb-6">
            <Text className="text-4xl">✕</Text>
          </View>
          <Text className="text-xl font-bold text-foreground mb-2">Transaction Failed</Text>
          <Text className="text-sm text-muted text-center mb-4">{error}</Text>
          <TouchableOpacity
            onPress={() => setStep("idle")}
            className="bg-primary px-6 py-3 rounded-full"
          >
            <Text className="text-white font-semibold">Try Again</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Main UI
  // ─────────────────────────────────────────────────────────────
  return (
    <NetworkGuard>
      <ScreenContainer>
        {/* Uniform Header - Wallet & Network */}
        <WalletHeader address={address} chainId={chainId} compact onDisconnect={disconnectWallet} />
          
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="px-6 pt-2 pb-2">
            <NetworkBanner chainId={chainId} wcProvider={wcProvider} />
          </View>

          <View className="px-6">
            <Text className="text-3xl font-bold text-foreground mb-1">Redeem BTC1</Text>
            <Text className="text-sm text-muted mb-6">
              Burn BTC1 coins to withdraw Bitcoin collateral
            </Text>

            {/* ───────── BURN CARD ───────── */}
            <View className="bg-surface rounded-3xl p-5 mb-3 border border-border">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xs font-medium text-muted uppercase tracking-wide">You Burn</Text>
                <View className="flex-row items-center">
                  <Text className="text-xs text-muted mr-2">
                    Balance: {Number(formattedBalance).toFixed(4)}
                  </Text>
                  {hasBalance && (
                    <TouchableOpacity
                      onPress={setMaxAmount}
                      className="bg-primary/10 px-2 py-1 rounded-md"
                    >
                      <Text className="text-xs font-bold text-primary">MAX</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View className="flex-row items-center">
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  onBlur={() => {
                    // Auto-scroll to button when user finishes entering (keyboard dismisses)
                    if (amount && Number(amount) > 0) {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 100);
                    }
                  }}
                  placeholder="0"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  className="flex-1 text-4xl font-bold text-foreground"
                />
                
                <View className="flex-row items-center bg-background rounded-full px-3 py-2 ml-2">
                  <View className="w-7 h-7 rounded-full bg-success/20 items-center justify-center mr-2">
                    <Text className="text-sm font-bold text-success">$</Text>
                  </View>
                  <Text className="font-bold text-foreground">BTC1</Text>
                </View>
              </View>

              {amount && Number(amount) > 0 && (
                <Text className="text-sm text-muted mt-2">
                  ≈ ${(Number(amount)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </Text>
              )}
            </View>

            {/* Swap Arrow */}
            <View className="items-center -my-2 z-10">
              <View className="w-10 h-10 rounded-full bg-surface border-4 border-background items-center justify-center">
                <Text className="text-lg">↓</Text>
              </View>
            </View>

            {/* ───────── RECEIVE CARD ───────── */}
            <View className="bg-surface rounded-3xl p-5 mb-6 border border-border">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xs font-medium text-muted uppercase tracking-wide">You Receive</Text>
              </View>

              <View className="flex-row items-center">
                <Text className="flex-1 text-4xl font-bold text-foreground">
                  {redeemOutput.net === "0.00000000" ? "0" : redeemOutput.net}
                </Text>
                
                <View className="flex-row items-center bg-background rounded-full px-3 py-2 ml-2">
                  <View className="w-7 h-7 rounded-full bg-primary/20 items-center justify-center mr-2">
                    <Text className="text-sm font-bold">₿</Text>
                  </View>
                  <Text className="font-bold text-foreground">{selectedToken.symbol}</Text>
                </View>
              </View>
            </View>

            {/* ───────── COLLATERAL SELECTION ───────── */}
            <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
              Select Collateral
            </Text>
            <View className="flex-row gap-2 mb-6">
              {COLLATERAL_TOKENS.map((token) => {
                const isSelected = token.symbol === selectedToken.symbol;

                return (
                  <TouchableOpacity
                    key={token.symbol}
                    onPress={() => {
                      setSelectedToken(token);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    className={`flex-1 p-4 rounded-2xl border-2 ${
                      isSelected
                        ? "bg-primary/10 border-primary"
                        : "bg-surface border-border"
                    }`}
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className={`font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                        {token.symbol}
                      </Text>
                    </View>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {token.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ───────── DETAILS CARD ───────── */}
            <View className="bg-surface rounded-2xl p-4 mb-6 border border-border">
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">Redeem Type</Text>
                <View className={`px-3 py-1 rounded-full ${redeemOutput.type === 'stable' ? 'bg-success/20' : 'bg-warning/20'}`}>
                  <Text className={`text-xs font-bold ${redeemOutput.type === 'stable' ? 'text-success' : 'text-warning'}`}>
                    {redeemOutput.type === 'stable' ? '✓ STABLE' : '⚠ STRESS'}
                  </Text>
                </View>
              </View>
              
              <View className="h-px bg-border my-1" />
              
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">Collateral Ratio</Text>
                {isVaultLoading ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text className="text-sm font-semibold text-foreground">{collateralRatio || "120"}%</Text>
                )}
              </View>
              
              <View className="h-px bg-border my-1" />
              
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">BTC Price</Text>
                <Text className="text-sm font-semibold text-foreground">
                  ${(btcPrice || 100000).toLocaleString()}
                </Text>
              </View>
              
              <View className="h-px bg-border my-1" />
              
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">Dev Fee</Text>
                <Text className="text-sm font-semibold text-foreground">0.1%</Text>
              </View>
              
              <View className="h-px bg-border my-1" />
              
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">Network</Text>
                <Text className="text-sm font-semibold text-success">Base Sepolia</Text>
              </View>
            </View>

            {/* ───────── REDEEM BUTTON ───────── */}
            <TouchableOpacity
              onPress={handleRedeem}
              disabled={!canRedeem}
              className={`py-5 rounded-2xl items-center ${
                canRedeem ? "bg-primary" : "bg-muted/30"
              }`}
            >
              <Text className={`text-lg font-bold ${canRedeem ? "text-white" : "text-muted"}`}>
                {!amount || Number(amount) <= 0
                  ? "Enter Amount"
                  : Number(amount) > balance
                  ? "Insufficient Balance"
                  : "Redeem BTC1"}
              </Text>
            </TouchableOpacity>

            {/* Error */}
            {error && step === "idle" && (
              <View className="mt-4 p-4 bg-destructive/10 rounded-xl">
                <Text className="text-sm text-destructive text-center">{error}</Text>
              </View>
            )}

            {/* Info */}
            <View className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
              <Text className="text-xs text-muted text-center leading-5">
                💡 Redemption burns BTC1 tokens and returns collateral. 
                No separate approval needed — uses EIP-2612 Permit for gasless signatures.
              </Text>
            </View>
          </View>
        </ScrollView>
      </ScreenContainer>
    </NetworkGuard>
  );
}
