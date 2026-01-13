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
import { useCollateralBalances } from "@/hooks/use-collateral-balances";
import { useNetworkEnforcement } from "@/hooks/use-network-enforcement";
import { mintBTC1WithPermit2, getTxUrl } from "@/lib/contract-utils";
import { COLLATERAL_TOKENS } from "@/lib/shared/contracts";
import { NetworkBanner } from "@/components/network-indicator";
import { NetworkGuard } from "@/components/network-guard";
import { WalletHeader } from "@/components/wallet-header";
import { NetworkSwitchModal } from "@/components/network-switch-modal";
import { useWallet } from "@/hooks/use-wallet-wc";

type MintStep = "idle" | "approving" | "signing" | "minting" | "success" | "error";

const TARGET_CHAIN_ID = 84532; // Base Sepolia
const TARGET_CHAIN_NAME = "Base Sepolia";

export default function MintScreen() {
  const web3 = useWeb3();
  const {
    address,
    isConnected,
    chainId,
    signer,
    wcProvider,
    readProvider,
    switchChain,
  } = web3;
  const { disconnectWallet } = useWallet();

  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(COLLATERAL_TOKENS[0]);
  const [step, setStep] = useState<MintStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
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

  const isOnCorrectNetwork = chainId === TARGET_CHAIN_ID;

  const { enforceNetwork } = useNetworkEnforcement({
    provider: readProvider,
    wcProvider,
    chainId,
    isConnected,
  });

  const { collateralRatio, isLoading: isVaultLoading, btcPrice } = useVaultStats();

  const {
    getBalance,
    refetch: refetchBalances,
    isLoading: isBalancesLoading,
  } = useCollateralBalances({
    userAddress: address,
    chainId,
    enabled: isConnected && !!address,
  });

  const tokenBalance = getBalance(selectedToken.symbol);
  const balance = tokenBalance.formatted;
  const hasBalance = Number(balance) > 0;

  // Mint calculation
  const mintOutput = useMemo(() => {
    if (!amount || Number(amount) <= 0) {
      return { out: "0.00", dev: "0.00", endowment: "0.00", total: "0.00", mintPrice: "1.20" };
    }
    // Mint price is max(1.20, collateralRatio)
    const mintPrice = Math.max(Number(collateralRatio) / 100, 1.2);
    const usdValue = Number(amount) * (btcPrice || 100000);
    const base = usdValue / mintPrice;
    
    // Dev Fee: 1% and Endowment Fee: 1%
    const devFee = base * 0.01;
    const endowmentFee = base * 0.01;
    
    return {
      out: base.toFixed(2),
      dev: devFee.toFixed(2),
      endowment: endowmentFee.toFixed(2),
      total: (base + devFee + endowmentFee).toFixed(2),
      mintPrice: mintPrice.toFixed(2),
    };
  }, [amount, collateralRatio, btcPrice]);

  const canMint = amount && Number(amount) > 0 && Number(amount) <= Number(balance) && step === "idle" && isOnCorrectNetwork;

  const handleNetworkSwitch = async () => {
    try {
      setIsSwitchingNetwork(true);
      await switchChain(TARGET_CHAIN_ID);
      setShowNetworkModal(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error("Network switch failed:", error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const handleMint = async () => {
    if (!signer || !wcProvider || !address) return;

    // Check network before proceeding
    if (!isOnCorrectNetwork) {
      setShowNetworkModal(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const ok = await enforceNetwork("Mint BTC1");
    if (!ok) return;

    if (Number(amount) > Number(balance)) {
      setError("Insufficient balance");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      setError("");
      setStep("approving");
      setIsProcessing(true); // Lock UI
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // OPTIMIZED: Get signer directly - no session wake delay
      console.log("🚀 Starting mint flow (lightning fast)...");
      
      const { ethers } = await import("ethers");
      const freshProvider = new ethers.BrowserProvider(wcProvider);
      const freshSigner = await freshProvider.getSigner();

      console.log("📝 [UI] Calling mintBTC1WithPermit2...");
      const result = await mintBTC1WithPermit2(selectedToken.address, amount, freshSigner);
      
      console.log("✅ [UI] Mint result:", result.success, result.txHash);

      if (!result.success) {
        console.error("❌ [UI] Mint failed:", result.error);
        throw new Error(result.error);
      }

      setTxHash(result.txHash!);
      setStep("success");
      setIsProcessing(false); // Unlock UI
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        refetchBalances();
        setAmount("");
        setStep("idle");
        setTxHash("");
      }, 5000);
    } catch (e: any) {
      console.error("❌ [UI] Mint error caught:", e);
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
    setAmount(balance);
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
            Connect your wallet to mint BTC1 tokens
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
          <Text className="text-2xl font-bold text-foreground mb-2">Mint Successful!</Text>
          <Text className="text-base text-muted text-center mb-2">
            You received ~{mintOutput.out} BTC1
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

  if (step === "approving" || step === "signing" || step === "minting") {
    const stepInfo = {
      approving: { title: "Approve Permit2", desc: "Approve tokens in your wallet", emoji: "📋", progress: 33 },
      signing: { title: "Sign Permit", desc: "Sign the permit message", emoji: "✍️", progress: 66 },
      minting: { title: "Confirming", desc: "Transaction confirming on-chain", emoji: "⚡", progress: 100 },
    }[step]!;
    
    const isApproved = step === 'signing' || step === 'minting';
    const isSigned = step === 'minting';
    
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center w-full">
          {/* Progress Steps */}
          <View className="flex-row items-center justify-center mb-8 w-full px-4">
            {/* Approve Step */}
            <View className="items-center flex-1">
              <View 
                className={`w-14 h-14 rounded-full items-center justify-center shadow-lg ${
                  isApproved ? 'bg-success' : step === 'approving' ? 'bg-primary' : 'bg-border'
                }`}
                style={{
                  shadowColor: isApproved ? '#10b981' : step === 'approving' ? '#F7931A' : '#666',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                  elevation: 8,
                }}
              >
                {isApproved ? (
                  <Text className="text-white font-bold text-3xl">✓</Text>
                ) : (
                  <Text className="text-2xl">📋</Text>
                )}
              </View>
              <Text className={`text-xs mt-2 font-bold ${
                isApproved ? 'text-success' : 'text-muted'
              }`} style={{ opacity: isApproved ? 1 : 0.7 }}>Approve</Text>
            </View>
            
            {/* Connecting Line 1 */}
            <View 
              className={`h-1.5 flex-1 mx-2 rounded-full ${
                isApproved ? 'bg-success' : 'bg-border'
              }`}
              style={{
                opacity: isApproved ? 1 : 0.4,
              }}
            />
            
            {/* Sign Step */}
            <View className="items-center flex-1">
              <View 
                className={`w-14 h-14 rounded-full items-center justify-center shadow-lg ${
                  isSigned ? 'bg-success' : step === 'signing' ? 'bg-primary' : 'bg-border'
                }`}
                style={{
                  shadowColor: isSigned ? '#10b981' : step === 'signing' ? '#F7931A' : '#666',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                  elevation: 8,
                }}
              >
                {isSigned ? (
                  <Text className="text-white font-bold text-3xl">✓</Text>
                ) : (
                  <Text className="text-2xl">✍️</Text>
                )}
              </View>
              <Text className={`text-xs mt-2 font-bold ${
                isSigned ? 'text-success' : step === 'signing' ? 'text-primary' : 'text-muted'
              }`} style={{ opacity: isSigned || step === 'signing' ? 1 : 0.7 }}>Sign</Text>
            </View>
            
            {/* Connecting Line 2 */}
            <View 
              className={`h-1.5 flex-1 mx-2 rounded-full ${
                step === 'minting' ? 'bg-primary' : 'bg-border'
              }`}
              style={{
                opacity: step === 'minting' ? 1 : 0.4,
              }}
            />
            
            {/* Confirm Step */}
            <View className="items-center flex-1">
              <View 
                className={`w-14 h-14 rounded-full items-center justify-center shadow-lg ${
                  step === 'minting' ? 'bg-primary' : 'bg-border'
                }`}
                style={{
                  shadowColor: step === 'minting' ? '#F7931A' : '#666',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.8,
                  shadowRadius: 6,
                  elevation: 8,
                }}
              >
                <Text className="text-2xl">⚡</Text>
              </View>
              <Text className={`text-xs mt-2 font-bold ${
                step === 'minting' ? 'text-primary' : 'text-muted'
              }`} style={{ opacity: step === 'minting' ? 1 : 0.7 }}>Confirm</Text>
            </View>
          </View>

          {/* Spinner & Message */}
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <ActivityIndicator size="large" color="#F7931A" />
          </View>
          <Text className="text-2xl mb-3">{stepInfo.emoji}</Text>
          <Text className="text-xl font-bold text-foreground mb-2">
            {stepInfo.title}
          </Text>
          <Text className="text-sm text-muted text-center mb-4">
            {stepInfo.desc}
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
  // MAIN UI
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <NetworkSwitchModal
        visible={showNetworkModal}
        currentChainId={chainId}
        targetChainId={TARGET_CHAIN_ID}
        targetChainName={TARGET_CHAIN_NAME}
        onSwitch={handleNetworkSwitch}
        onCancel={() => setShowNetworkModal(false)}
        isSwitching={isSwitchingNetwork}
      />
      
      <NetworkGuard>
        <ScreenContainer>
          <ScrollView
            ref={scrollViewRef}
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Uniform Header - Wallet & Network */}
            <WalletHeader address={address} chainId={chainId} compact onDisconnect={disconnectWallet} />
          
            {/* Header */}
            <View className="px-6 pt-2 pb-2">
              <NetworkBanner chainId={chainId} wcProvider={wcProvider} />
            </View>

            <View className="px-6">
              <Text className="text-3xl font-bold text-foreground mb-1">Mint BTC1</Text>
              <Text className="text-sm text-muted mb-6">
                Deposit Bitcoin collateral to mint BTC1 Tokens
              </Text>

              {/* Wrong Network Warning */}
              {!isOnCorrectNetwork && (
                <View className="bg-warning/10 rounded-2xl p-4 mb-4 border-2 border-warning/30">
                  <View className="flex-row items-start">
                    <Text className="text-2xl mr-3">⚠️</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-warning mb-1">
                        Wrong Network Detected
                      </Text>
                      <Text className="text-xs text-warning/80 mb-3">
                        You're connected to the wrong network. Please switch to {TARGET_CHAIN_NAME} to continue.
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowNetworkModal(true)}
                        className="bg-warning/20 rounded-lg px-4 py-2 self-start"
                      >
                        <Text className="text-xs font-bold text-warning">
                          Switch Network
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

            {/* ───────── FROM CARD ───────── */}
            <View className="bg-surface rounded-3xl p-5 mb-3 border border-border">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xs font-medium text-muted uppercase tracking-wide">You Pay</Text>
                <View className="flex-row items-center">
                  {isBalancesLoading ? (
                    <ActivityIndicator size="small" color="#9BA1A6" />
                  ) : (
                    <>
                      <Text className="text-xs text-muted mr-2">
                        Balance: {Number(balance).toFixed(4)}
                      </Text>
                      {hasBalance && (
                        <TouchableOpacity
                          onPress={setMaxAmount}
                          className="bg-primary/10 px-2 py-1 rounded-md"
                        >
                          <Text className="text-xs font-bold text-primary">MAX</Text>
                        </TouchableOpacity>
                      )}
                    </>
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
                
                {/* Token Selector */}
                <TouchableOpacity className="flex-row items-center bg-background rounded-full px-3 py-2 ml-2">
                  <View className="w-7 h-7 rounded-full bg-primary/20 items-center justify-center mr-2">
                    <Text className="text-sm font-bold">₿</Text>
                  </View>
                  <Text className="font-bold text-foreground mr-1">{selectedToken.symbol}</Text>
                  <Text className="text-muted">▼</Text>
                </TouchableOpacity>
              </View>

              {/* USD Value */}
              {amount && Number(amount) > 0 && (
                <Text className="text-sm text-muted mt-2">
                  ≈ ${(Number(amount) * (btcPrice || 100000)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </Text>
              )}
            </View>

            {/* Swap Arrow */}
            <View className="items-center -my-2 z-10">
              <View className="w-10 h-10 rounded-full bg-surface border-4 border-background items-center justify-center">
                <Text className="text-lg">↓</Text>
              </View>
            </View>

            {/* ───────── TO CARD ───────── */}
            <View className="bg-surface rounded-3xl p-5 mb-6 border border-border">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xs font-medium text-muted uppercase tracking-wide">You Receive</Text>
              </View>

              <View className="flex-row items-center">
                <Text className="flex-1 text-4xl font-bold text-foreground">
                  {mintOutput.out === "0.00" ? "0" : mintOutput.out}
                </Text>
                
                <View className="flex-row items-center bg-background rounded-full px-3 py-2 ml-2">
                  <View className="w-7 h-7 rounded-full bg-success/20 items-center justify-center mr-2">
                    <Text className="text-sm font-bold text-success">$</Text>
                  </View>
                  <Text className="font-bold text-foreground">BTC1</Text>
                </View>
              </View>
            </View>

            {/* ───────── TOKEN SELECTION ───────── */}
            <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
              Select Collateral
            </Text>
            <View className="flex-row gap-2 mb-6">
              {COLLATERAL_TOKENS.map((token) => {
                const b = getBalance(token.symbol);
                const isSelected = token.symbol === selectedToken.symbol;
                const tokenHasBalance = Number(b.formatted) > 0;

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
                      {tokenHasBalance && (
                        <View className={`w-2 h-2 rounded-full ${isSelected ? "bg-primary" : "bg-success"}`} />
                      )}
                    </View>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {Number(b.formatted).toFixed(4)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ───────── DETAILS CARD ───────── */}
            <View className="bg-surface rounded-2xl p-4 mb-6 border border-border">
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">Mint Price</Text>
                {isVaultLoading ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text className="text-sm font-semibold text-foreground">${mintOutput.mintPrice}</Text>
                )}
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
                <Text className="text-sm text-muted">Dev Fee (1%)</Text>
                <Text className="text-sm font-semibold text-foreground">{mintOutput.dev} BTC1</Text>
              </View>
              
              <View className="h-px bg-border my-1" />
              
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">Endowment Fee (1%)</Text>
                <Text className="text-sm font-semibold text-foreground">{mintOutput.endowment} BTC1</Text>
              </View>
              
              <View className="h-px bg-border my-1" />
              
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm font-bold text-foreground">Total BTC1 to Mint</Text>
                <Text className="text-sm font-bold text-primary">{mintOutput.total} BTC1</Text>
              </View>
              
              <View className="h-px bg-border my-1" />
              
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-sm text-muted">Network</Text>
                <Text className="text-sm font-semibold text-success">Base Sepolia</Text>
              </View>
            </View>

            {/* ───────── MINT BUTTON ───────── */}
            <TouchableOpacity
              onPress={handleMint}
              disabled={!canMint}
              className={`py-5 rounded-2xl items-center ${
                canMint ? "bg-primary" : "bg-muted/30"
              }`}
            >
              <Text className={`text-lg font-bold ${canMint ? "text-white" : "text-muted"}`}>
                {!isOnCorrectNetwork
                  ? `Switch to ${TARGET_CHAIN_NAME}`
                  : !amount || Number(amount) <= 0
                  ? "Enter Amount"
                  : Number(amount) > Number(balance)
                  ? "Insufficient Balance"
                  : "Mint BTC1"}
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
                💡 BTC1 is backed by Bitcoin collateral at a minimum 120% ratio. 
                No separate approval needed — uses Permit2 for gasless signatures.
              </Text>
            </View>
          </View>
        </ScrollView>
      </ScreenContainer>
    </NetworkGuard>
    </>
  );
}
