import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { CONTRACT_ADDRESSES, ABIS, COLLATERAL_TOKENS } from "@/lib/shared/contracts";
import { getResilientProvider } from "@/lib/rpc-provider-resilient";

/**
 * Hook to fetch vault's collateral balances - how much of each collateral token the vault holds
 */
export interface VaultCollateralBalance {
  symbol: string;
  address: string;
  balance: string; // Raw balance as string
  formatted: string; // Formatted balance with decimals
  decimals: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseVaultCollateralBalancesResult {
  balances: Record<string, VaultCollateralBalance>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getBalance: (symbol: string) => VaultCollateralBalance;
}

export function useVaultCollateralBalances(): UseVaultCollateralBalancesResult {
  const { readProvider, chainId } = useWeb3();
  const [balances, setBalances] = useState<Record<string, VaultCollateralBalance>>(() => {
    return COLLATERAL_TOKENS.reduce((acc, token) => {
      acc[token.symbol] = {
        symbol: token.symbol,
        address: token.address,
        balance: "0",
        formatted: "0",
        decimals: token.decimals,
        isLoading: true,
        error: null,
      };
      return acc;
    }, {} as Record<string, VaultCollateralBalance>);
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = async () => {
    if (!chainId) {
      setError("No chain ID available");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use resilient RPC provider with automatic retry and failover
      const resilientRPC = getResilientProvider(chainId);
      
      const vaultContract = new ethers.Contract(
        CONTRACT_ADDRESSES.VAULT,
        ABIS.VAULT
      );

      // Prepare batch calls for all collateral tokens
      const batchCalls = COLLATERAL_TOKENS.map(token => ({
        contract: vaultContract,
        method: 'collateralBalances',
        params: [token.address],
      }));

      // Execute batch call to get all collateral balances
      const results = await resilientRPC.batchCall(batchCalls);

      // Process results and update state
      const newBalances = { ...balances };
      
      for (let i = 0; i < COLLATERAL_TOKENS.length; i++) {
        const token = COLLATERAL_TOKENS[i];
        const rawBalance = results[i];
        
        if (rawBalance !== null && rawBalance !== undefined) {
          const formatted = ethers.formatUnits(rawBalance.toString(), token.decimals);
          
          newBalances[token.symbol] = {
            symbol: token.symbol,
            address: token.address,
            balance: rawBalance.toString(),
            formatted,
            decimals: token.decimals,
            isLoading: false,
            error: null,
          };
        } else {
          // Handle case where balance couldn't be fetched
          newBalances[token.symbol] = {
            ...newBalances[token.symbol],
            isLoading: false,
            error: "Failed to fetch balance",
          };
        }
      }

      setBalances(newBalances);
    } catch (err: any) {
      console.error("Error fetching vault collateral balances:", err);
      setError(err?.message || "Failed to fetch vault collateral balances");
      
      // Set error state for all balances
      const errorBalances = { ...balances };
      Object.keys(errorBalances).forEach(symbol => {
        errorBalances[symbol] = {
          ...errorBalances[symbol],
          isLoading: false,
          error: err?.message || "Failed to fetch balance",
        };
      });
      setBalances(errorBalances);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [chainId]);

  const getBalance = (symbol: string): VaultCollateralBalance => {
    return balances[symbol] || {
      symbol,
      address: "",
      balance: "0",
      formatted: "0",
      decimals: 8,
      isLoading: false,
      error: "Token not found",
    };
  };

  const refetch = async () => {
    await fetchBalances();
  };

  return {
    balances,
    isLoading,
    error,
    refetch,
    getBalance,
  };
}