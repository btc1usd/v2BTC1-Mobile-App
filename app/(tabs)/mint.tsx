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
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ethers } from "ethers"; // OPTIMIZATION: Top-level import for instant access

import { ScreenContainer } from "@/components/screen-container";
import { useVaultStats } from "@/hooks/use-vault-stats-simple";
import { useCollateralBalances } from "@/hooks/use-collateral-balances";
import { useNetworkEnforcement } from "@/hooks/use-network-enforcement";
import { mintBTC1WithPermit2, getTxUrl } from "@/lib/contract-utils";
import { COLLATERAL_TOKENS } from "@/lib/shared/contracts";
import { NetworkBanner } from "@/components/network-indicator";
import { NetworkGuard } from "@/components/network-guard";
import { WalletHeader } from "@/components/wallet-header";
import { NetworkSwitchModal } from "@/components/network-switch-modal";
import { useWallet } from "@/hooks/use-wallet";
import { ErrorModal } from "@/components/error-modal";
import { TransactionConfirmModal } from "@/components/transaction-confirm-modal";

// Unified steps since contract-utils handles the flow atomically
type MintStep = "idle" | "processing" | "success" | "error";

const TARGET_CHAIN_ID = 8453; // Base Mainnet
const TARGET_CHAIN_NAME = "Base Sepolia";

export default function MintScreen() {
  const {
    address,
    isConnected,
    chainId,
    readProvider,
    switchChain,
    signer,
    disconnectWallet
  } = useWallet();

  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(COLLATERAL_TOKENS[0]);
  const [step, setStep] = useState<MintStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false); 
  const [refreshing, setRefreshing] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetchBalances();
    setRefreshing(false);
  };

  // Keep loading state visible when app returns from wallet
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && isProcessing) {
        // App returned, keep loading
      }
    });
    return () => subscription.remove();
  }, [isProcessing]);

  const isOnCorrectNetwork = chainId === TARGET_CHAIN_ID;

  const { enforceNetwork } = useNetworkEnforcement({
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
    const mintPrice = Math.max(Number(collateralRatio) / 100, 1.2);
    const usdValue = Number(amount) * (btcPrice || 100000);
    const base = usdValue / mintPrice;
    
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error("Network switch failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const handleMint = async () => {
    if (!address || !signer) return;

    if (!isOnCorrectNetwork) {
      setShowNetworkModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const ok = await enforceNetwork("Mint BTC1");
    if (!ok) return;

    if (Number(amount) > Number(balance)) {
      setErrorMessage("You don't have enough " + selectedToken.symbol + " to complete this mint.");
      setShowErrorModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const confirmMint = async () => {
    try {
      setError("");
      setStep("processing");
      setIsProcessing(true);
      setShowConfirmModal(false); // Hide confirmation modal
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      console.log("🚀 Starting mint flow (Instant)...");
      
      // OPTIMIZATION: Pass directly to optimized util
      const result = await mintBTC1WithPermit2(selectedToken.address, amount, signer);
      
      if (!result.success) throw new Error(result.error);

      setTxHash(result.txHash!);
      setStep("success");
      setIsProcessing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        refetchBalances();
        setAmount("");
        setStep("idle");
        setTxHash("");
      }, 5000);
    } catch (e: any) {
      console.error("❌ Mint error:", e);
      
      // Graceful error messages
      let userMessage = "Something went wrong. Please try again.";
      
      if (e.message?.includes("rejected") || e.message?.includes("user rejected") || e.message?.includes("ACTION_REJECTED")) {
        userMessage = "You cancelled the transaction. No worries, your funds are safe!";
      } else if (e.message?.includes("insufficient")) {
        userMessage = "Insufficient balance to complete this transaction.";
      } else if (e.message?.includes("timeout") || e.message?.includes("timed out")) {
        userMessage = "Transaction took too long. Please ensure your wallet app is open and try again.";
      } else if (e.message?.includes("session") || e.message?.includes("topic")) {
        userMessage = "Wallet connection lost. Please reconnect your wallet and try again.";
      } else if (e.message) {
        userMessage = e.message;
      }
      
      setErrorMessage(userMessage);
      setShowErrorModal(true);
      setStep("error");
      setIsProcessing(false);
      setShowConfirmModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setStep("idle"), 4000);
    }
  };

  const cancelMint = () => {
    setShowConfirmModal(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const setMaxAmount = () => {
    setAmount(balance);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Guards
  if (!isConnected) {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <Text className="text-4xl">🔐</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mb-2">Connect Wallet</Text>
          <Text className="text-base text-muted text-center">Connect your wallet to mint BTC1 tokens</Text>
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
          <Text className="text-base text-muted text-center mb-2">You received ~{mintOutput.out} BTC1</Text>
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

  // Simplified Processing Screen for Lightning UX
  if (step === "processing") {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center w-full">
          <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center mb-8 relative">
            <ActivityIndicator size="large" color="#F7931A" />
            <Text className="absolute -bottom-2 text-2xl">⚡</Text>
          </View>
          
          <Text className="text-xl font-bold text-foreground mb-2">Processing</Text>
          <Text className="text-sm text-muted text-center mb-6">
             Please check your wallet to sign the request.
          </Text>
          
          <View className="bg-surface p-4 rounded-xl border border-border w-full">
            <View className="flex-row items-center mb-3">
              <Text className="text-success mr-2">✓</Text>
              <Text className="text-muted">Initiating...</Text>
            </View>
            <View className="flex-row items-center mb-3">
              <ActivityIndicator size="small" color="#F7931A" className="mr-2" />
              <Text className="text-foreground font-medium">Permit & Mint</Text>
            </View>
             <Text className="text-xs text-muted/60 ml-6">
                Approve (if needed) and Sign in one flow
             </Text>
          </View>

          <Text className="text-xs text-muted/60 text-center px-8 mt-6">
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
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <WalletHeader address={address} chainId={chainId} compact onDisconnect={disconnectWallet} />
          
            <View className="px-6 pt-2 pb-2">
              <NetworkBanner chainId={chainId} />
            </View>

            <View className="px-6">
              <Text className="text-3xl font-bold text-foreground mb-1">Mint BTC1</Text>
              <Text className="text-sm text-muted mb-6">Deposit Bitcoin collateral to mint BTC1 Tokens</Text>

              {!isOnCorrectNetwork && (
                <View className="bg-warning/10 rounded-2xl p-4 mb-4 border-2 border-warning/30">
                  <View className="flex-row items-start">
                    <Text className="text-2xl mr-3">⚠️</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-warning mb-1">Wrong Network Detected</Text>
                      <Text className="text-xs text-warning/80 mb-3">You're connected to the wrong network.</Text>
                      <TouchableOpacity onPress={() => setShowNetworkModal(true)} className="bg-warning/20 rounded-lg px-4 py-2 self-start">
                        <Text className="text-xs font-bold text-warning">Switch Network</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* FROM CARD */}
              <View className="bg-surface rounded-3xl p-5 mb-3 border border-border">
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-xs font-medium text-muted uppercase tracking-wide">You Pay</Text>
                  <View className="flex-row items-center">
                    {isBalancesLoading ? (
                      <ActivityIndicator size="small" color="#9BA1A6" />
                    ) : (
                      <>
                        <Text className="text-xs text-muted mr-2">Balance: {Number(balance).toFixed(4)}</Text>
                        {hasBalance && (
                          <TouchableOpacity onPress={setMaxAmount} className="bg-primary/10 px-2 py-1 rounded-md">
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
                      if (amount && Number(amount) > 0) {
                        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                      }
                    }}
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    className="flex-1 text-4xl font-bold text-foreground"
                  />
                  
                  <TouchableOpacity className="flex-row items-center bg-background rounded-full px-3 py-2 ml-2">
                    <View className="w-7 h-7 rounded-full bg-primary/20 items-center justify-center mr-2">
                      <Text className="text-sm font-bold">₿</Text>
                    </View>
                    <Text className="font-bold text-foreground mr-1">{selectedToken.symbol}</Text>
                    <Text className="text-muted">▼</Text>
                  </TouchableOpacity>
                </View>

                {amount && Number(amount) > 0 && (
                  <Text className="text-sm text-muted mt-2">
                    ≈ ${(Number(amount) * (btcPrice || 100000)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </Text>
                )}
              </View>

              <View className="items-center -my-2 z-10">
                <View className="w-10 h-10 rounded-full bg-surface border-4 border-background items-center justify-center">
                  <Text className="text-lg">↓</Text>
                </View>
              </View>

              {/* TO CARD */}
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

              {/* TOKEN SELECTION */}
              <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Select Collateral</Text>
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
                        isSelected ? "bg-primary/10 border-primary" : "bg-surface border-border"
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

              {/* DETAILS CARD */}
              <View className="bg-surface rounded-2xl p-4 mb-6 border border-border">
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-sm text-muted">Mint Price</Text>
                  {isVaultLoading ? <ActivityIndicator size="small" /> : <Text className="text-sm font-semibold text-foreground">${mintOutput.mintPrice}</Text>}
                </View>
                <View className="h-px bg-border my-1" />
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-sm text-muted">Collateral Ratio</Text>
                  {isVaultLoading ? <ActivityIndicator size="small" /> : <Text className="text-sm font-semibold text-foreground">{collateralRatio || "120"}%</Text>}
                </View>
                <View className="h-px bg-border my-1" />
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-sm text-muted">BTC Price</Text>
                  <Text className="text-sm font-semibold text-foreground">${(btcPrice || 100000).toLocaleString()}</Text>
                </View>
                <View className="h-px bg-border my-1" />
                <View className="flex-row justify-between items-center py-2">
                    <Text className="text-sm font-bold text-foreground">Total BTC1 to Mint</Text>
                    <Text className="text-sm font-bold text-primary">{mintOutput.total} BTC1</Text>
                </View>
              </View>

              {/* MINT BUTTON */}
              <TouchableOpacity
                onPress={handleMint}
                disabled={!canMint}
                className={`py-5 rounded-2xl items-center ${canMint ? "bg-primary" : "bg-muted/30"}`}
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

              {error && step === "idle" && (
                <View className="mt-4 p-4 bg-destructive/10 rounded-xl">
                  <Text className="text-sm text-destructive text-center">{error}</Text>
                </View>
              )}

              <View className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
                <Text className="text-xs text-muted text-center leading-5">
                  💡 Lightning Fast: Uses Permit2 for gasless approval and signing in a single smooth flow.
                </Text>
              </View>
            </View>

            {/* CONFIRMATION MODAL */}
            <TransactionConfirmModal
              visible={showConfirmModal}
              title="Confirm Mint"
              description="Review and confirm your mint transaction"
              actionText="Mint"
              amount={mintOutput.out}
              token="BTC1"
              network="Base Sepolia"
              gasEstimate="~0.001 ETH"
              transactionDetails={[
                { label: "Collateral", value: `${amount} ${selectedToken.symbol}` },
                { label: "Network", value: "Base Sepolia" },
                { label: "Gas Estimate", value: "~0.001 ETH" },
                { label: "Mint Price", value: `$${mintOutput.mintPrice}` },
                { label: "Fees", value: "2% (1% dev + 1% endowment)" },
                { label: "Action", value: "Mint BTC1" }
              ]}
              onConfirm={confirmMint}
              onCancel={cancelMint}
              isProcessing={step === "processing"}
              processingMessage="Minting BTC1 tokens..."
            />
          </ScrollView>
        </ScreenContainer>
      </NetworkGuard>

      {/* Error Modal */}
      <ErrorModal
        visible={showErrorModal}
        title="Mint Failed"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </>
  );
}