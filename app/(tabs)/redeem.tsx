import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
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
    provider,
  } = web3;
  const wcProvider = web3.wcProvider;
  const { disconnectWallet } = useWallet();

  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(COLLATERAL_TOKENS[0]);
  const [step, setStep] = useState<RedeemStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const { enforceNetwork } = useNetworkEnforcement({
    provider,
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
    if (!signer || !provider || !address) return;

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // CRITICAL: Get fresh provider and signer after network switch
      let freshProvider = provider;
      let freshSigner = signer;

      if (wcProvider) {
        const { ethers } = await import("ethers");
        freshProvider = new ethers.BrowserProvider(wcProvider);
        
        await freshProvider.send("eth_accounts", []);
        // OPTIMIZED: Removed delay - not needed with proper wallet wake
        
        freshSigner = await freshProvider.getSigner();
        
        const network = await freshProvider.getNetwork();
        console.log("Fresh signer network:", network.chainId.toString());
      } else {
        await provider.send("eth_accounts", []);
        freshSigner = await provider.getSigner();
      }

      const result = await redeemBTC1WithPermit(amount, selectedToken.address, freshSigner);

      if (!result.success) throw new Error(result.error);

      setTxHash(result.txHash!);
      setStep("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        setAmount("");
        setStep("idle");
        setTxHash("");
      }, 5000);
    } catch (e: any) {
      console.error("Redeem error:", e);
      const msg = e.message?.includes("rejected") ? "Transaction cancelled" : e.message || "Transaction failed";
      setError(msg);
      setStep("error");
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
        <View className="items-center">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <ActivityIndicator size="large" color="#F7931A" />
          </View>
          <Text className="text-xl font-bold text-foreground mb-2">
            Sign Permit
          </Text>
          <Text className="text-sm text-muted text-center">
            Sign the permit message in your wallet
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
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="px-6 pt-2 pb-2">
            <NetworkBanner chainId={chainId} wcProvider={wcProvider} />
          </View>

          <View className="px-6">
            <Text className="text-3xl font-bold text-foreground mb-1">Redeem BTC1</Text>
            <Text className="text-sm text-muted mb-6">
              Burn BTC1 stablecoins to withdraw Bitcoin collateral
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
                  placeholder="0"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
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
