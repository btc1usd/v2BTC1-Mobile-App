import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { ABIS, COLLATERAL_TOKENS } from "@/lib/shared/contracts";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { getResilientProvider } from "@/lib/rpc-provider-resilient";

/**
 * DeFi balance fetching hook with retry and caching
 */

export interface CollateralBalance {
  symbol: string;
  address: string;
  balance: string;
  formatted: string;
  decimals: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseCollateralBalancesResult {
  balances: Record<string, CollateralBalance>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getBalance: (symbol: string) => CollateralBalance;
}

interface UseCollateralBalancesOptions {
  userAddress: string | null;
  chainId: number | null;
  enabled?: boolean;
}

const EXPECTED_CHAIN_IDS = [8453];
const RETRY_DELAYS = [1000, 2000, 5000];
const STALE_TIME = 10000;


export function useCollateralBalances({
  userAddress,
  chainId,
  enabled = true,
}: UseCollateralBalancesOptions): UseCollateralBalancesResult {
  const { readProvider } = useWeb3();
  
  const [balances, setBalances] = useState<Record<string, CollateralBalance>>(() => {
    return COLLATERAL_TOKENS.reduce((acc, token) => {
      acc[token.symbol] = {
        symbol: token.symbol,
        address: token.address,
        balance: "0",
        formatted: "0",
        decimals: token.decimals,
        isLoading: false,
        error: null,
      };
      return acc;
    }, {} as Record<string, CollateralBalance>);
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);
  const cacheRef = useRef<Record<string, CollateralBalance>>({});
  const mountedRef = useRef(true);

  // CRITICAL: Always use RPC provider for reads - NEVER WalletConnect
  // This eliminates slow wallet communication for balance checks
  const getReadProvider = (): ethers.Provider => {
    return readProvider;
  };

  // Validate prerequisites
  const validatePrerequisites = (): {
    valid: boolean;
    reason?: string;
    readProvider?: ethers.Provider;
  } => {
    if (!enabled) {
      return { valid: false, reason: "Hook disabled" };
    }

    if (!userAddress || !ethers.isAddress(userAddress)) {
      return { valid: false, reason: "Invalid user address" };
    }

    // RPC provider is always available
    const readProvider = getReadProvider();

    // Network validation simplified - RPC provider is always on correct network
    return { valid: true, readProvider };
  };

  // Fetch single token balance with resilient RPC
  const fetchTokenBalance = async (
    token: typeof COLLATERAL_TOKENS[0],
    chainId: number,
    address: string
  ): Promise<CollateralBalance> => {
    try {
      const resilientRPC = getResilientProvider(chainId);
      const tokenContract = new ethers.Contract(token.address, ABIS.ERC20);

      const [rawBalance, contractDecimalsResult] = await resilientRPC.batchCall([
        { contract: tokenContract, method: 'balanceOf', params: [address] },
        { contract: tokenContract, method: 'decimals' },
      ]);

      // Handle case where decimals couldn't be fetched
      let contractDecimals = token.decimals; // fallback to predefined decimals
      if (contractDecimalsResult !== null && contractDecimalsResult !== undefined) {
        contractDecimals = contractDecimalsResult;
      }

      if (!rawBalance) {
        throw new Error('Failed to fetch balance');
      }

      const formatted = ethers.formatUnits(rawBalance, contractDecimals);

      return {
        symbol: token.symbol,
        address: token.address,
        balance: rawBalance.toString(),
        formatted,
        decimals: contractDecimals,
        isLoading: false,
        error: null,
      };
    } catch (err: any) {
      const errorMsg = err?.shortMessage || err?.message || "Failed to fetch balance";

      if (cacheRef.current[token.symbol]) {
        return {
          ...cacheRef.current[token.symbol],
          error: `Stale data (${errorMsg})`,
        };
      }

      return {
        symbol: token.symbol,
        address: token.address,
        balance: "0",
        formatted: "0",
        decimals: token.decimals,
        isLoading: false,
        error: errorMsg,
      };
    }
  };

  // Main fetch function with resilient RPC
  const fetchBalances = useCallback(async (force: boolean = false) => {
    if (isFetchingRef.current) return;

    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;
    
    if (!force && timeSinceLastFetch < STALE_TIME) return;

    const validation = validatePrerequisites();
    if (!validation.valid) {
      setError(validation.reason || "Cannot fetch balances");
      return;
    }

    if (!userAddress || !chainId) return;

    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const balancePromises = COLLATERAL_TOKENS.map(token =>
        fetchTokenBalance(token, chainId, userAddress)
      );

      const results = await Promise.all(balancePromises);

      const newBalances = results.reduce((acc, result) => {
        acc[result.symbol] = result;
        return acc;
      }, {} as Record<string, CollateralBalance>);

      cacheRef.current = { ...newBalances };
      lastFetchTimeRef.current = Date.now();

      if (mountedRef.current) {
        setBalances(newBalances);
        setError(null);
      }

    } catch (err: any) {
      const errorMsg = err?.message || "Failed to fetch balances";

      if (mountedRef.current) {
        setError(errorMsg);
        
        if (Object.keys(cacheRef.current).length > 0) {
          setBalances(cacheRef.current);
        }
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [userAddress, chainId, validatePrerequisites]);

  // Auto-fetch on dependencies change  
  useEffect(() => {
    fetchBalances();
  }, [userAddress, chainId, enabled]);

  // Removed aggressive 30s polling - balances update on:
  // 1. Address/chainId/enabled change
  // 2. Manual refetch() call after transactions
  // 3. Parent component control if needed

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getBalance = useCallback((symbol: string): CollateralBalance => {
    return balances[symbol] || {
      symbol,
      address: "",
      balance: "0",
      formatted: "0",
      decimals: 8,
      isLoading: false,
      error: "Token not found",
    };
  }, [balances]);

  const refetch = useCallback(async () => {
    await fetchBalances(true);
  }, [fetchBalances]);

  return {
    balances,
    isLoading,
    error,
    refetch,
    getBalance,
  };
}
