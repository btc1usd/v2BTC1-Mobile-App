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
import { useWallet } from "@/hooks/use-wallet-wc";
import { useBtc1Balance } from "@/hooks/use-btc1-balance-simple";
import { useVaultStats } from "@/hooks/use-vault-stats-simple";
import { useDistributionData } from "@/hooks/use-distribution-data-simple";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { NetworkBanner } from "./network-indicator";
import { DebugPanel } from "./debug-panel";
import { WalletHeader } from "./wallet-header";

export function DashboardScreen() {
  const { address, disconnectWallet } = useWallet();
  const web3 = useWeb3();
  const { provider, readOnlyProvider, chainId } = web3;
  const wcProvider = web3.wcProvider;
  
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [totalSupply, setTotalSupply] = useState("0");
  const [isLoadingSupply, setIsLoadingSupply] = useState(false);

  // Collateral balances
  const [wbtcBalance, setWbtcBalance] = useState("0");
  const [cbBtcBalance, setCbBtcBalance] = useState("0");
  const [tBtcBalance, setTBtcBalance] = useState("0");
  const [isLoadingCollateral, setIsLoadingCollateral] = useState(false);

  // Hooks for real data
  const { balance, formattedBalance, isLoading: isLoadingBalance, refetch: refetchBalance } = useBtc1Balance();
  const { collateralRatio, totalCollateralValue, btcPrice, isHealthy, isLoading: isLoadingVault } = useVaultStats();
  const { timeUntilDistribution, isLoading: isLoadingDist } = useDistributionData();

  // Fetch total supply
  useEffect(() => {
    const fetchTotalSupply = async () => {
      const providerToUse = readOnlyProvider || provider;
      if (!providerToUse) return;

      try {
        setIsLoadingSupply(true);
        const btc1Contract = new ethers.Contract(
          CONTRACT_ADDRESSES.BTC1USD,
          ABIS.BTC1USD,
          providerToUse
        );
        const supply = await btc1Contract.totalSupply();
        setTotalSupply(ethers.formatUnits(supply, 8));
      } catch {
        // Silent fail
      } finally {
        setIsLoadingSupply(false);
      }
    };

    fetchTotalSupply();
    const interval = setInterval(fetchTotalSupply, 30000);
    return () => clearInterval(interval);
  }, [provider, readOnlyProvider, chainId]);

  // Fetch collateral balances
  useEffect(() => {
    const fetchCollateralBalances = async () => {
      const providerToUse = readOnlyProvider || provider;
      if (!providerToUse) return;

      try {
        setIsLoadingCollateral(true);
        await new Promise(resolve => setTimeout(resolve, 100));

        const wbtcContract = new ethers.Contract(CONTRACT_ADDRESSES.WBTC_TOKEN, ABIS.ERC20, providerToUse);
        const cbBtcContract = new ethers.Contract(CONTRACT_ADDRESSES.CBBTC_TOKEN, ABIS.ERC20, providerToUse);
        const tBtcContract = new ethers.Contract(CONTRACT_ADDRESSES.TBTC_TOKEN, ABIS.ERC20, providerToUse);

        const [wbtc, cbbtc, tbtc] = await Promise.all([
          wbtcContract.balanceOf(CONTRACT_ADDRESSES.VAULT).catch(() => BigInt(0)),
          cbBtcContract.balanceOf(CONTRACT_ADDRESSES.VAULT).catch(() => BigInt(0)),
          tBtcContract.balanceOf(CONTRACT_ADDRESSES.VAULT).catch(() => BigInt(0)),
        ]);

        setWbtcBalance(ethers.formatUnits(wbtc, 8));
        setCbBtcBalance(ethers.formatUnits(cbbtc, 8));
        setTBtcBalance(ethers.formatUnits(tbtc, 8));
      } catch {
        // Silent fail
      } finally {
        setIsLoadingCollateral(false);
      }
    };

    fetchCollateralBalances();
    const interval = setInterval(fetchCollateralBalances, 30000);
    return () => clearInterval(interval);
  }, [provider, readOnlyProvider, chainId]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await refetchBalance();
    } catch {
      // Silent fail
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

  const totalCollateral = parseFloat(wbtcBalance) + parseFloat(cbBtcBalance) + parseFloat(tBtcBalance);
  
  // SENIOR FIX: Deterministic TVL calculation with fallback
  // totalCollateralValue from contract can be 0 or undefined on Base Sepolia
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
          <NetworkBanner chainId={chainId} wcProvider={wcProvider} />
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
                Available Rewards
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
                <Text className="text-4xl font-bold text-foreground">0.0000</Text>
                <Text className="text-sm text-muted mt-1">BTC1</Text>
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
              className="flex-1 bg-primary rounded-2xl p-4 items-center"
            >
              <Text className="text-2xl mb-2">➕</Text>
              <Text className="text-sm font-bold text-white">Mint</Text>
              <Text className="text-xs text-white/70">Deposit BTC</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleNavigate("/redeem")}
              className="flex-1 bg-surface rounded-2xl p-4 items-center border-2 border-border"
            >
              <Text className="text-2xl mb-2">➖</Text>
              <Text className="text-sm font-bold text-foreground">Redeem</Text>
              <Text className="text-xs text-muted">Withdraw BTC</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleNavigate("/rewards")}
              className="flex-1 bg-surface rounded-2xl p-4 items-center border-2 border-border"
            >
              <Text className="text-2xl mb-2">🎁</Text>
              <Text className="text-sm font-bold text-foreground">Rewards</Text>
              <Text className="text-xs text-muted">Claim</Text>
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
              value={isLoadingVault || isLoadingCollateral ? "..." : formatTVL(tvl)}
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

          {/* ───────── COLLATERAL BREAKDOWN ───────── */}
          <Text className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
            Vault Collateral
          </Text>
          <View className="bg-surface rounded-2xl border border-border overflow-hidden mb-6">
            <CollateralRow
              symbol="WBTC"
              name="Wrapped Bitcoin"
              amount={isLoadingCollateral ? "..." : parseFloat(wbtcBalance).toFixed(4)}
              total={totalCollateral}
              value={parseFloat(wbtcBalance)}
            />
            <View className="h-px bg-border" />
            <CollateralRow
              symbol="cbBTC"
              name="Coinbase Bitcoin"
              amount={isLoadingCollateral ? "..." : parseFloat(cbBtcBalance).toFixed(4)}
              total={totalCollateral}
              value={parseFloat(cbBtcBalance)}
            />
            <View className="h-px bg-border" />
            <CollateralRow
              symbol="tBTC"
              name="Threshold Bitcoin"
              amount={isLoadingCollateral ? "..." : parseFloat(tBtcBalance).toFixed(4)}
              total={totalCollateral}
              value={parseFloat(tBtcBalance)}
            />
          </View>

          {/* ───────── WALLET INFO ───────── */}
          <View className="bg-surface rounded-2xl p-4 border border-border">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-success mr-2" />
                <Text className="text-xs text-muted">Connected</Text>
              </View>
              <Text className="text-xs font-mono text-foreground">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
              </Text>
            </View>
          </View>

          {/* Info */}
          <View className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
            <Text className="text-xs text-muted text-center leading-5">
              💡 BTC1 is a Bitcoin-backed stablecoin. Mint by depositing BTC collateral, 
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
