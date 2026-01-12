import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { ABIS, COLLATERAL_TOKENS } from "@/lib/shared/contracts";
import { safeContractCall } from "@/lib/wallet-keep-alive";

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
  provider: any;
  chainId: number | null;
  enabled?: boolean;
}

const EXPECTED_CHAIN_IDS = [8453, 84532];
const RETRY_DELAYS = [1000, 2000, 5000];
const STALE_TIME = 10000;
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

export function useCollateralBalances({
  userAddress,
  provider,
  chainId,
  enabled = true,
}: UseCollateralBalancesOptions): UseCollateralBalancesResult {
  
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

  // Derive read provider with RPC fallback
  const getReadProvider = useCallback((): ethers.Provider | null => {
    // Try wallet provider first
    if (provider) {
      try {
        if (provider.getNetwork && typeof provider.getNetwork === "function") {
          return provider as ethers.Provider;
        }
        if (provider.provider) {
          return provider.provider as ethers.Provider;
        }
        return provider as ethers.Provider;
      } catch {
        // Fall through to RPC
      }
    }
    
    // Fallback: Create direct RPC provider for Base Sepolia
    if (chainId === 84532 || !chainId) {
      return new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC, 84532);
    }
    
    return null;
  }, [provider, chainId]);

  // Validate prerequisites
  const validatePrerequisites = useCallback((): {
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

    // Get provider (will fallback to RPC if needed)
    const readProvider = getReadProvider();
    if (!readProvider) {
      return { valid: false, reason: "No provider available" };
    }

    // Only validate chainId if we have one (RPC fallback won't have wallet chainId)
    if (chainId && !EXPECTED_CHAIN_IDS.includes(chainId)) {
      return {
        valid: false,
        reason: `Please connect to Base Sepolia (84532) or Base Mainnet (8453)`,
      };
    }

    return { valid: true, readProvider };
  }, [enabled, userAddress, chainId, getReadProvider]);

  // Fetch single token balance
  const fetchTokenBalance = async (
    token: typeof COLLATERAL_TOKENS[0],
    readProvider: ethers.Provider,
    address: string,
    retryCount: number = 0
  ): Promise<CollateralBalance> => {
    try {
      const code = await readProvider.getCode(token.address);
      
      if (code === "0x" || code === "0x0") {
        throw new Error(`Contract not found at ${token.address}`);
      }

      const tokenContract = new ethers.Contract(
        token.address,
        ABIS.ERC20,
        readProvider
      );

      const [rawBalance, contractDecimals] = await safeContractCall(
        async () => {
          const results = await Promise.all([
            tokenContract.balanceOf(address) as Promise<bigint>,
            tokenContract.decimals() as Promise<number>,
          ]);
          return results;
        },
        readProvider,
        `${token.symbol} balance`
      );

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
      if (retryCount < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[retryCount];
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchTokenBalance(token, readProvider, address, retryCount + 1);
      }

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

  // Main fetch function
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

    const { readProvider } = validation;
    if (!readProvider || !userAddress) return;

    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Only check network if chainId is provided (skip for RPC fallback)
      if (chainId) {
        const network = await readProvider.getNetwork();
        const currentChainId = Number(network.chainId);
        
        if (currentChainId !== chainId) {
          throw new Error(`Network mismatch: expected ${chainId}, got ${currentChainId}`);
        }
      }

      const balancePromises = COLLATERAL_TOKENS.map(token =>
        fetchTokenBalance(token, readProvider, userAddress)
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
  }, [userAddress, chainId, enabled, provider]);

  // Periodic refresh
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      fetchBalances();
    }, 30000);

    return () => clearInterval(interval);
  }, [enabled, fetchBalances]);

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
