import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { safeContractCall } from "@/lib/wallet-keep-alive";

export function useBtc1Balance() {
  const { provider, readOnlyProvider, address } = useWeb3();
  const [balance, setBalance] = useState(0);
  const [formattedBalance, setFormattedBalance] = useState("0.00");
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalance = async () => {
    console.log('useBtc1Balance - address:', !!address, 'readOnlyProvider:', !!readOnlyProvider, 'provider:', !!provider);
    if (!address) {
      console.log('useBtc1Balance - No address');
      return;
    }
    
    // Use readOnlyProvider for read operations to avoid WalletConnect timeouts
    const providerToUse = readOnlyProvider || provider;
    if (!providerToUse) {
      console.log('useBtc1Balance - No provider available');
      return;
    }

    try {
      setIsLoading(true);
      
      // Add small delay to allow provider to stabilize after network change
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify we're on the correct network (Base Sepolia = 84532)
      const network = await providerToUse.getNetwork();
      console.log('useBtc1Balance - network chainId:', Number(network.chainId));
      if (Number(network.chainId) !== 84532) {
        console.warn(`Wrong network: ${network.chainId}. Expected Base Sepolia (84532)`);
        setBalance(0);
        setFormattedBalance("0.00");
        return;
      }
      
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.BTC1USD,
        ABIS.BTC1USD,
        providerToUse
      );

      // Check if contract exists
      const code = await providerToUse.getCode(CONTRACT_ADDRESSES.BTC1USD);
      if (code === '0x') {
        console.warn(`BTC1USD contract not found at ${CONTRACT_ADDRESSES.BTC1USD}`);
        setBalance(0);
        setFormattedBalance("0.00");
        return;
      }

      const bal = await safeContractCall(
        async () => contract.balanceOf(address),
        providerToUse,
        "BTC1 balance"
      );
      // BTC1 uses 8 decimals (like Bitcoin)
      const formatted = ethers.formatUnits(bal, 8);
      
      console.log('useBtc1Balance - Balance fetched:', formatted, 'raw:', bal.toString());
      setBalance(parseFloat(formatted));
      setFormattedBalance(formatted);
    } catch (error: any) {
      // Ignore network change errors - they're expected during network switches
      if (error?.code === 'NETWORK_ERROR' && error?.message?.includes('network changed')) {
        console.log('Network is changing, will retry on next fetch cycle');
        return;
      }
      console.error("Error fetching balance:", error.message || error);
      setBalance(0);
      setFormattedBalance("0.00");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('useBtc1Balance - useEffect triggered, address:', address);
    fetchBalance();
    // Refresh every 15 seconds
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [address, provider, readOnlyProvider]);

  return {
    balance,
    formattedBalance,
    isLoading,
    refetch: fetchBalance,
  };
}
