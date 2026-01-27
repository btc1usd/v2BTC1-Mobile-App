import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { CONTRACT_ADDRESSES, ABIS } from "@/lib/shared/contracts";
import { getResilientProvider } from "@/lib/rpc-provider-resilient";

export function useBtc1Balance() {
  const { readProvider, address, chainId } = useWeb3();
  const [balance, setBalance] = useState(0);
  const [formattedBalance, setFormattedBalance] = useState("0.00");
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalance = async () => {
    if (!address || !chainId) {
      return;
    }

    try {
      setIsLoading(true);
      
      // Use resilient RPC provider with automatic retry and failover
      const resilientRPC = getResilientProvider(chainId);
      
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.BTC1USD,
        ABIS.BTC1USD
      );

      // Resilient call with automatic retry
      const bal = await resilientRPC.call(contract, 'balanceOf', [address]);
      
      // Handle case where bal might be null (shouldn't happen after fix but good to be safe)
      const balanceValue = bal !== null ? bal : BigInt(0);
      
      // BTC1 uses 8 decimals (like Bitcoin)
      const formatted = ethers.formatUnits(balanceValue, 8);
      
      console.log('✅ BTC1 Balance:', formatted);
      setBalance(parseFloat(formatted));
      setFormattedBalance(formatted);
    } catch (error: any) {
      // Ignore network change errors - they're expected during network switches
      if (error?.code === 'NETWORK_ERROR' && error?.message?.includes('network changed')) {
        console.log('Network is changing, will retry on next fetch cycle');
        return;
      }
      console.error("❌ Error fetching balance:", error.message || error);
      setBalance(0);
      setFormattedBalance("0.00");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    // Removed aggressive polling - balances update on:
    // 1. Address or chainId change
    // 2. Manual refetch() call after transactions
    // 3. Parent component control via refetch()
  }, [address, chainId]);

  return {
    balance,
    formattedBalance,
    isLoading,
    refetch: fetchBalance,
  };
}
