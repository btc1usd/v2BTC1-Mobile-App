import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useDistributionData } from "@/hooks/use-distribution-data-simple";
import * as Haptics from "expo-haptics";
import { claimRewards, getTxUrl } from "@/lib/contract-utils";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { WalletHeader } from "@/components/wallet-header";
import { useWallet } from "@/hooks/use-wallet";
import { ErrorModal } from "@/components/error-modal";
import { TransactionConfirmModal } from "@/components/transaction-confirm-modal";
import {
  fetchUserMerkleProof,
  fetchUserUnclaimedRewards,
  fetchCurrentDistribution,
  markClaimAsClaimed,
  fetchTotalRewardsEarned,
  type MerkleClaim,
} from "@/lib/supabase";

type ClaimStep = "input" | "claiming" | "success" | "error";

export default function RewardsScreen() {
  const {
    address,
    isConnected,
    chainId,
    signer,
    readProvider,
    disconnectWallet
  } = useWallet();
  const { distributionCount, timeUntilDistribution, canDistribute, lastDistributionDate, refetch: refetchDistributionData } = useDistributionData();
  
  const [claimingDistributionId, setClaimingDistributionId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [availableRewards, setAvailableRewards] = useState("0");
  const [currentDistributionId, setCurrentDistributionId] = useState(0);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const [hasUnclaimedRewards, setHasUnclaimedRewards] = useState(false);
  const [unclaimedRewardsList, setUnclaimedRewardsList] = useState<MerkleClaim[]>([]);
  const [totalEarned, setTotalEarned] = useState("0");
  const [lastRefreshTime, setLastRefreshTime] = useState(Date.now());
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [currentClaim, setCurrentClaim] = useState<MerkleClaim | null>(null);
  
  useEffect(() => {
    const fetchRewards = async () => {
      // CRITICAL: Use readProvider for all reads - NEVER WalletConnect
      if (!readProvider || !address || chainId !== 84532) {
        console.log('[Rewards] Skipping fetch - missing:', { readProvider: !!readProvider, address, chainId });
        return;
      }
      
      try {
        console.log('[Rewards] Starting fetch...');
        setIsLoadingRewards(true);
        setLastRefreshTime(Date.now()); // Update timestamp
        
        // Fetch current distribution from Supabase
        const currentDist = await fetchCurrentDistribution();
        if (currentDist) {
          setCurrentDistributionId(currentDist.id);
          console.log('[Rewards] Current distribution:', currentDist.id);
        }
        
        // Fetch unclaimed rewards from Supabase with on-chain verification
        const unclaimed = await fetchUserUnclaimedRewards(address, readProvider);
        console.log('[Rewards] Unclaimed rewards:', unclaimed.length);
        setUnclaimedRewardsList(unclaimed);
        setHasUnclaimedRewards(unclaimed.length > 0);
        
        // Calculate total available rewards
        if (unclaimed.length > 0) {
          const total = unclaimed.reduce((sum, claim) => {
            return sum + BigInt(claim.amount);
          }, BigInt(0));
          // Convert from 8 decimals to display format
          const totalFormatted = ethers.formatUnits(total, 8);
          setAvailableRewards(totalFormatted);
          console.log('[Rewards] Total available:', totalFormatted);
        } else {
          setAvailableRewards("0");
        }
        
        // Fetch total earned (claimed rewards)
        const earned = await fetchTotalRewardsEarned(address);
        const earnedFormatted = ethers.formatUnits(earned, 8);
        setTotalEarned(earnedFormatted);
        console.log('[Rewards] Total earned:', earnedFormatted);
        
      } catch (error: any) {
        console.error('[Rewards] Error fetching rewards:', error.message || error);
        // Fallback to contract if Supabase fails
        try {
          const distributorContract = new ethers.Contract(
            CONTRACT_ADDRESSES.MERKLE_DISTRIBUTOR,
            ABIS.MERKLE_DISTRIBUTOR,
            readProvider
          );
          const distId = await distributorContract.currentDistributionId();
          setCurrentDistributionId(Number(distId));
        } catch (contractError: any) {
          console.error('[Rewards] Contract fallback failed:', contractError.message);
        }
      } finally {
        setIsLoadingRewards(false);
        console.log('[Rewards] Fetch complete');
      }
    };
    
    fetchRewards();
    // OPTIMIZED: Removed 30s polling - rewards update on:
    // 1. Component mount or chainId change
    // 2. Manual refresh via pull-to-refresh
    // 3. After successful claim
  }, [readProvider, address, chainId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLastRefreshTime(Date.now()); // Force cache bust
    
    // Refetch rewards data from Supabase with on-chain verification
    if (address && chainId === 84532 && readProvider) {
      try {
        const [currentDist, unclaimed, earned] = await Promise.all([
          fetchCurrentDistribution(),
          fetchUserUnclaimedRewards(address, readProvider),
          fetchTotalRewardsEarned(address),
        ]);
        
        if (currentDist) {
          setCurrentDistributionId(currentDist.id);
        }
        setUnclaimedRewardsList(unclaimed);
        setHasUnclaimedRewards(unclaimed.length > 0);
        
        if (unclaimed.length > 0) {
          const total = unclaimed.reduce((sum, claim) => {
            return sum + BigInt(claim.amount);
          }, BigInt(0));
          setAvailableRewards(ethers.formatUnits(total, 8));
        } else {
          setAvailableRewards("0");
        }
        
        setTotalEarned(ethers.formatUnits(earned, 8));
      } catch (error: any) {
        console.error('Error refreshing rewards:', error.message || error);
      }
    }
    
    setRefreshing(false);
  };

  const handleClaim = async (claim: MerkleClaim) => {
    if (!signer || !address) return;
    
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Set current claim and show confirmation modal
    setCurrentClaim(claim);
    setShowConfirmModal(true);
  };

  const confirmClaim = async () => {
    if (!currentClaim || !signer || !address) return;
    
    setClaimingDistributionId(currentClaim.distribution_id);
    
    try {
      console.log('[Claim] Starting claim:', {
        distributionId: currentClaim.distribution_id,
        index: currentClaim.index,
        amount: currentClaim.amount,
        proofLength: currentClaim.proof.length,
        account: address, // Using original checksum address
      });
      
      // CRITICAL: Wake wallet immediately on user intent
      console.log("🔔 Initiating claim transaction...");
      
      // Call claim with real merkle proof from Supabase
      // IMPORTANT: amount from Supabase is already in smallest unit (8 decimals)
      // CRITICAL: Use the original checksum address, not lowercase
      const result = await claimRewards(
        currentClaim.distribution_id,
        currentClaim.index,
        address, // Use original checksum address from wallet
        currentClaim.amount, // Already in Wei-equivalent (smallest unit)
        currentClaim.proof,
        signer
      );
      
      if (!result.success) {
        throw new Error(result.error || "Claim failed");
      }

      console.log('[Claim] Success! TxHash:', result.txHash);

      // IMMEDIATE: Remove claimed reward from UI (optimistic update)
      console.log('[Claim] Removing claimed reward from UI...');
      setUnclaimedRewardsList(prev => 
        prev.filter(c => c.distribution_id !== currentClaim.distribution_id)
      );
      
      // Recalculate available rewards
      const newTotal = unclaimedRewardsList
        .filter(c => c.distribution_id !== currentClaim.distribution_id)
        .reduce((sum, c) => sum + BigInt(c.amount), BigInt(0));
      setAvailableRewards(ethers.formatUnits(newTotal, 8));

      // Mark as claimed in Supabase for faster future fetches
      console.log('[Claim] Updating Supabase...');
      const marked = await markClaimAsClaimed(currentClaim.distribution_id, address);
      if (marked) {
        console.log('[Claim] Supabase updated successfully');
      } else {
        console.warn('[Claim] Failed to update Supabase, but claim succeeded on-chain');
      }

      // Success haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Force refresh with cache bust after 2 seconds (verify on-chain)
      console.log('[Claim] Scheduling verification refresh...');
      setTimeout(async () => {
        setLastRefreshTime(Date.now()); // Force cache bust
        await onRefresh();
        // Also refetch distribution data
        if (refetchDistributionData) {
          await refetchDistributionData();
        }
      }, 2000);
      
    } catch (err: any) {
      console.error('[Claim] Error:', err.message || String(err));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      // Graceful error messages
      let userMessage = "Unable to claim rewards. Please try again.";
      
      if (err.message?.includes('rejected') || err.message?.includes('user rejected') || err.message?.includes('ACTION_REJECTED')) {
        userMessage = "You cancelled the claim. No worries, your rewards are safe!";
      } else if (err.message?.includes('already claimed')) {
        userMessage = "This reward has already been claimed. Refreshing your rewards...";
        console.log('[Claim] Already claimed - forcing refresh to sync state');
        setLastRefreshTime(Date.now());
        await onRefresh();
      } else if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
        userMessage = "Claim took too long. Please ensure your wallet app is open and try again.";
      } else if (err.message?.includes('session') || err.message?.includes('topic')) {
        userMessage = "Wallet connection lost. Please reconnect your wallet and try again.";
      } else if (err.message) {
        userMessage = err.message;
      }
      
      setErrorMessage(userMessage);
      setShowErrorModal(true);
    } finally {
      setClaimingDistributionId(null);
      setShowConfirmModal(false);
      setCurrentClaim(null);
    }
  };

  const cancelClaim = () => {
    setShowConfirmModal(false);
    setCurrentClaim(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Pending rewards list from Supabase
  const pendingRewards = unclaimedRewardsList.map((claim) => ({
    distributionId: claim.distribution_id,
    amount: ethers.formatUnits(claim.amount, 8),
    date: new Date(claim.created_at).toISOString().split('T')[0],
    index: claim.index,
  }));

  if (!isConnected) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <View className="items-center">
          <Text className="text-6xl mb-4">🎁</Text>
          <Text className="text-2xl font-bold text-foreground mb-2">Wallet Required</Text>
          <Text className="text-base text-muted text-center">
            Connect your wallet to view and claim your rewards
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // Main Rewards Screen
  return (
    <ScreenContainer>
      {/* Uniform Header - Wallet & Network */}
      <WalletHeader address={address} chainId={chainId} compact onDisconnect={disconnectWallet} />
      
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }} 
        className="px-6 py-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View className="mb-8">
          <Text className="text-3xl font-bold text-foreground mb-2">Weekly Rewards</Text>
          <Text className="text-base text-muted">
            Claim your share of protocol surplus distributions
          </Text>
        </View>

        {/* Available Rewards Summary */}
        <View className="bg-gradient-to-br from-success/20 to-success/5 border-2 border-success rounded-3xl p-6 mb-6">
          <Text className="text-sm text-muted mb-2">Total Available to Claim</Text>
          {isLoadingRewards ? (
            <ActivityIndicator size="large" color="#10B981" className="my-4" />
          ) : (
            <>
              <Text className="text-5xl font-bold text-success mb-2">
                {availableRewards}
              </Text>
              <Text className="text-base text-muted mb-2">BTC1</Text>
              <Text className="text-xs text-muted">
                {unclaimedRewardsList.length} unclaimed distribution{unclaimedRewardsList.length !== 1 ? 's' : ''}
              </Text>
            </>
          )}
        </View>

        {/* Distribution Stats */}
        <View className="bg-surface border-2 border-border rounded-2xl p-5 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-4">Distribution Stats</Text>
          
          <View className="flex-row justify-between mb-3">
            <Text className="text-sm text-muted">Total Claimed</Text>
            <Text className="text-lg font-bold text-success">{parseFloat(totalEarned).toFixed(4)} BTC1</Text>
          </View>
          
          <View className="flex-row justify-between mb-3">
            <Text className="text-sm text-muted">Current Distribution</Text>
            <Text className="text-lg font-bold text-foreground">#{currentDistributionId}</Text>
          </View>
          
          <View className="flex-row justify-between mb-3">
            <Text className="text-sm text-muted">Total Distributions</Text>
            <Text className="text-lg font-bold text-foreground">{distributionCount}</Text>
          </View>
          
          <View className="flex-row justify-between mb-3">
            <Text className="text-sm text-muted">Next Distribution</Text>
            <View className="items-end">
              <Text className="text-sm font-bold text-primary">
                {timeUntilDistribution || "Calculating..."}
              </Text>
              {lastDistributionDate && (
                <Text className="text-xs text-muted mt-0.5">
                  (7 days from {new Date(lastDistributionDate).toLocaleDateString()})
                </Text>
              )}
            </View>
          </View>
          
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Distribution Status</Text>
            <Text className={`text-sm font-bold ${canDistribute ? "text-success" : "text-muted"}`}>
              {canDistribute ? "Ready" : "Pending"}
            </Text>
          </View>
        </View>

        {/* Unclaimed Rewards - Individual Claim Buttons */}
        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-semibold text-foreground">Unclaimed Rewards</Text>
            <Text className="text-xs text-muted">
              {new Date(lastRefreshTime).toLocaleTimeString()}
            </Text>
          </View>
          {isLoadingRewards ? (
            <View className="bg-surface border border-border rounded-xl p-8">
              <ActivityIndicator size="large" color="#F7931A" />
            </View>
          ) : unclaimedRewardsList.length > 0 ? (
            unclaimedRewardsList.map((claim, index) => {
              const isClaiming = claimingDistributionId === claim.distribution_id;
              return (
                <View 
                  key={`${claim.distribution_id}-${claim.index}`}
                  className="bg-surface border border-border rounded-xl p-4 mb-3"
                >
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1">
                      <Text className="text-xl font-bold text-foreground">
                        {ethers.formatUnits(claim.amount, 8)} BTC1
                      </Text>
                      <Text className="text-xs text-muted mt-1">
                        Distribution #{claim.distribution_id}
                      </Text>
                      <Text className="text-xs text-muted">
                        {new Date(claim.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View className="bg-success/20 px-3 py-1 rounded-full">
                      <Text className="text-xs font-bold text-success">Unclaimed</Text>
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    onPress={() => handleClaim(claim)}
                    disabled={isClaiming || claimingDistributionId !== null}
                    className={`py-3 rounded-xl items-center ${
                      isClaiming || claimingDistributionId !== null
                        ? "bg-muted/50"
                        : "bg-success"
                    }`}
                  >
                    {isClaiming ? (
                      <View className="flex-row items-center">
                        <ActivityIndicator size="small" color="#fff" />
                        <Text className="text-white text-sm font-bold ml-2">
                          Claiming...
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-white text-sm font-bold">
                        Claim {ethers.formatUnits(claim.amount, 8)} BTC1
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <View className="bg-surface border border-border rounded-xl p-6">
              <Text className="text-sm text-muted text-center">✨ No unclaimed rewards</Text>
              <Text className="text-xs text-muted text-center mt-1">Check back after the next distribution</Text>
            </View>
          )}
        </View>

        {/* How It Works */}
        <View className="bg-surface border-2 border-border rounded-2xl p-5 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">How It Works</Text>
          <Text className="text-sm text-muted leading-6">
            💰 Weekly distributions from protocol surplus{"\n"}
            📊 Rewards proportional to your BTC1 holdings{"\n"}
            🎁 90% to holders, 10% to charity{"\n"}
            ⏰ Claim anytime after distribution
          </Text>
        </View>

        {/* Info Notice */}
        <View className="p-4 bg-primary/10 rounded-xl border border-primary/20">
          <Text className="text-xs text-muted text-center">
            ℹ️ Rewards are distributed every Friday at 14:00 UTC when surplus exists
          </Text>
        </View>
      </ScrollView>

      {/* Claim Confirmation Modal */}
      {currentClaim && (
        <TransactionConfirmModal
          visible={showConfirmModal}
          title="Confirm Claim"
          description="Review and confirm your rewards claim"
          actionText="Claim"
          amount={ethers.formatUnits(currentClaim.amount, 8)}
          token="BTC1"
          network="Base Sepolia"
          gasEstimate="~0.001 ETH"
          transactionDetails={[
            { label: "Distribution", value: `#${currentClaim.distribution_id}` },
            { label: "Network", value: "Base Sepolia" },
            { label: "Gas Estimate", value: "~0.001 ETH" },
            { label: "Date", value: new Date(currentClaim.created_at).toLocaleDateString() },
            { label: "Action", value: "Claim Rewards", isHighlight: true }
          ]}
          onConfirm={confirmClaim}
          onCancel={cancelClaim}
          isProcessing={claimingDistributionId === currentClaim.distribution_id}
          processingMessage="Claiming your rewards..."
        />
      )}

      {/* Error Modal */}
      <ErrorModal
        visible={showErrorModal}
        title="Claim Failed"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </ScreenContainer>
  );
}
