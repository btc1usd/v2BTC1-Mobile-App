import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { getResilientProvider } from "@/lib/rpc-provider-resilient";

export function useVaultStats() {
  const { readProvider, chainId } = useWeb3();
  const [collateralRatio, setCollateralRatio] = useState("110.00");
  const [totalCollateralValue, setTotalCollateralValue] = useState(0);
  const [btcPrice, setBtcPrice] = useState(0);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = async () => {
    if (!chainId) {
      console.log('useVaultStats - No chainId available');
      return;
    }

    try {
      setIsLoading(true);
      
      // Use resilient RPC provider with automatic retry and failover
      const resilientRPC = getResilientProvider(chainId);
      
      const vaultContract = new ethers.Contract(
        CONTRACT_ADDRESSES.VAULT,
        ABIS.VAULT
      );

      const btc1Contract = new ethers.Contract(
        CONTRACT_ADDRESSES.BTC1USD,
        ABIS.BTC1USD
      );

      const chainlinkOracleContract = new ethers.Contract(
        CONTRACT_ADDRESSES.CHAINLINK_BTC_ORACLE,
        ABIS.CHAINLINK_BTC_ORACLE
      );

      // Batch fetch all data in parallel with resilient provider
      console.log('🔍 Fetching vault stats from contracts...');
      
      // Fetch with individual try-catch for each call to prevent one failure from blocking others
      let totalSupply, totalCollateralAmountRaw, collateralRatioRaw, healthy, btcPriceRaw;
      
      try {
        const results = await resilientRPC.batchCall([
          { contract: btc1Contract, method: 'totalSupply' },
          { contract: vaultContract, method: 'getTotalCollateralAmount' },
          { contract: vaultContract, method: 'getCurrentCollateralRatio' },
          { contract: vaultContract, method: 'isHealthy' },
          { contract: chainlinkOracleContract, method: 'getBTCPrice' },
        ]);
        [totalSupply, totalCollateralAmountRaw, collateralRatioRaw, healthy, btcPriceRaw] = results;
      } catch (batchError: any) {
        console.warn('⚠️ Batch call failed, using fallback values:', batchError.message);
        // Use safe fallback values when contract calls fail
        totalSupply = BigInt(0);
        totalCollateralAmountRaw = BigInt(0);
        collateralRatioRaw = BigInt(11000000000); // 110% in 8 decimals
        healthy = true;
        btcPriceRaw = BigInt(9800000000000); // $98,000 in 8 decimals
      }

      // Handle null responses from failed calls
      const totalSupplyValue = totalSupply ? BigInt(totalSupply.toString()) : BigInt(0);
      const totalCollateralAmount = totalCollateralAmountRaw ? BigInt(totalCollateralAmountRaw.toString()) : BigInt(0);
      const collateralRatioFromContract = collateralRatioRaw ? BigInt(collateralRatioRaw.toString()) : BigInt(0);
      const isHealthyValue = healthy ?? false;
      
      // Check if we're using fallback data
      const usingFallbackData = !totalSupply || !totalCollateralAmountRaw || !collateralRatioRaw || !btcPriceRaw;
      if (usingFallbackData) {
        console.log('📋 Some contract calls returned null, using fallback values for missing data');
      }
      
      // BTC Price with fallback
      let btcPrice = BigInt(0);
      if (btcPriceRaw) {
        btcPrice = BigInt(btcPriceRaw.toString());
      } else {
        // Fallback: $98,000 for testnet
        btcPrice = BigInt(9800000000000); // 98000 * 1e8
        console.log('🔶 Using fallback BTC price:', btcPrice.toString());
      }

      console.log('📊 Raw Vault Data:', {
        totalSupply: totalSupplyValue.toString(),
        totalCollateral: totalCollateralAmount.toString(),
        btcPrice: btcPrice.toString(),
        collateralRatioFromContract: collateralRatioFromContract.toString(),
        healthy: isHealthyValue
      });
      
      // Calculate Total Collateral Value: collateralAmount (8 decimals) * btcPrice (8 decimals)
      const DECIMALS_8_BIG = BigInt(100000000);
      let totalCollateralValueUSD = BigInt(0);
      if (totalCollateralAmount > BigInt(0) && btcPrice > BigInt(0)) {
        totalCollateralValueUSD = (totalCollateralAmount * btcPrice) / DECIMALS_8_BIG;
      }

      // Calculate collateral ratio with detailed logging
      let formattedRatio;
      if (collateralRatioFromContract > BigInt(0)) {
        // Contract returned valid ratio
        const ratioAsDecimal = Number(collateralRatioFromContract) / 100000000;
        formattedRatio = (ratioAsDecimal * 100).toFixed(2);
        console.log('✅ Using contract CR:', formattedRatio + '%', '(raw:', collateralRatioFromContract.toString() + ')');
      } else if (totalSupplyValue === 0n) {
        // No tokens minted yet, use minimum
        formattedRatio = "110.00";
        console.log('📌 No supply yet, using minimum CR: 110%');
      } else if (totalCollateralValueUSD > BigInt(0)) {
        // Calculate manually from collateral value
        const ratio = (totalCollateralValueUSD * DECIMALS_8_BIG) / totalSupplyValue;
        const ratioAsDecimal = Number(ratio) / 100000000;
        formattedRatio = (ratioAsDecimal * 100).toFixed(2);
        console.log('🧮 Calculated CR manually:', formattedRatio + '%', '(ratio:', ratio.toString() + ')');
      } else {
        // Fallback to minimum if all else fails
        formattedRatio = "110.00";
        console.log('⚠️ Unable to calculate CR, using minimum: 110%');
      }
      
      // Format values for display
      const formattedValue = parseFloat(ethers.formatUnits(totalCollateralValueUSD.toString(), 8));
      const formattedBtcPrice = btcPrice > BigInt(0) ? parseFloat(ethers.formatUnits(btcPrice.toString(), 8)) : 0;

      setCollateralRatio(formattedRatio);
      setTotalCollateralValue(formattedValue);
      setBtcPrice(formattedBtcPrice);
      setIsHealthy(isHealthyValue);
      
      console.log('✅ Vault stats updated:', { 
        collateralRatio: formattedRatio + '%', 
        tvl: '$' + formattedValue.toLocaleString(), 
        btcPrice: '$' + formattedBtcPrice.toLocaleString(), 
        healthy: isHealthyValue ? '✅' : '⚠️'
      });
    } catch (error: any) {
      if (error?.code === 'NETWORK_ERROR' && error?.message?.includes('network changed')) {
        console.log('Network is changing, will retry vault stats on next fetch cycle');
        return;
      }
      console.error("❌ Error fetching vault stats:", error.message || error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Removed aggressive polling - vault stats update on:
    // 1. Component mount or chainId change
    // 2. Manual refetch() call if needed
    // 3. Parent component control
  }, [chainId]);

  return {
    collateralRatio,
    totalCollateralValue,
    btcPrice,
    isHealthy,
    isLoading,
    refetch: fetchStats,
  };
}
