import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { fetchCurrentDistribution } from "@/lib/supabase";

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
    // CRITICAL: Use readProvider for all reads - NEVER WalletConnect
    if (!readProvider) return;

    try {
      setIsLoading(true);
      
      // OPTIMIZED: Direct contract call - no network check needed (RPC is always on correct network)
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.WEEKLY_DISTRIBUTION,
        ABIS.WEEKLY_DISTRIBUTION,
        readProvider
      );

      // Check if contract exists
      const code = await readProvider.getCode(CONTRACT_ADDRESSES.WEEKLY_DISTRIBUTION);
      if (code === '0x') {
        console.warn(`WeeklyDistribution contract not found at ${CONTRACT_ADDRESSES.WEEKLY_DISTRIBUTION}`);
        return;
      }

      const [count, can] = await Promise.all([
        contract.distributionCount(),
        contract.canDistribute(),
      ]);

      const countNum = Number(count);
      setDistributionCount(countNum);
      setCanDistribute(can);

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
          
          console.log('Distribution data updated:', {
            countNum,
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
      console.error("Error fetching distribution data:", error.message || error);
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
  }, [readProvider, chainId]);

  return {
    distributionCount,
    nextDistributionTime,
    timeUntilDistribution,
    canDistribute,
    isLoading,
    lastDistributionDate,
  };
}
