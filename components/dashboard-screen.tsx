import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "./screen-container";
import { useWallet } from "@/hooks/use-wallet";
import { useBtc1Balance } from '@/hooks/use-btc1-balance-simple';
import { useVaultStats } from '@/hooks/use-vault-stats-simple';
import { useVaultCollateralBalances } from '@/hooks/use-vault-collateral-balances';
import { useCollateralBalances } from '@/hooks/use-collateral-balances';
import { useDistributionData } from '@/hooks/use-distribution-data-simple';
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { NetworkBanner } from "./network-indicator";
import { DebugPanel } from "./debug-panel";
import { WalletHeader } from "./wallet-header";
import { fetchUserUnclaimedRewards } from "@/lib/supabase";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getResilientProvider } from "@/lib/rpc-provider-resilient";

export function DashboardScreen() {
  const { address, disconnectWallet } = useWallet();
  const web3 = useWeb3();
  const { readProvider, chainId } = web3;
  const colorScheme = useColorScheme();
  
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [totalSupply, setTotalSupply] = useState("0");
  const [isLoadingSupply, setIsLoadingSupply] = useState(false);

  // Use the new vault collateral balances hook
  const { balances: vaultCollateralBalances, isLoading: isLoadingVaultCollateral, refetch: refetchVaultCollateral } = useVaultCollateralBalances();
  
  // Use the user's collateral balances hook
  const { balances: userCollateralBalances, isLoading: isLoadingUserCollateral, refetch: refetchUserCollateral } = useCollateralBalances({
    userAddress: address,
    chainId,
    enabled: !!address && chainId === 8453
  });

  // Available rewards
  const [availableRewards, setAvailableRewards] = useState("0");
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);

  // Hooks for real data
  const { balance, formattedBalance, isLoading: isLoadingBalance, refetch: refetchBalance } = useBtc1Balance();
  const { collateralRatio, totalCollateralValue, btcPrice, isHealthy, isLoading: isLoadingVault, refetch: refetchVaultStats } = useVaultStats();
  const { timeUntilDistribution, isLoading: isLoadingDist } = useDistributionData();

  // Debug logging
  useEffect(() => {
    console.log('[Dashboard] Stats:', {
      collateralRatio,
      totalCollateralValue,
      btcPrice,
      totalSupply,
      isLoadingVault,
      isLoadingSupply
    });
  }, [collateralRatio, totalCollateralValue, btcPrice, totalSupply, isLoadingVault, isLoadingSupply]);

  // Fetch available rewards
  const fetchRewards = async () => {
    if (!readProvider || !address || chainId !== 8453) {
      return;
    }
    
    try {
      setIsLoadingRewards(true);
      const unclaimed = await fetchUserUnclaimedRewards(address, readProvider);
      
      if (unclaimed.length > 0) {
        const total = unclaimed.reduce((sum, claim) => {
          return sum + BigInt(claim.amount);
        }, BigInt(0));
        const totalFormatted = ethers.formatUnits(total, 8);
        setAvailableRewards(totalFormatted);
      } else {
        setAvailableRewards("0");
      }
    } catch (error) {
      console.error('Error fetching rewards:', error);
      setAvailableRewards("0");
    } finally {
      setIsLoadingRewards(false);
    }
  };

  useEffect(() => {
    fetchRewards();
  }, [readProvider, address, chainId]);

  // Refresh rewards when screen comes into focus (e.g., after claiming on rewards page)
  useFocusEffect(
    React.useCallback(() => {
      fetchRewards();
    }, [readProvider, address, chainId])
  );

  // Fetch total supply
  useEffect(() => {
    const fetchTotalSupply = async () => {
      if (!chainId) return;

      try {
        setIsLoadingSupply(true);
        
        // Use resilient RPC provider
        const resilientRPC = getResilientProvider(chainId);
        const btc1Contract = new ethers.Contract(
          CONTRACT_ADDRESSES.BTC1USD,
          ABIS.BTC1USD
        );
        
        const supply = await resilientRPC.call(btc1Contract, 'totalSupply');
        setTotalSupply(ethers.formatUnits(supply || BigInt(0), 8));
      } catch (e) {
        console.error('❌ Error fetching supply:', e);
      } finally {
        setIsLoadingSupply(false);
      }
    };

    fetchTotalSupply();
  }, [chainId]);



  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Refetch all dashboard data
      await Promise.all([
        refetchBalance(),
        refetchVaultStats(),
        refetchVaultCollateral(),
        refetchUserCollateral(),
        fetchRewards(),
      ]);
      
      // Also refetch total supply
      if (chainId) {
        const resilientRPC = getResilientProvider(chainId);
        
        try {
          const btc1Contract = new ethers.Contract(
            CONTRACT_ADDRESSES.BTC1USD,
            ABIS.BTC1USD
          );
          const supply = await resilientRPC.call(btc1Contract, 'totalSupply');
          setTotalSupply(ethers.formatUnits(supply || BigInt(0), 8));
        } catch (e) {
          console.error('Error refetching supply:', e);
        }
      }
    } catch (e) {
      console.error('Error refreshing dashboard:', e);
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  const handleDisconnect = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    disconnectWallet();
  };

  const handleNavigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  const totalCollateral = parseFloat(vaultCollateralBalances['WBTC']?.formatted || '0') + parseFloat(vaultCollateralBalances['cbBTC']?.formatted || '0') + parseFloat(vaultCollateralBalances['tBTC']?.formatted || '0');
  
  // SENIOR FIX: Deterministic TVL calculation with fallback
  // totalCollateralValue from contract can be 0 or undefined on Base Mainnet
  // Fallback: Calculate directly from collateral balances × BTC price
  const calculatedTVL = totalCollateral * btcPrice;
  const tvl = totalCollateralValue > 0 ? totalCollateralValue : calculatedTVL;
  
  // Format TVL with K/M scaling
  const formatTVL = (value: number) => {
    if (value === 0) return '$0.00';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  // Calculate user's total collateral
  const userTotalCollateral = parseFloat(userCollateralBalances['WBTC']?.formatted || '0') + 
                             parseFloat(userCollateralBalances['cbBTC']?.formatted || '0') + 
                             parseFloat(userCollateralBalances['tBTC']?.formatted || '0');

  const formatSupply = (supply: string) => {
    const num = parseFloat(supply);
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  return (
    <ScreenContainer>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Uniform Header - Wallet & Network */}
        <WalletHeader address={address} chainId={chainId} compact onDisconnect={disconnectWallet} />

        {/* Header */}
        <View className="px-6 pt-2 pb-2">
          <NetworkBanner chainId={chainId} />
          <DebugPanel />
        </View>

        <View className="px-6">
          {/* Title */}
          <View className="mb-6">
            <Text className="text-3xl font-bold text-foreground">Dashboard</Text>
            <Text className="text-sm text-muted">BTC1USD Protocol</Text>
          </View>

          {/* ───────── BALANCE CARD ───────── */}
          <View className="bg-surface rounded-3xl p-6 mb-3 border border-border">
            <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-4">
              Your Balance
            </Text>
            {isLoadingBalance ? (
              <ActivityIndicator size="small" color="#F7931A" />
            ) : (
              <>
                <Text className="text-5xl font-bold text-foreground">
                  {parseFloat(formattedBalance || "0").toFixed(4)}
                </Text>
                <Text className="text-lg text-muted mt-1">BTC1</Text>
              </>
            )}
          </View>

          {/* Swap Arrow */}
          <View className="items-center -my-2 z-10">
            <View className="w-10 h-10 rounded-full bg-surface border-4 border-background items-center justify-center">
              <Text className="text-lg">💰</Text>
            </View>
          </View>

          {/* ───────── REWARDS CARD ───────── */}
          <View className="bg-surface rounded-3xl p-6 mb-6 border border-border">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xs font-medium text-muted uppercase tracking-wide">
                Total Available to Claim
              </Text>
              <TouchableOpacity
                onPress={() => handleNavigate("/rewards")}
                className="bg-primary/10 px-3 py-1.5 rounded-full"
              >
                <Text className="text-xs font-bold text-primary">Claim →</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-end justify-between">
              <View>
                {isLoadingRewards ? (
                  <ActivityIndicator size="small" color="#F7931A" />
                ) : (
                  <>
                    <Text className="text-4xl font-bold text-foreground">
                      {parseFloat(availableRewards).toFixed(4)}
                    </Text>
                    <Text className="text-sm text-muted mt-1">BTC1</Text>
                  </>
                )}
              </View>
              <View className="items-end">
                <Text className="text-xs text-muted">Next Distribution</Text>
                <Text className="text-sm font-semibold text-foreground">
                  {isLoadingDist ? "..." : timeUntilDistribution || "Soon"}
                </Text>
              </View>
            </View>
          </View>

          {/* ───────── QUICK ACTIONS ───────── */}
          <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
            Quick Actions
          </Text>
          <View className="flex-row gap-3 mb-6">
            <TouchableOpacity
              onPress={() => handleNavigate("/mint")}
              className="flex-1 bg-surface rounded-2xl p-4 items-center border border-border"
            >
              <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mb-2">
                <Text className="text-2xl">🏛️</Text>
              </View>
              <Text 
                className="text-sm font-bold"
                style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000' }}
              >
                Mint
              </Text>
              <Text 
                className="text-xs"
                style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000', opacity: 0.7 }}
              >
                Deposit BTC
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleNavigate("/redeem")}
              className="flex-1 bg-surface rounded-2xl p-4 items-center border border-border"
            >
              <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mb-2">
                <Text className="text-2xl">💸</Text>
              </View>
              <Text 
                className="text-sm font-bold"
                style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000' }}
              >
                Redeem
              </Text>
              <Text 
                className="text-xs"
                style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000', opacity: 0.7 }}
              >
                Withdraw BTC
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleNavigate("/rewards")}
              className="flex-1 bg-surface rounded-2xl p-4 items-center border border-border"
            >
              <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mb-2">
                <Text className="text-2xl">🎁</Text>
              </View>
              <Text 
                className="text-sm font-bold"
                style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000' }}
              >
                Rewards
              </Text>
              <Text 
                className="text-xs"
                style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000', opacity: 0.7 }}
              >
                Claim
              </Text>
            </TouchableOpacity>
          </View>

          {/* ───────── PROTOCOL STATS ───────── */}
          <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
            Protocol Stats
          </Text>
          <View className="bg-surface rounded-2xl p-4 mb-6 border border-border">
            <StatRow
              label="Collateral Ratio"
              value={isLoadingVault ? "..." : `${collateralRatio}%`}
              status={isHealthy ? "healthy" : "warning"}
            />
            <View className="h-px bg-border my-1" />
            <StatRow
              label="Total Value Locked"
              value={isLoadingVault || isLoadingVaultCollateral ? "..." : formatTVL(tvl)}
            />
            <View className="h-px bg-border my-1" />
            <StatRow
              label="BTC1 Supply"
              value={isLoadingSupply ? "..." : formatSupply(totalSupply)}
            />
            <View className="h-px bg-border my-1" />
            <StatRow
              label="BTC Price"
              value={isLoadingVault ? "..." : `$${btcPrice.toLocaleString()}`}
              status="healthy"
            />
          </View>

          {/* ───────── VAULT COLLATERAL BREAKDOWN ───────── */}
          <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
            Vault Collateral
          </Text>
          <View className="bg-surface rounded-2xl border border-border overflow-hidden mb-6">
            <CollateralRow
              symbol="WBTC"
              name="Wrapped Bitcoin"
              amount={isLoadingVaultCollateral ? "..." : parseFloat(vaultCollateralBalances['WBTC']?.formatted || '0').toFixed(4)}
              total={totalCollateral}
              value={parseFloat(vaultCollateralBalances['WBTC']?.formatted || '0')}
            />
            <View className="h-px bg-border" />
            <CollateralRow
              symbol="cbBTC"
              name="Coinbase Bitcoin"
              amount={isLoadingVaultCollateral ? "..." : parseFloat(vaultCollateralBalances['cbBTC']?.formatted || '0').toFixed(4)}
              total={totalCollateral}
              value={parseFloat(vaultCollateralBalances['cbBTC']?.formatted || '0')}
            />
            <View className="h-px bg-border" />
            <CollateralRow
              symbol="tBTC"
              name="Threshold Bitcoin"
              amount={isLoadingVaultCollateral ? "..." : parseFloat(vaultCollateralBalances['tBTC']?.formatted || '0').toFixed(4)}
              total={totalCollateral}
              value={parseFloat(vaultCollateralBalances['tBTC']?.formatted || '0')}
            />
          </View>

          {/* ───────── YOUR WALLET COLLATERAL ───────── */}
          <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
            Your Wallet Collateral
          </Text>
          <View className="bg-surface rounded-2xl border border-border overflow-hidden mb-6">
            <CollateralRow
              symbol="WBTC"
              name="Wrapped Bitcoin"
              amount={isLoadingUserCollateral ? "..." : parseFloat(userCollateralBalances['WBTC']?.formatted || '0').toFixed(4)}
              total={userTotalCollateral}
              value={parseFloat(userCollateralBalances['WBTC']?.formatted || '0')}
            />
            <View className="h-px bg-border" />
            <CollateralRow
              symbol="cbBTC"
              name="Coinbase Bitcoin"
              amount={isLoadingUserCollateral ? "..." : parseFloat(userCollateralBalances['cbBTC']?.formatted || '0').toFixed(4)}
              total={userTotalCollateral}
              value={parseFloat(userCollateralBalances['cbBTC']?.formatted || '0')}
            />
            <View className="h-px bg-border" />
            <CollateralRow
              symbol="tBTC"
              name="Threshold Bitcoin"
              amount={isLoadingUserCollateral ? "..." : parseFloat(userCollateralBalances['tBTC']?.formatted || '0').toFixed(4)}
              total={userTotalCollateral}
              value={parseFloat(userCollateralBalances['tBTC']?.formatted || '0')}
            />
          </View>

          {/* Info */}
          <View className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
            <Text className="text-xs text-muted text-center leading-5">
              💡 BTC1 is a Bitcoin-backed coin. Mint by depositing BTC collateral, 
              redeem anytime to withdraw your Bitcoin.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function StatRow({ 
  label, 
  value, 
  status 
}: { 
  label: string; 
  value: string; 
  status?: "healthy" | "warning";
}) {
  return (
    <View className="flex-row justify-between items-center py-2">
      <Text className="text-sm text-muted">{label}</Text>
      <View className="flex-row items-center">
        <Text className={`text-sm font-semibold ${
          status === "healthy" ? "text-success" : 
          status === "warning" ? "text-destructive" : 
          "text-foreground"
        }`}>
          {value}
        </Text>
        {status && (
          <View className={`w-2 h-2 rounded-full ml-2 ${
            status === "healthy" ? "bg-success" : "bg-destructive"
          }`} />
        )}
      </View>
    </View>
  );
}

function CollateralRow({
  symbol,
  name,
  amount,
  total,
  value,
}: {
  symbol: string;
  name: string;
  amount: string;
  total: number;
  value: number;
}) {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  
  return (
    <View className="p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3">
            <Text className="text-sm font-bold">₿</Text>
          </View>
          <View>
            <Text className="text-sm font-bold text-foreground">{symbol}</Text>
            <Text className="text-xs text-muted">{name}</Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold text-foreground">{amount}</Text>
          <Text className="text-xs text-muted">{percentage}%</Text>
        </View>
      </View>
    </View>
  );
}
