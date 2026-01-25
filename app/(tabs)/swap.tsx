import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  Alert,
  Image,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ethers } from "ethers";
import { ScreenContainer } from "@/components/screen-container";
import { WalletHeader } from "@/components/wallet-header";
import { NetworkBanner } from "@/components/network-indicator";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { THIRDWEB_CLIENT_ID } from "@/lib/thirdweb";
import { getResilientProvider } from "@/lib/rpc-provider-resilient";

// ============================================================
// CONSTANTS & FALLBACK DATA
// ============================================================

const FALLBACK_CHAINS = [
  { id: 8453, name: "Base", icon: "🔵" },
  { id: 84532, name: "Base Sepolia", icon: "🟢" },
  { id: 1, name: "Ethereum", icon: "⟠" },
];

const STATIC_TOKENS: Record<number, Token[]> = {
  84532: [
    { symbol: "BTC1", name: "BTC1 USD", address: "0x43Cd5E8A5bdaEa790a23C4a5DcCc0c11E70C9daB", decimals: 8, icon: "₿" },
  ],
  8453: [
    { symbol: "BTC1", name: "BTC1 USD", address: "0x9B8fc91C33ecAFE4992A2A8dBA27172328f423a5", decimals: 8, icon: "./assets/tokens/btc1.png" },
  ],
};

// Default tokens for chains not explicitly defined
const DEFAULT_TOKENS = [
  { symbol: "ETH", name: "Ethereum", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", decimals: 18, icon: "⟠" },
  { symbol: "USDC", name: "USD Coin", address: "0x0000000000000000000000000000000000000000", decimals: 6, icon: "💵" },
];

const BASE_URL = "https://develop--v2btc1.netlify.app";
const SWAP_API_URL = "https://develop--v2btc1.netlify.app/api/swapx";

// ============================================================
// TYPES
// ============================================================

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

interface Chain {
  id: number;
  name: string;
  icon: string;
}

// ============================================================
// SCREEN COMPONENT
// ============================================================

export default function SwapScreen() {
  const { address, chainId, isConnected, signer, disconnectWallet } = useWeb3();
  const colors = useColors();

  // State
  const [supportedChains, setSupportedChains] = useState<Chain[]>(FALLBACK_CHAINS);
  const [tokensByChain, setTokensByChain] = useState<Record<number, Token[]>>(STATIC_TOKENS);
  
  const [fromChain, setFromChain] = useState<Chain>(FALLBACK_CHAINS[0]);
  const [toChain, setToChain] = useState<Chain>(FALLBACK_CHAINS[0]);
  const [fromToken, setFromToken] = useState<Token>(STATIC_TOKENS[8453]?.[0] || STATIC_TOKENS[84532]?.[0] || DEFAULT_TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(STATIC_TOKENS[8453]?.[0] || STATIC_TOKENS[84532]?.[0] || DEFAULT_TOKENS[0]);
  const [amount, setAmount] = useState("");
  const [isSwapping, setIsSwapping] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  
  // Token balances
  const [fromTokenBalance, setFromTokenBalance] = useState<string>("0");
  const [toTokenBalance, setToTokenBalance] = useState<string>("0");
  const [isFetchingBalances, setIsFetchingBalances] = useState<boolean>(false);

  // Selection Modals State
  const [networkSelectorVisible, setNetworkSelectorVisible] = useState(false);
  const [tokenSelectorVisible, setTokenSelectorVisible] = useState(false);
  const [selectingSide, setSelectingSide] = useState<"from" | "to">("from");
  const [chainSearchQuery, setChainSearchQuery] = useState("");
  const [tokenSearchQuery, setTokenSearchQuery] = useState("");
  const [selectedChainIdForTokenModal, setSelectedChainIdForTokenModal] = useState<number>(8453);

  const resolveIpfs = (url: string) => {
    if (!url) return "https://thirdweb.com/favicon.ico";
    if (url.startsWith("ipfs://")) {
      // Handle IPFS URLs by converting to HTTP gateway URLs
      const ipfsPath = url.replace("ipfs://", "");
      // Try multiple IPFS gateways for better reliability
      return [
        `https://ipfs.io/ipfs/${ipfsPath}`,
        `https://cloudflare-ipfs.com/ipfs/${ipfsPath}`,
        `https://gateway.pinata.cloud/ipfs/${ipfsPath}`
      ][0]; // Use the first one, but array allows easy rotation if needed
    }
    return url;
  };

  const filteredChainsInModal = useMemo(() => {
    if (!chainSearchQuery) return supportedChains;
    const query = chainSearchQuery.toLowerCase();
    return supportedChains.filter(c => c.name.toLowerCase().includes(query));
  }, [supportedChains, chainSearchQuery]);

  const tokensForSelectedChain = useMemo(() => {
    const tokens = tokensByChain[selectedChainIdForTokenModal] || [];
    if (!tokenSearchQuery) return tokens;
    const query = tokenSearchQuery.toLowerCase();
    return tokens.filter(t => 
      t.symbol.toLowerCase().includes(query) || 
      t.name.toLowerCase().includes(query) ||
      t.address.toLowerCase() === query
    );
  }, [tokensByChain, selectedChainIdForTokenModal, tokenSearchQuery]);

  // Fetch Chains from Thirdweb (Using Bridge API)
  useEffect(() => {
    const fetchChains = async () => {
      try {
        const response = await fetch("https://api.thirdweb.com/v1/bridge/chains", {
          headers: { "x-client-id": THIRDWEB_CLIENT_ID },
        });
        const data = await response.json();
        const chains = data.result || [];
        
        if (chains.length > 0) {
          const mappedChains = chains.map((c: any) => ({
            id: c.chainId,
            name: c.name,
            icon: resolveIpfs(c.icon),
          }));
          setSupportedChains(mappedChains);
          
          // Always use Base mainnet (8453) for swap functionality
          const baseMainnet = mappedChains.find((c: any) => c.id === 8453);
          if (baseMainnet) {
            setFromChain(baseMainnet);
            setToChain(baseMainnet);
            setSelectedChainIdForTokenModal(baseMainnet.id);
          } else {
            // Fallback to first available chain if Base mainnet not found
            const firstChain = mappedChains[0];
            setFromChain(firstChain);
            setToChain(firstChain);
            setSelectedChainIdForTokenModal(firstChain.id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch chains from Thirdweb:", err);
      }
    };
    fetchChains();
  }, [chainId]);

  // Fetch Tokens for selected chains
  useEffect(() => {
    const fetchTokens = async (chainIdToFetch: number) => {
      if (tokensByChain[chainIdToFetch] && tokensByChain[chainIdToFetch].length > 1) return;
      
      try {
        // Use the develop API as requested
        let response = await fetch(`https://develop--v2btc1.netlify.app/api/tokens?chainId=${chainIdToFetch}&limit=50`);
        
        // If the develop API fails, fallback to Thirdweb API
        if (!response.ok) {
          console.warn(`Develop API failed (${response.status}), falling back to Thirdweb API...`);
          
          // Use Thirdweb's public API as fallback
          response = await fetch(`https://api.thirdweb.com/v1/tokens/${chainIdToFetch}?limit=50`);
          
          if (!response.ok) {
            console.error(`Thirdweb API also failed: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            console.error('Error response:', errorText);
            return; // Exit early on API error
          }
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('Response is not JSON:', contentType);
          const text = await response.text();
          console.error('Raw response:', text);
          return; // Exit early if not JSON
        }
        
        const data = await response.json();
        
        // Handle different response formats
        let tokens = [];
        if (data.tokens && Array.isArray(data.tokens)) {
          // Custom API format
          tokens = data.tokens;
        } else if (data.result && Array.isArray(data.result)) {
          // Thirdweb API format
          tokens = data.result;
        } else if (Array.isArray(data)) {
          // Direct array format
          tokens = data;
        } else {
          console.error('Unexpected API response format:', data);
          return;
        }
        
        if (tokens.length > 0) {
          const mappedTokens = tokens.map((t: any) => ({
            symbol: t.symbol,
            name: t.name,
            address: t.address || t.contract_address,
            decimals: t.decimals || t.decimal || 18,
            icon: resolveIpfs(t.logoURI || t.icon || t.image || t.logo_url || t.thumbnail || t.small_image || t.logo),
          }));
          
          const existing = STATIC_TOKENS[chainIdToFetch] || [];
          const combined = [...existing, ...mappedTokens.filter((mt: any) => !existing.find(et => et.symbol === mt.symbol))];
          
          setTokensByChain(prev => ({ ...prev, [chainIdToFetch]: combined }));
          
          if (fromChain.id === chainIdToFetch && combined.length > 0) {
            setFromToken(combined[0]);
          }
          if (toChain.id === chainIdToFetch && combined.length > 0) {
             setToToken(combined.find((t: any) => t.symbol === "BTC1") || combined[0]);
          }
        }
      } catch (err) {
        console.error(`Failed to fetch tokens for chain ${chainIdToFetch}:`, err);
        if (err instanceof SyntaxError && err.message.includes('JSON Parse error')) {
          console.error('The API response was not valid JSON - likely an HTML error page was returned');
        }
      }
    };

    fetchTokens(fromChain.id);
    fetchTokens(toChain.id);
    fetchTokens(selectedChainIdForTokenModal);
  }, [fromChain.id, toChain.id, selectedChainIdForTokenModal]);

  // No need to sync wallet chain since we're enforcing Base mainnet only
  // The swap functionality is restricted to Base mainnet (8453) only
  useEffect(() => {
    // Enforce Base mainnet (8453) as the only supported chain for swaps
    const baseMainnet = supportedChains.find(c => Number(c.id) === 8453);
    if (baseMainnet) {
      setFromChain(baseMainnet);
      setToChain(baseMainnet);
    }
  }, [supportedChains]);

  // Update tokens when chains change (from state)
  useEffect(() => {
    const fromTokens = tokensByChain[fromChain.id] || DEFAULT_TOKENS;
    if (!fromTokens.find(t => t.symbol === fromToken.symbol)) {
      setFromToken(fromTokens[0]);
    }
  }, [fromChain, tokensByChain]);

  // Update tokens when chains change (to state)
  useEffect(() => {
    const toTokens = tokensByChain[toChain.id] || DEFAULT_TOKENS;
    if (!toTokens.find(t => t.symbol === toToken.symbol)) {
      setToToken(toTokens[0]);
    }
  }, [toChain, tokensByChain]);

  // Advanced helper function to fetch token balance using industry-standard practices
  const getTokenBalance = async (walletAddress: string, tokenAddress: string, chainId: number): Promise<string> => {
    if (!walletAddress) return "0";
    
    try {
      // Handle native tokens (like ETH) separately
      if (tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" || 
          tokenAddress.toLowerCase() === "0x0000000000000000000000000000000000000000") {
        // Get native token balance
        const provider = getResilientProvider(chainId);
        const balance = await provider.getDirectProvider().getBalance(walletAddress);
        return ethers.formatUnits(balance, 18);
      } else {
        // Get ERC20 token balance using multiple fallback methods
        const provider = getResilientProvider(chainId);
        
        // Get the underlying provider from ResilientRPCProvider
        const underlyingProvider = provider.getDirectProvider();
        
        // Standard ERC20 ABI with balanceOf and decimals functions
        const erc20Abi = [
          "function balanceOf(address owner) view returns (uint256)",
          "function decimals() view returns (uint8)",
          "function symbol() view returns (string)",
          "function name() view returns (string)"
        ];
        
        const contract = new ethers.Contract(tokenAddress, erc20Abi, underlyingProvider);
        
        try {
          // Attempt to get token balance with multiple fallbacks
          let balance: bigint;
          try {
            balance = await contract.balanceOf(walletAddress);
          } catch (balanceError) {
            console.warn(`Primary balanceOf call failed for ${tokenAddress}, trying manual call:`, balanceError);
            
            // Fallback: manual call using callStatic
            try {
              const iface = new ethers.Interface(['function balanceOf(address owner) view returns (uint256)']);
              const data = iface.encodeFunctionData('balanceOf', [walletAddress]);
              const result = await underlyingProvider.call({
                to: tokenAddress,
                data: data
              });
              balance = BigInt(result);
            } catch (manualCallError) {
              console.warn(`Manual call failed for ${tokenAddress}, returning 0:`, manualCallError);
              return "0";
            }
          }
          
          // Get token decimals with multiple fallbacks
          let decimals = 18; // default
          try {
            decimals = await contract.decimals();
          } catch (decimalsError) {
            console.warn(`Could not fetch decimals for token ${tokenAddress}, trying alternative methods:`, decimalsError);
            
            // Fallback: try to get decimals from a known list or default to 18
            try {
              // Attempt manual call for decimals
              const decimalsIface = new ethers.Interface(['function decimals() view returns (uint8)']);
              const decimalsData = decimalsIface.encodeFunctionData('decimals');
              const decimalsResult = await underlyingProvider.call({
                to: tokenAddress,
                data: decimalsData
              });
              const decoded = decimalsIface.decodeFunctionResult('decimals', decimalsResult);
              decimals = Number(decoded[0]);
            } catch (manualDecimalsError) {
              console.warn(`Could not fetch decimals manually for token ${tokenAddress}, using default 18:`, manualDecimalsError);
            }
          }
          
          return ethers.formatUnits(balance, decimals);
        } catch (balanceError) {
          console.error(`Error fetching balance for token ${tokenAddress}:`, balanceError);
          return "0";
        }
      }
    } catch (error) {
      console.error(`General error fetching balance for ${tokenAddress}:`, error);
      return "0";
    }
  };

  // Fetch token balances when wallet address, chain, or token changes
  useEffect(() => {
    let isCancelled = false; // Prevent state updates on unmounted component
    
    const fetchTokenBalances = async () => {
      if (!address || !isConnected) {
        setFromTokenBalance("0");
        setToTokenBalance("0");
        return;
      }
      
      setIsFetchingBalances(true);
      
      try {
        // Fetch from token balance
        if (fromToken && !isCancelled) {
          console.log(`Fetching balance for fromToken: ${fromToken.symbol} at ${fromToken.address} on chain ${fromChain.id}`);
          const fromBalance = await getTokenBalance(address, fromToken.address, fromChain.id);
          if (!isCancelled) setFromTokenBalance(fromBalance);
          console.log(`From token balance: ${fromBalance}`);
        }
        
        // Fetch to token balance
        if (toToken && !isCancelled) {
          console.log(`Fetching balance for toToken: ${toToken.symbol} at ${toToken.address} on chain ${toChain.id}`);
          const toBalance = await getTokenBalance(address, toToken.address, toChain.id);
          if (!isCancelled) setToTokenBalance(toBalance);
          console.log(`To token balance: ${toBalance}`);
        }
      } catch (error) {
        console.error("Error fetching token balances:", error);
        if (!isCancelled) {
          setFromTokenBalance("0");
          setToTokenBalance("0");
        }
      } finally {
        if (!isCancelled) {
          setIsFetchingBalances(false);
        }
      }
    };
    
    fetchTokenBalances();
    
    // Cleanup function
    return () => {
      isCancelled = true;
    };
  }, [address, isConnected, fromToken, toToken, fromChain, toChain]);

  // Fetch Quote Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (amount && Number(amount) > 0) {
        fetchQuote();
      } else {
        setQuote(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [amount, fromChain, toChain, fromToken, toToken]);

  const fetchQuote = async () => {
    setIsFetchingQuote(true);
    try {
      // Validate required parameters before making API call
      if (!fromToken?.address || !toToken?.address || !amount || Number(amount) <= 0) {
        console.warn('Missing required parameters for quote:', {
          fromTokenAddress: fromToken?.address,
          toTokenAddress: toToken?.address,
          amount: amount
        });
        return;
      }
      
      if (!fromChain?.id || !toChain?.id) {
        console.warn('Missing chain IDs for quote:', {
          fromChainId: fromChain?.id,
          toChainId: toChain?.id
        });
        return;
      }
      
      // Convert amount to smallest unit (wei equivalent) based on token decimals
      let amountInSmallestUnit = '0';
      try {
        amountInSmallestUnit = ethers.parseUnits(amount, fromToken.decimals || 18).toString();
      } catch (parseError) {
        console.error('Error parsing amount:', parseError);
        return;
      }
      
      console.log('Quote request payload:', {
        fromTokenAddress: fromToken.address,
        toTokenAddress: toToken.address,
        amountWei: amountInSmallestUnit,
        fromChainId: fromChain.id,
        toChainId: toChain.id,
        slippage: 0.5,
        walletAddress: address || ""
      });
      
      // Define API endpoints to try
      const apiEndpoints = [
        'https://develop--v2btc1.netlify.app/api/swapx/quote',
        `https://develop--v2btc1.netlify.app/api/swapx/quote?fromTokenAddress=${fromToken.address}&toTokenAddress=${toToken.address}&amountWei=${amountInSmallestUnit}&fromChainId=${fromChain.id}&toChainId=${toChain.id}&slippage=0.5&walletAddress=${address || ""}`
      ];
      
      let response;
      let lastError;
      
      for (const endpoint of apiEndpoints) {
        try {
          console.log('Attempting to fetch quote from:', endpoint);
          console.log('Quote request payload:', {
            fromTokenAddress: fromToken.address,
            toTokenAddress: toToken.address,
            amountWei: amountInSmallestUnit, // in smallest unit (wei for ETH)
            fromChainId: fromChain.id,
            toChainId: toChain.id,
            slippage: 0.5,
            walletAddress: address || ""
          });
          
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromTokenAddress: fromToken.address,
              toTokenAddress: toToken.address,
              amountWei: amountInSmallestUnit, // in smallest unit (wei for ETH)
              fromChainId: fromChain.id,
              toChainId: toChain.id,
              slippage: 0.5,
              walletAddress: address || ""
            })
          });
          
          console.log('Quote API response status:', response.status, response.statusText);
          
          // If we get a successful response, break the loop
          if (response.ok) {
            break;
          } else {
            console.warn(`Quote API attempt failed at ${endpoint}: ${response.status} ${response.statusText}`);
            lastError = `Status: ${response.status} ${response.statusText}`;
            
            // Try reading the response text for more info
            try {
              const errorText = await response.text();
              console.warn('Error response text:', errorText);
            } catch (textError) {
              console.warn('Could not read error response text:', textError);
            }
          }
        } catch (error: any) {
          console.warn(`Quote API network error at ${endpoint}:`, error);
          lastError = error.message;
        }
      }
      
      if (!response || !response.ok) {
        console.error('All quote API endpoints failed. Last error:', lastError);
        return;
      }
      
      // Check if response is OK before parsing JSON
      if (!response.ok) {
        console.error(`Quote API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error('Quote error response:', errorText);
        return;
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Quote response is not JSON:', contentType);
        const text = await response.text();
        console.error('Quote raw response:', text);
        return;
      }
      
      const data = await response.json();
      console.log('Full quote response:', data);
      
      // Handle different response formats
      if (data.success === true) {
        // Standard format with success flag
        if (data.quote) {
          console.log('Quote received:', data.quote);
          setQuote(data.quote);
        } else {
          console.warn('Quote response missing quote data:', data);
        }
      } else if (data.success === false) {
        // Error response with success flag
        console.warn("Quote failed:", data.error || data.message || data);
      } else if (data.quote) {
        // Response with quote object directly (as seen in API response)
        console.log('Quote received from nested quote object:', data.quote);
        setQuote(data.quote);
      } else if (data.destinationAmount && data.originAmount) {
        // Direct quote format without success wrapper
        console.log('Direct quote received:', data);
        setQuote(data);
      } else {
        // Unknown format
        console.warn('Unexpected quote response format:', data);
        setQuote(data);
      }
    } catch (error) {
      console.error("Error fetching quote:", error);
      if (error instanceof SyntaxError && error.message.includes('JSON Parse error')) {
        console.error('The quote API response was not valid JSON - likely an HTML error page was returned');
      }
    } finally {
      setIsFetchingQuote(false);
    }
  };

  const handleSwap = async () => {
    if (!isConnected || !signer) {
      Alert.alert("Connect Wallet", "Please connect your wallet to swap.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    setIsSwapping(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Check if user is on Base mainnet (8453) - required for swap functionality
      // NOTE: API only supports mainnet chain IDs, not testnet
      const walletChainId = Number(chainId);
      const BASE_MAINNET_ID = 8453;  // Base mainnet
      
      if (walletChainId && walletChainId !== BASE_MAINNET_ID) {
        console.log(`Chain mismatch: wallet=${walletChainId}, required=${BASE_MAINNET_ID}`);
        Alert.alert("Switch Network", `Please switch your wallet to Base mainnet (${BASE_MAINNET_ID}) to continue. Current: ${walletChainId}. The swap API only supports mainnet transactions, not testnet.`);
        setIsSwapping(false);
        return;
      } else if (!walletChainId) {
        Alert.alert("Network Error", "Could not detect wallet chain. Please reconnect your wallet.");
        setIsSwapping(false);
        return;
      }

      // Validate required parameters before making API call
      if (!fromToken?.address || !toToken?.address || !amount || Number(amount) <= 0) {
        throw new Error('Missing required parameters for swap');
      }
      
      if (!fromChain?.id || !toChain?.id) {
        throw new Error('Missing chain IDs for swap');
      }
      
      // Make sure we have a valid quote - handle different response structures
      let currentQuote = quote; // Default to existing quote
      if (!quote || (!quote.success && !quote.destinationAmount && !quote.quote)) {
        // Try to fetch a fresh quote
        console.log('No valid quote available, attempting to fetch one...');
        
        // Convert amount to smallest unit (wei equivalent) based on token decimals
        let amountInSmallestUnit = '0';
        try {
          // Limit decimal places to what the token supports to prevent overflow
          const tokenDecimals = fromToken.decimals || 18;
          const limitedAmount = Number(amount).toFixed(tokenDecimals);
          
          console.log('Converting amount:', {
            original: amount,
            limited: limitedAmount,
            decimals: tokenDecimals
          });
          
          amountInSmallestUnit = ethers.parseUnits(limitedAmount, tokenDecimals).toString();
        } catch (parseError) {
          console.error('Error parsing amount:', parseError);
          throw new Error(`Invalid amount format. Please enter a valid number with no more than ${fromToken.decimals || 18} decimal places.`);
        }
        
        // Use the correct quote API endpoint
        const quoteResponse = await fetch('https://velop--v2btc1.netlify.app/api/swapx/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromTokenAddress: fromToken.address,
            toTokenAddress: toToken.address,
            amountWei: amountInSmallestUnit, // in smallest unit (wei for ETH)
            fromChainId: fromChain.id,
            toChainId: toChain.id,
            slippage: 0.5,
            walletAddress: address || ""
          })
        });
        
        if (!quoteResponse.ok) {
          const errorText = await quoteResponse.text();
          console.error('Quote API error:', errorText);
          throw new Error(`Quote API error: ${quoteResponse.status}`);
        }
        
        const quoteData = await quoteResponse.json();
        console.log('Fresh quote received:', quoteData);
        
        // Check if we have a valid quote in the response structure
        if (!quoteData.quote && !quoteData.destinationAmount) {
          throw new Error(quoteData.error || 'Quote failed - no quote data returned');
        }
        
        // Use the fresh quote - handle different response structures
        currentQuote = quoteData.quote || quoteData;
      }
      
      // 2. Execute the swap - using transaction endpoint with correct parameters
      const executeResponse = await fetch('https://develop--v2btc1.netlify.app/api/swapx/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromTokenAddress: fromToken.address,
          fromChainId: fromChain.id,
          amountWei: ethers.parseUnits(amount, fromToken.decimals || 18).toString(),
          toTokenAddress: toToken.address,
          toChainId: toChain.id,
          sender: address
        })
      });
      
      if (!executeResponse.ok) {
        const errorText = await executeResponse.text();
        console.error('Execute API error:', errorText);
        throw new Error(`Execute API error: ${executeResponse.status}`);
      }
      
      const result = await executeResponse.json();
      console.log('Execute API response:', result);
      
      // Handle different response structures
      if (result.success && result.transaction) {
        // Standard format with success flag
        const tx = await signer.sendTransaction(result.transaction);
        console.log("Transaction sent:", tx.hash);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Swap transaction submitted!");
        setAmount("");
      } else if (result.transaction) {
        // Direct transaction object (as seen in API examples)
        const tx = await signer.sendTransaction(result.transaction);
        console.log("Transaction sent:", tx.hash);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Swap transaction submitted!");
        setAmount("");
      } else if (result.transactions && Array.isArray(result.transactions)) {
        // Multi-step transaction format - execute all transactions in sequence
        console.log('Multi-step transaction detected, executing', result.transactions.length, 'transactions');
        
        let lastTxHash = '';
        for (let i = 0; i < result.transactions.length; i++) {
          const txData = result.transactions[i];
          console.log(`Executing transaction ${i + 1}/${result.transactions.length}:`, txData.action);
          
          const tx = await signer.sendTransaction({
            to: txData.to,
            data: txData.data,
            value: txData.value || '0x0',
            from: txData.from,
          });
          
          console.log(`Transaction ${i + 1} sent:`, tx.hash);
          lastTxHash = tx.hash;
          
          // Wait for transaction confirmation
          await tx.wait();
          console.log(`Transaction ${i + 1} confirmed`);
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", `Swap completed! Transaction: ${lastTxHash.substring(0, 10)}...${lastTxHash.substring(lastTxHash.length - 4)}`);
        setAmount("");
      } else if (result.steps) {
        // Transaction steps format
        console.log('Steps format detected:', result.steps);
        throw new Error('Steps format transactions not yet supported');
      } else {
        // Unknown format
        console.error('Unexpected execute response format:', result);
        throw new Error(result.error || result.message || "Failed to initiate swap - unexpected response format");
      }
    } catch (error: any) {
      console.error("Swap failed:", error);
      Alert.alert("Swap Error", error.message || "Something went wrong during the swap.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSwapping(false);
    }
  };

  const openNetworkSelector = (side: "from" | "to") => {
    setSelectingSide(side);
    setChainSearchQuery("");
    setNetworkSelectorVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openTokenSelector = (side: "from" | "to") => {
    setSelectingSide(side);
    setTokenSearchQuery("");
    setSelectedChainIdForTokenModal(side === "from" ? fromChain.id : toChain.id);
    setTokenSelectorVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectChain = (chain: Chain) => {
    if (selectingSide === "from") {
      setFromChain(chain);
    } else {
      setToChain(chain);
    }
    setNetworkSelectorVisible(false);
    // Automatically open token selector for the new chain
    setTimeout(() => {
      setSelectedChainIdForTokenModal(chain.id);
      setTokenSelectorVisible(true);
    }, 300);
  };

  const handleSelectToken = (token: Token) => {
    if (selectingSide === "from") {
      setFromToken(token);
    } else {
      setToToken(token);
    }
    setTokenSelectorVisible(false);
  };

  const handleSwitchDirections = () => {
    const tempChain = fromChain;
    const tempToken = fromToken;
    setFromChain(toChain);
    setFromToken(toToken);
    setToChain(tempChain);
    setToToken(tempToken);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ============================================================
  // RENDER
  // ============================================================

  // Guards
  if (!isConnected) {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <Text className="text-4xl">🔐</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mb-2">Connect Wallet</Text>
          <Text className="text-base text-muted text-center">Connect your wallet to swap tokens</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <WalletHeader address={address} chainId={chainId} compact onDisconnect={disconnectWallet} />
      <View className="px-6 pt-2">
        <NetworkBanner chainId={chainId} />
      </View>

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        <View className="py-4">
          <Text className="text-3xl font-bold text-foreground mb-1">Swap</Text>
          <Text className="text-sm text-muted mb-6">Cross-chain swaps made simple</Text>
        </View>

        {/* Swap UI Card */}
        <View className="bg-surface rounded-[40px] p-6 border border-border shadow-xl">
          {/* FROM SECTION */}
          <View className="bg-muted/5 rounded-[32px] p-5 border border-border/30">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-[11px] font-black text-muted uppercase tracking-[2px]">You Pay</Text>
              <View className="bg-primary/10 px-2 py-0.5 rounded-md">
                 <Text className="text-primary text-[9px] font-black uppercase">Step 1 & 2</Text>
              </View>
            </View>
            
            <View className="flex-row gap-3 mb-5">
              {/* Network Dropdown */}
              <TouchableOpacity 
                onPress={() => openNetworkSelector("from")}
                className="flex-1 bg-background/80 px-4 py-3.5 rounded-2xl border border-border/50 flex-row items-center justify-between shadow-sm"
              >
                <View className="flex-row items-center">
                  <Image source={{ uri: fromChain.icon }} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 10 }} />
                  <Text numberOfLines={1} className="text-xs font-black text-foreground uppercase tracking-tight flex-1">{fromChain.name.split(' ')[0]}</Text>
                </View>
                <IconSymbol name="chevron.down" size={10} color={colors.muted} />
              </TouchableOpacity>

              {/* Token Dropdown */}
              <TouchableOpacity 
                onPress={() => openTokenSelector("from")}
                className="flex-1 bg-background/80 px-4 py-3.5 rounded-2xl border border-border/50 flex-row items-center justify-between shadow-sm"
              >
                <View className="flex-row items-center">
                  <View className="w-5 h-5 rounded-full bg-surface items-center justify-center mr-2 border border-border/20">
                    <Text className="text-xs">{fromToken.icon}</Text>
                  </View>
                  <Text className="text-xs font-black text-foreground uppercase tracking-tight">{fromToken.symbol}</Text>
                </View>
                <IconSymbol name="chevron.down" size={10} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View className="bg-background/40 rounded-2xl px-5 py-4 border border-border/20 shadow-inner">
              <TextInput
                className="text-4xl font-black text-foreground p-0 h-12"
                placeholder="0.00"
                placeholderTextColor={colors.muted + '40'}
                keyboardType="numeric"
                value={amount}
                onChangeText={(text) => {
                  // Validate input to prevent too many decimal places
                  if (text && fromToken) {
                    const parts = text.split('.');
                    const maxDecimals = fromToken.decimals || 18;
                    
                    // Allow integers or decimals with appropriate precision
                    if (parts.length > 2 || (parts[1] && parts[1].length > maxDecimals)) {
                      // Don't update if invalid
                      return;
                    }
                  }
                  setAmount(text);
                }}
              />
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-[10px] font-bold text-muted uppercase tracking-widest">Balance: {isFetchingBalances ? 'Loading...' : fromTokenBalance}</Text>
                <TouchableOpacity 
                  onPress={() => {
                    if (!isFetchingBalances && Number(fromTokenBalance) > 0) {
                      setAmount(fromTokenBalance);
                    }
                  }}
                  disabled={isFetchingBalances || Number(fromTokenBalance) <= 0}
                  className={`${isFetchingBalances || Number(fromTokenBalance) <= 0 ? 'opacity-50' : 'opacity-100'} bg-primary/10 px-2 py-0.5 rounded`}>
                  <Text className="text-primary text-[9px] font-black uppercase">Max</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* SWITCH BUTTON */}
          <View className="items-center -my-4 z-10">
            <TouchableOpacity 
              onPress={handleSwitchDirections}
              className="bg-surface w-11 h-11 rounded-2xl items-center justify-center border border-border shadow-2xl"
            >
              <View className="bg-muted/5 w-full h-full items-center justify-center rounded-2xl">
                <IconSymbol name="arrow.up.arrow.down" size={20} color={colors.primary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* TO SECTION */}
          <View className="bg-muted/5 rounded-[32px] p-5 border border-border/30">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-[11px] font-black text-muted uppercase tracking-[2px]">You Receive</Text>
              <IconSymbol name="sparkles" size={12} color={colors.primary} />
            </View>
            
            <View className="flex-row gap-3 mb-5">
              {/* Network Dropdown */}
              <TouchableOpacity 
                onPress={() => openNetworkSelector("to")}
                className="flex-1 bg-background/80 px-4 py-3.5 rounded-2xl border border-border/50 flex-row items-center justify-between shadow-sm"
              >
                <View className="flex-row items-center">
                  <Image source={{ uri: toChain.icon }} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 10 }} />
                  <Text numberOfLines={1} className="text-xs font-black text-foreground uppercase tracking-tight flex-1">{toChain.name.split(' ')[0]}</Text>
                </View>
                <IconSymbol name="chevron.down" size={10} color={colors.muted} />
              </TouchableOpacity>

              {/* Token Dropdown */}
              <TouchableOpacity 
                onPress={() => openTokenSelector("to")}
                className="flex-1 bg-background/80 px-4 py-3.5 rounded-2xl border border-border/50 flex-row items-center justify-between shadow-sm"
              >
                <View className="flex-row items-center">
                  <View className="w-5 h-5 rounded-full bg-surface items-center justify-center mr-2 border border-border/20">
                    <Text className="text-xs">{toToken.icon}</Text>
                  </View>
                  <Text className="text-xs font-black text-foreground uppercase tracking-tight">{toToken.symbol}</Text>
                </View>
                <IconSymbol name="chevron.down" size={10} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View className="bg-background/40 rounded-2xl px-5 py-4 border border-border/20 shadow-inner min-h-[80px] justify-center">
              {isFetchingQuote ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="text-4xl font-black text-foreground">
                  {(quote?.destinationAmount || quote?.toAmount) ? ethers.formatUnits(BigInt(quote.destinationAmount || quote.toAmount), toToken.decimals || 18) : "0.00"}
                </Text>
              )}
              {quote && (
                <Text className="text-[10px] font-bold text-muted uppercase tracking-widest mt-2">
                  {(Number(quote.destinationAmount ? 
                    ethers.formatUnits(BigInt(quote.destinationAmount), toToken.decimals || 18)
                    : 
                    quote.toAmount || 0
                  )).toFixed(4)} {toToken.symbol}
                </Text>
              )}
            </View>
          </View>


          {/* QUOTE INFO */}
          {quote && (
            <View className="mt-4 px-2">
              <View className="flex-row justify-between mb-1">
                <Text className="text-[11px] font-medium text-muted">Exchange Rate</Text>
                <Text className="text-[11px] font-bold text-foreground">1 {fromToken.symbol} ≈ {(quote?.rate || ((quote?.destinationAmount && quote?.originAmount) ? 
                  (Number(ethers.formatUnits(BigInt(quote.destinationAmount), toToken.decimals || 18)) / 
                   Number(ethers.formatUnits(BigInt(quote.originAmount), fromToken.decimals || 18))).toFixed(6) 
                  : '0.000000'))} {toToken.symbol}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-[11px] font-medium text-muted">Network Fee</Text>
                <Text className="text-[11px] font-bold text-foreground">{(quote?.fee || '0.00')} {fromToken.symbol}</Text>
              </View>
            </View>
          )}

          {/* SWAP BUTTON */}
          <TouchableOpacity
            onPress={handleSwap}
            disabled={isSwapping || !amount || Number(amount) <= 0}
            className={`mt-6 py-4 rounded-2xl items-center justify-center shadow-lg ${
              isSwapping || !amount || Number(amount) <= 0 ? "bg-muted opacity-50" : "bg-primary"
            }`}
          >
            {isSwapping ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-lg font-black uppercase tracking-widest">
                {isConnected ? "Swap" : "Connect Wallet"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* INFO FOOTER */}
        <View className="mt-8 mb-12 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <View className="flex-row items-center mb-2">
            <IconSymbol name="info.circle" size={16} color={colors.primary} />
            <Text className="ml-2 font-bold text-primary">About SwapX</Text>
          </View>
          <Text className="text-xs text-muted leading-5">
            SwapX uses our decentralized liquidity protocol to provide the best rates for BTC1 and cross-chain swaps. Transactions are processed securely through our verified API.
          </Text>
        </View>
      </ScrollView>

      {/* NETWORK SELECTOR MODAL */}
      <Modal
        visible={networkSelectorVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setNetworkSelectorVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-[#0a0a0a]">
          <View className="px-6 py-6 flex-row justify-between items-center border-b border-white/5">
            <View>
              <Text className="text-2xl font-black text-white tracking-tight">Select Network</Text>
              <Text className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Choose source network</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setNetworkSelectorVisible(false)} 
              className="w-10 h-10 rounded-2xl bg-white/5 items-center justify-center border border-white/10"
            >
              <IconSymbol name="xmark" size={18} color="white" />
            </TouchableOpacity>
          </View>

          <View className="px-6 py-5">
            <View className="bg-white/5 rounded-2xl px-5 py-4 flex-row items-center border border-white/10 shadow-inner">
              <IconSymbol name="magnifyingglass" size={18} color="#666" />
              <TextInput 
                placeholder="Search networks"
                placeholderTextColor="#444"
                className="flex-1 ml-4 text-white font-black text-base h-8"
                value={chainSearchQuery}
                onChangeText={setChainSearchQuery}
                autoCapitalize="none"
              />
            </View>
          </View>

          <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap gap-3 pb-20">
              {filteredChainsInModal.map(chain => (
                <TouchableOpacity 
                  key={chain.id}
                  onPress={() => handleSelectChain(chain)}
                  className={`w-[48%] bg-white/5 p-5 rounded-[32px] items-center justify-center border-2 ${
                    (selectingSide === 'from' ? fromChain.id : toChain.id) === chain.id 
                    ? 'border-primary bg-primary/10' 
                    : 'border-transparent'
                  }`}
                >
                  <View className="w-14 h-14 rounded-2xl bg-white/5 items-center justify-center mb-3 shadow-sm border border-white/10">
                    <Image source={{ uri: chain.icon }} style={{ width: 32, height: 32, borderRadius: 8 }} />
                  </View>
                  <Text numberOfLines={1} className="text-white font-black text-xs uppercase tracking-tight">
                    {chain.name.replace(' Mainnet', '')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* TOKEN SELECTOR MODAL */}
      <Modal
        visible={tokenSelectorVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setTokenSelectorVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-[#050505]">
          <View className="px-6 py-6 flex-row justify-between items-center border-b border-white/5 bg-[#0a0a0a]">
            <View>
              <Text className="text-2xl font-black text-white tracking-tight">Select Token</Text>
              <Text className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                On {supportedChains.find(c => c.id === selectedChainIdForTokenModal)?.name}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => setTokenSelectorVisible(false)} 
              className="w-10 h-10 rounded-2xl bg-white/5 items-center justify-center border border-white/10"
            >
              <IconSymbol name="xmark" size={18} color="white" />
            </TouchableOpacity>
          </View>

          <View className="px-6 py-5 bg-[#0a0a0a] border-b border-white/5">
            <View className="bg-white/5 rounded-2xl px-5 py-4 flex-row items-center border border-white/10 shadow-inner">
              <IconSymbol name="magnifyingglass" size={18} color="#666" />
              <TextInput 
                placeholder="Search name or paste address"
                placeholderTextColor="#444"
                className="flex-1 ml-4 text-white font-black text-base h-8"
                value={tokenSearchQuery}
                onChangeText={setTokenSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="px-4 pt-4 pb-20">
              {/* SUGGESTED SECTION */}
              {!tokenSearchQuery && (
                <View className="mb-6 px-2">
                  <Text className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Suggested</Text>
                  <View className="flex-row flex-wrap gap-2">
                     {tokensForSelectedChain.slice(0, 4).map(token => (
                       <TouchableOpacity 
                         key={`suggested-${token.symbol}`}
                         onPress={() => handleSelectToken(token)}
                         className="bg-white/5 px-3 py-2 rounded-xl border border-white/10 flex-row items-center"
                       >
                         {token.icon ? (
                            <Image source={{ uri: token.icon }} style={{ width: 16, height: 16, borderRadius: 8, marginRight: 6 }} />
                         ) : (
                            <Text className="mr-2 text-xs">{token.symbol[0]}</Text>
                         )}
                         <Text className="text-white font-bold text-xs">{token.symbol}</Text>
                       </TouchableOpacity>
                     ))}
                  </View>
                </View>
              )}

              <Text className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 px-2">All Assets</Text>
              <View className="gap-1">
                {tokensForSelectedChain.map(token => {
                  const isSelected = (selectingSide === 'from' ? fromToken.symbol : toToken.symbol) === token.symbol;
                  
                  return (
                    <TouchableOpacity
                      key={`${selectedChainIdForTokenModal}-${token.address}-${token.symbol}`}
                      onPress={() => handleSelectToken(token)}
                      className={`px-4 py-4 rounded-3xl flex-row items-center justify-between border ${isSelected ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-white/5'}`}
                    >
                      <View className="flex-row items-center flex-1">
                        <View className="w-12 h-12 rounded-2xl bg-white/5 items-center justify-center mr-4 border border-white/10">
                          {token.icon ? (
                            <Image source={{ uri: token.icon }} style={{ width: 32, height: 32, borderRadius: 10 }} />
                          ) : (
                            <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
                              <Text className="text-primary font-black text-sm">{token.symbol[0]}</Text>
                            </View>
                          )}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center">
                            <Text className="text-white font-black text-lg tracking-tight mr-2">{token.symbol}</Text>
                            {token.symbol === "BTC1" && (
                              <View className="bg-primary/20 px-1.5 py-0.5 rounded-md border border-primary/30">
                                <Text className="text-primary text-[8px] font-black uppercase">Featured</Text>
                              </View>
                            )}
                          </View>
                          <Text numberOfLines={1} className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{token.name}</Text>
                        </View>
                      </View>
                      <View className="flex-row items-center">
                        {isSelected && (
                          <View className="mr-2">
                            <IconSymbol name="checkmark.circle.fill" size={24} color={colors.primary} />
                          </View>
                        )}
                        <IconSymbol name="chevron.right" size={14} color="#333" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {tokensForSelectedChain.length === 0 && (
                <View className="items-center py-20">
                  <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-6 border border-white/5">
                    <IconSymbol name="doc.text.magnifyingglass" size={32} color="#333" />
                  </View>
                  <Text className="text-white font-black text-lg">No assets found</Text>
                  <Text className="text-gray-500 text-sm mt-2 font-medium">Try searching for a different symbol or address</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </ScreenContainer>
  );
}
