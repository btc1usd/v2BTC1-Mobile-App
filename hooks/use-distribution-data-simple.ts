import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { fetchCurrentDistribution } from "@/lib/supabase";
import { getResilientProvider } from "@/lib/rpc-provider-resilient";

export function useDistributionData() {
  const { readProvider, chainId } = useWeb3();
  const [distributionCount, setDistributionCount] = useState(0);
  const [nextDistributionTime, setNextDistributionTime] = useState(0);
  const [timeUntilDistribution, setTimeUntilDistribution] = useState<string | null>(null);
  const [canDistribute, setCanDistribute] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastDistributionDate, setLastDistributionDate] = useState<Date | null>(null);

  const calculateTimeUntil = (timestamp: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = timestamp - now;

    if (diff <= 0) return "Available now";

    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const fetchDistributionData = async () => {
    if (!chainId) {
      console.log('useDistributionData - No chainId available');
      return;
    }

    try {
      setIsLoading(true);
      
      // Use resilient RPC provider with automatic retry and failover
      const resilientRPC = getResilientProvider(chainId);
      
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.WEEKLY_DISTRIBUTION,
        ABIS.WEEKLY_DISTRIBUTION
      );

      // Batch fetch with resilient provider
      const [count, can] = await resilientRPC.batchCall([
        { contract, method: 'distributionCount' },
        { contract, method: 'canDistribute' },
      ]);

      const countNum = count ? Number(count) : 0;
      setDistributionCount(countNum);
      setCanDistribute(can ?? false);

      // Fetch last distribution from Supabase to calculate 7 days
      try {
        const lastDist = await fetchCurrentDistribution();
        if (lastDist && lastDist.created_at) {
          const lastDistDate = new Date(lastDist.created_at);
          setLastDistributionDate(lastDistDate);
          
          // Calculate 7 days from last distribution
          const nextDistDate = new Date(lastDistDate);
          nextDistDate.setDate(nextDistDate.getDate() + 7);
          
          const nextTimeTimestamp = Math.floor(nextDistDate.getTime() / 1000);
          setNextDistributionTime(nextTimeTimestamp);
          setTimeUntilDistribution(calculateTimeUntil(nextTimeTimestamp));
          
          console.log('✅ Distribution data updated:', {
            count: countNum,
            lastDist: lastDistDate.toISOString(),
            nextDist: nextDistDate.toISOString(),
            canDistribute: can
          });
        } else {
          console.warn('No distribution data in Supabase');
          setTimeUntilDistribution('No distributions yet');
        }
      } catch (supabaseError: any) {
        console.error('Error fetching distribution from Supabase:', supabaseError.message);
        setTimeUntilDistribution('Unable to calculate');
      }
      
    } catch (error: any) {
      console.error("❌ Error fetching distribution data:", error.message || error);
      // Keep previous values on error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDistributionData();
    // OPTIMIZED: Removed 60s polling - distribution data updates on:
    // 1. Component mount or chainId change
    // 2. Manual refresh via pull-to-refresh in parent component
  }, [chainId]);

  return {
    distributionCount,
    nextDistributionTime,
    timeUntilDistribution,
    canDistribute,
    isLoading,
    lastDistributionDate,
    refetch: fetchDistributionData, // Expose refetch function
  };
}
