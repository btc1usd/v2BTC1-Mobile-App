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
    provider,
    readOnlyProvider,
    switchChain,
  } = web3;
  const wcProvider = web3.wcProvider;
  const { disconnectWallet } = useWallet();

  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(COLLATERAL_TOKENS[0]);
  const [step, setStep] = useState<MintStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const isOnCorrectNetwork = chainId === TARGET_CHAIN_ID;

  const { enforceNetwork } = useNetworkEnforcement({
    provider,
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
    provider: readOnlyProvider,
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
    if (!signer || !provider || !address) return;

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
      setStep("signing");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // CRITICAL: After network switch, we need a FRESH provider and signer
      // The old provider/signer may still be pointing to the old network
      let freshProvider = provider;
      let freshSigner = signer;

      // If wcProvider exists, recreate provider from it to ensure correct network
      if (wcProvider) {
        const { ethers } = await import("ethers");
        freshProvider = new ethers.BrowserProvider(wcProvider);
        
        // Wake wallet connection
        await freshProvider.send("eth_accounts", []);
        
        // OPTIMIZED: Removed delay - not needed with proper wallet wake
        freshSigner = await freshProvider.getSigner();
        
        // Verify signer is on correct network
        const network = await freshProvider.getNetwork();
        console.log("Fresh signer network:", network.chainId.toString());
      } else {
        // Fallback: just get fresh signer from existing provider
        await provider.send("eth_accounts", []);
        freshSigner = await provider.getSigner();
      }
      
      // Check if approval is needed (will show approving step)
      setStep("approving");

      const result = await mintBTC1WithPermit2(selectedToken.address, amount, freshSigner);
      
      // After approval, switch to signing step (handled by mintBTC1WithPermit2)
      setStep("signing");

      if (!result.success) throw new Error(result.error);

      setTxHash(result.txHash!);
      setStep("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        refetchBalances();
        setAmount("");
        setStep("idle");
        setTxHash("");
      }, 5000);
    } catch (e: any) {
      console.error("Mint error:", e);
      const msg = e.message?.includes("rejected") ? "Transaction cancelled" : e.message || "Transaction failed";
      setError(msg);
      setStep("error");
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
    const titles: Record<string, string> = {
      approving: "Approve Permit2",
      signing: "Sign Permit",
      minting: "Minting BTC1...",
    };
    const descriptions: Record<string, string> = {
      approving: "Approve tokens for Permit2 (one-time)",
      signing: "Sign the permit message in your wallet",
      minting: "Transaction is being processed",
    };
    
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <ActivityIndicator size="large" color="#F7931A" />
          </View>
          <Text className="text-xl font-bold text-foreground mb-2">
            {titles[step]}
          </Text>
          <Text className="text-sm text-muted text-center">
            {descriptions[step]}
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
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
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
                  placeholder="0"
                  placeholderTextColor="#6B7280"
                  keyboardType="decimal-pad"
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
