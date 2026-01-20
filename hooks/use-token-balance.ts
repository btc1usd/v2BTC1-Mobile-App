import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { ABIS } from "@/lib/shared/contracts";

export interface TokenBalanceResult {
  balance: string;
  formatted: string;
  decimals: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseTokenBalanceOptions {
  tokenAddress: string;
  userAddress: string | null;
  provider: ethers.Provider | ethers.Signer | null;
  enabled?: boolean;
  refreshInterval?: number;
  onSuccess?: (balance: string) => void;
  onError?: (error: Error) => void;
}

/**
 * WalletConnect + ethers v6 safe ERC20 balance hook
 */
export function useTokenBalance({
  tokenAddress,
  userAddress,
  provider,
  enabled = true,
  refreshInterval,
  onSuccess,
  onError,
}: UseTokenBalanceOptions): TokenBalanceResult {
  const [balance, setBalance] = useState("0");
  const [formatted, setFormatted] = useState("0");
  const [decimals, setDecimals] = useState(18);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const getReadProvider = (): ethers.Provider | null => {
    if (!provider) return null;

    // WalletConnect / BrowserProvider
    if ("getNetwork" in provider) {
      return provider as ethers.Provider;
    }

    // Signer with provider
    if ("provider" in provider && provider.provider) {
      return provider.provider as ethers.Provider;
    }

    return null;
  };

  const fetchBalance = useCallback(async () => {
    if (!enabled || isFetchingRef.current) {
      console.log('⏭️ Balance fetch skipped:', { enabled, isFetching: isFetchingRef.current });
      return;
    }
    
    if (!userAddress) {
      console.log('⏭️ Balance fetch skipped: no userAddress');
      return;
    }
    
    if (!ethers.isAddress(tokenAddress)) {
      console.error('❌ Invalid token address:', tokenAddress);
      return;
    }

    const readProvider = getReadProvider();
    if (!readProvider) {
      console.log('⏭️ Balance fetch skipped: no readProvider');
      return;
    }

    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    console.log('🔄 Fetching token balance:', {
      token: tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4),
      user: userAddress.slice(0, 6) + '...' + userAddress.slice(-4),
      providerType: readProvider.constructor.name,
    });

    try {
      // Verify network first
      const network = await readProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      console.log('🌐 Current network chainId:', currentChainId);
      
      // Check if contract exists
      const code = await readProvider.getCode(tokenAddress);
      if (code === '0x') {
        throw new Error(`Token contract not found at ${tokenAddress}. Wrong network?`);
      }
      
      const token = new ethers.Contract(
        tokenAddress,
        ABIS.ERC20,
        readProvider
      );

      const [rawBalance, tokenDecimals] = await Promise.all([
        token.balanceOf(userAddress) as Promise<bigint>,
        token.decimals() as Promise<number>,
      ]);

      const formattedBalance = ethers.formatUnits(
        rawBalance,
        tokenDecimals
      );

      console.log('✅ Token balance fetched successfully:', {
        raw: rawBalance.toString(),
        formatted: formattedBalance,
        decimals: tokenDecimals,
      });

      setBalance(rawBalance.toString());
      setFormatted(formattedBalance);
      setDecimals(tokenDecimals);
      setError(null);
      hasFetchedRef.current = true;

      onSuccess?.(formattedBalance);
    } catch (err: any) {
      const message =
        err?.shortMessage ||
        err?.message ||
        "Failed to fetch token balance";

      const errorMsg = message;

      console.error("❌ useTokenBalance error:", {
        errorMsg,
        originalError: message,
        code: err?.code,
        tokenAddress,
        userAddress,
      });
      
      setError(errorMsg);

      if (!hasFetchedRef.current) {
        setBalance("0");
        setFormatted("0");
      } else {
        console.log('🛡️ Keeping previous balance after error');
      }

      onError?.(err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [enabled, provider, userAddress, tokenAddress, onSuccess, onError]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return;
    const id = setInterval(fetchBalance, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, fetchBalance]);

  return {
    balance,
    formatted,
    decimals,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
