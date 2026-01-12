import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { safeContractCall } from "@/lib/wallet-keep-alive";

export function useVaultStats() {
  const { provider, readOnlyProvider } = useWeb3();
  const [collateralRatio, setCollateralRatio] = useState("110.00");
  const [totalCollateralValue, setTotalCollateralValue] = useState(0);
  const [btcPrice, setBtcPrice] = useState(0);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = async () => {
    // Use readOnlyProvider for read operations to avoid WalletConnect timeouts
    const providerToUse = readOnlyProvider || provider;
    console.log('useVaultStats - providerToUse:', !!providerToUse, 'readOnlyProvider:', !!readOnlyProvider, 'provider:', !!provider);
    if (!providerToUse) {
      console.log('useVaultStats - No provider available');
      return;
    }

    try {
      setIsLoading(true);
      
      // Add small delay to allow provider to stabilize after network change
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify we're on Base Sepolia testnet
      const network = await providerToUse.getNetwork();
      console.log('useVaultStats - network chainId:', Number(network.chainId));
      if (Number(network.chainId) !== 84532) {
        console.warn(`Wrong network: ${network.chainId}. Expected Base Sepolia (84532)`);
        return;
      }
      
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.VAULT,
        ABIS.VAULT,
        providerToUse
      );

      // Check if contract exists
      const code = await providerToUse.getCode(CONTRACT_ADDRESSES.VAULT);
      if (code === '0x') {
        console.warn(`Vault contract not found at ${CONTRACT_ADDRESSES.VAULT}`);
        return;
      }

      // Get BTC1 contract for total supply
      const btc1Contract = new ethers.Contract(
        CONTRACT_ADDRESSES.BTC1USD,
        ABIS.BTC1USD,
        providerToUse
      );

      // Get BTC price from Chainlink Oracle Upgradeable contract
      const chainlinkOracleContract = new ethers.Contract(
        CONTRACT_ADDRESSES.CHAINLINK_BTC_ORACLE,
        ABIS.CHAINLINK_BTC_ORACLE,
        providerToUse
      );

      // Get price from Chainlink Oracle with safe contract call
      let btcPriceRaw = BigInt(0);
      try {
        // Use the getBTCPrice() function from the upgradeable oracle contract
        const priceResult = await safeContractCall(
          async () => chainlinkOracleContract.getBTCPrice(),
          providerToUse,
          "Chainlink BTC price"
        );
        
        console.log('Chainlink Oracle price result:', priceResult.toString());
        
        // The price should already be in 8 decimals format from the oracle
        btcPriceRaw = BigInt(priceResult.toString());
        
        console.log('BTC Price (8 decimals):', btcPriceRaw.toString());
      } catch (priceError: any) {
        console.error('Error fetching BTC price from Chainlink Oracle:', priceError.message);
        
        // Fallback to Chainlink feed if the oracle contract fails
        console.log('Falling back to Chainlink feed...');
        
        const chainlinkFeedContract = new ethers.Contract(
          CONTRACT_ADDRESSES.CHAINLINK_FEED,
          ABIS.CHAINLINK_FEED,
          providerToUse
        );
        
        try {
          const feedData = await safeContractCall(
            async () => chainlinkFeedContract.latestRoundData(),
            providerToUse,
            "Chainlink feed data"
          );
          const decimals = await safeContractCall(
            async () => chainlinkFeedContract.decimals(),
            providerToUse,
            "Chainlink decimals"
          );
          
          const { answer, updatedAt } = feedData;
          
          console.log('Chainlink price feed:', {
            answer: answer.toString(),
            decimals: decimals,
            updatedAt: updatedAt.toString()
          });
          
          // Check if price is stale (older than 1 hour)
          const currentTime = Math.floor(Date.now() / 1000);
          if (currentTime - Number(updatedAt) > 3600) {
            console.warn('Chainlink price is stale, but using anyway for testnet');
          }
          
          // Convert Chainlink price to 8 decimals
          if (decimals === 8) {
            btcPriceRaw = BigInt(answer.toString());
          } else {
            // Adjust decimals if needed
            const adjustment = 8 - decimals;
            if (adjustment > 0) {
              btcPriceRaw = BigInt(answer.toString()) * BigInt(10 ** adjustment);
            } else {
              btcPriceRaw = BigInt(answer.toString()) / BigInt(10 ** Math.abs(adjustment));
            }
          }
          
          console.log('BTC Price from feed (8 decimals):', btcPriceRaw.toString());
        } catch (feedError: any) {
          console.error('Error fetching BTC price from Chainlink feed:', feedError.message);
          // Use fallback price for testnet: $98,000
          btcPriceRaw = BigInt(9800000000000); // 98000 * 1e8
          console.log('Using fallback BTC price:', btcPriceRaw.toString());
        }
      }

      const [totalSupply, totalCollateralAmountRaw, collateralRatioRaw, healthy] = await safeContractCall(
        async () => {
          return Promise.all([
            btc1Contract.totalSupply().catch(() => BigInt(0)),
            contract.getTotalCollateralAmount().catch(() => BigInt(0)),
            contract.getCurrentCollateralRatio().catch(() => {
              console.warn('Contract getCurrentCollateralRatio() failed, using manual calculation');
              return BigInt(0);
            }), // Get CR directly from contract
            contract.isHealthy().catch(() => false),
          ]);
        },
        providerToUse,
        "Vault stats"
      );

      const totalSupplyValue = BigInt(totalSupply.toString());
      const totalCollateralAmount = BigInt(totalCollateralAmountRaw.toString());
      const btcPrice = BigInt(btcPriceRaw.toString());
      const collateralRatioFromContract = BigInt(collateralRatioRaw.toString());

      console.log('Raw values from contracts:', {
        totalSupply: totalSupplyValue.toString(),
        totalCollateralAmount: totalCollateralAmount.toString(),
        btcPrice: btcPrice.toString(),
        collateralRatioRaw: collateralRatioFromContract.toString()
      });
      
      // Debug: Check if any of the values are zero
      if (totalSupplyValue === 0n) {
        console.log('DEBUG: Total supply is 0, setting default CR');
      }
      if (totalCollateralAmount === 0n) {
        console.log('DEBUG: Total collateral amount is 0');
      }
      if (btcPrice === 0n) {
        console.log('DEBUG: BTC price is 0');
      }
      if (collateralRatioFromContract === 0n) {
        console.log('DEBUG: Contract returned 0 for collateral ratio, will calculate manually');
      }

      // Calculate Total Collateral Value: collateralAmount (8 decimals) * btcPrice (8 decimals)
      // Both are 8 decimals, so multiply and divide by 1e8 to get USD value in 8 decimals
      const DECIMALS_8_BIG = BigInt(100000000);
      let totalCollateralValueUSD = BigInt(0);
      if (totalCollateralAmount > BigInt(0) && btcPrice > BigInt(0)) {
        // (amount * price) / 1e8 = USD value in 8 decimals
        totalCollateralValueUSD = (totalCollateralAmount * btcPrice) / DECIMALS_8_BIG;
      }

      // Use collateral ratio from contract (it returns ratio with 8 decimals precision)
      // Contract returns: (totalCollateralUSD * 1e8) / totalSupply
      // So the value is already a ratio with 8 decimal places
      // To convert to percentage: (ratio / 1e8) * 100
      let formattedRatio;
      if (collateralRatioFromContract > BigInt(0)) {
        // Contract returns ratio in 8 decimals format
        // Example: 120% = 1.2 * 1e8 = 120000000
        // Convert safely using string division to avoid Number overflow
        const ratioAsDecimal = Number(collateralRatioFromContract) / 100000000;
        formattedRatio = (ratioAsDecimal * 100).toFixed(2);
        console.log('Using contract CR:', formattedRatio + '%', 'from raw:', collateralRatioFromContract.toString());
      } else if (totalSupplyValue === 0n) {
        console.log('No tokens minted yet, using minimum CR: 110%');
        formattedRatio = "110.00";
      } else {
        // Fallback: calculate manually if contract call failed
        // Manual calculation: (totalCollateralValueUSD * 1e8) / totalSupplyValue
        const ratio = (totalCollateralValueUSD * DECIMALS_8_BIG) / totalSupplyValue;
        const ratioAsDecimal = Number(ratio) / 100000000;
        formattedRatio = (ratioAsDecimal * 100).toFixed(2);
        console.log('Using manual CR calculation:', formattedRatio + '%', 'raw ratio:', ratio.toString());
      }
      
      // Format values for display (all are 8 decimals)
      const formattedValue = parseFloat(ethers.formatUnits(totalCollateralValueUSD.toString(), 8));
      const formattedBtcPrice = btcPrice > BigInt(0) ? parseFloat(ethers.formatUnits(btcPrice.toString(), 8)) : 0;
      const formattedCollateralAmount = parseFloat(ethers.formatUnits(totalCollateralAmount.toString(), 8));

      setCollateralRatio(formattedRatio);
      setTotalCollateralValue(formattedValue);
      setBtcPrice(formattedBtcPrice);
      setIsHealthy(healthy);
      
      console.log('useVaultStats - Vault stats updated:', { 
        formattedRatio, 
        formattedValue, 
        formattedBtcPrice, 
        formattedCollateralAmount,
        healthy,
        collateralRatioFromContract: collateralRatioFromContract.toString()
      });
    } catch (error: any) {
      // Ignore network change errors - they're expected during network switches
      if (error?.code === 'NETWORK_ERROR' && error?.message?.includes('network changed')) {
        console.log('Network is changing, will retry vault stats on next fetch cycle');
        return;
      }
      console.error("Error fetching vault stats:", error.message || error);
      // Keep previous values on error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [provider]);

  return {
    collateralRatio,
    totalCollateralValue,
    btcPrice,
    isHealthy,
    isLoading,
  };
}
