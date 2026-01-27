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
  RefreshControl,
  ActionSheetIOS,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { WebView } from 'react-native-webview';
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
  { id: 8453, name: "Base Mainnet", icon: "🔵" },

  { id: 1, name: "Ethereum", icon: "⟠" },
];

const STATIC_TOKENS: Record<number, Token[]> = {
  8453: [
    { symbol: "BTC1", name: "BTC1 USD", address: "0x9B8fc91C33ecAFE4992A2A8dBA27172328f423a5", decimals: 18, icon: "₿" },
  ],
};

const FIAT_TOKENS: Record<number, Token[]> = {
  8453: [
    { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, icon: "💵" },
    { symbol: "DAI", name: "Dai Stablecoin", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, icon: "◈" },
    { symbol: "USDT", name: "Tether USD", address: "0x41b24E83bFA2492352E1f37e351533d877EfB01D", decimals: 6, icon: "₮" },
  ],
  1: [
    { symbol: "USDC", name: "USD Coin", address: "0xA0b86a33E6417E4df2057B2d3C6d9F7cc11b0a70", decimals: 6, icon: "💵" },
    { symbol: "DAI", name: "Dai Stablecoin", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, icon: "◈" },
    { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, icon: "₮" },
  ]
};

const DEFAULT_TOKENS = [
  { symbol: "ETH", name: "Ethereum", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", decimals: 18, icon: "⟠" },
  { symbol: "USDC", name: "USD Coin", address: "0x0000000000000000000000000000000000000000", decimals: 6, icon: "💵" },
];

const BUY_API_URL = "https://develop--v2btc1.netlify.app/api/buyx";

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

export default function BuyScreen() {
  const { address, chainId, isConnected, signer, disconnectWallet } = useWeb3();
  const colors = useColors();

  // State
  const [supportedChains, setSupportedChains] = useState<Chain[]>(FALLBACK_CHAINS);
  const [tokensByChain, setTokensByChain] = useState<Record<number, Token[]>>(STATIC_TOKENS);

  const [fromChain, setFromChain] = useState<Chain>(FALLBACK_CHAINS[0]); // Fixed to Base
  const [toChain, setToChain] = useState<Chain>(FALLBACK_CHAINS[0]); // Selectable
  const [fromToken, setFromToken] = useState<Token>({ symbol: "USD", name: "US Dollar", address: "0x0000000000000000000000000000000000000000", decimals: 18, icon: "$" }); // Fixed to USD
  const [toToken, setToToken] = useState<Token>(STATIC_TOKENS[8453]?.[0] || { symbol: "BTC1", name: "BTC1 USD", address: "0x9B8fc91C33ecAFE4992A2A8dBA27172328f423a5", decimals: 18, icon: "₿" }); // Selectable
  const [amount, setAmount] = useState("");
  const [selectedOnramp, setSelectedOnramp] = useState<string>("coinbase");
  const [isProcessing, setIsProcessing] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  
  // WebView State
  const [providerSelectorVisible, setProviderSelectorVisible] = useState(false);
    const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewVisible, setWebViewVisible] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);

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
      return url.replace("ipfs://", "https://ipfs.io/ipfs/");
    }
    return url;
  };

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
  const filteredChainsInModal = useMemo(() => {
    if (!chainSearchQuery) return supportedChains;
    const query = chainSearchQuery.toLowerCase();
    return supportedChains.filter(c => c.name.toLowerCase().includes(query));
  }, [supportedChains, chainSearchQuery]);

  const tokensForSelectedChain = useMemo(() => {
    // For Buy tab, only show tokens for the destination chain (toChain)
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
          
          // Always use Base mainnet (8453) for buy functionality
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
          
          if (toChain.id === chainIdToFetch && combined.length > 0) {
            // For Buy tab, toToken should be selectable from available tokens
            // Default to BTC1 if available, otherwise first token
            const btc1Token = combined.find((t: any) => t.symbol === "BTC1");
            if (btc1Token) {
              setToToken(btc1Token);
            } else {
              setToToken(combined[0]);
            }
          }
          // For Buy tab, toToken should always remain BTC1 on Base chain
          // Don't change toToken based on fetched tokens
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
  // The buy functionality is restricted to Base mainnet (8453) only
  useEffect(() => {
    // Enforce Base mainnet (8453) as the only supported chain for buys
    const baseMainnet = supportedChains.find(c => Number(c.id) === 8453);
    if (baseMainnet) {
      setFromChain(baseMainnet);
      setToChain(baseMainnet);
      // Always keep fromToken as USD
      setFromToken({ symbol: "USD", name: "US Dollar", address: "0x0000000000000000000000000000000000000000", decimals: 18, icon: "$" });
    }
  }, [supportedChains]);

  // Ensure toChain is always Base (fixed)
  useEffect(() => {
    const baseChain = supportedChains.find(c => c.id === 8453);
    if (baseChain) {
      setToChain(baseChain);
    }
  }, [supportedChains]);

  // Fetch USDC balance for Max button
  useEffect(() => {
    let isCancelled = false;
    
    const fetchUsdcBalance = async () => {
      if (!address || !isConnected) {
        setUsdcBalance("0");
        return;
      }
      
      setIsFetchingBalance(true);
      
      try {
        // USDC address on Base mainnet
        const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const balance = await getTokenBalance(address, usdcAddress, 8453);
        if (!isCancelled) setUsdcBalance(balance);
      } catch (error) {
        console.error("Error fetching USDC balance:", error);
        if (!isCancelled) setUsdcBalance("0");
      } finally {
        if (!isCancelled) setIsFetchingBalance(false);
      }
    };
    
    fetchUsdcBalance();
    
    // Cleanup function
    return () => {
      isCancelled = true;
    };
  }, [address, isConnected]);

  // Standalone fetchUsdcBalance function for refresh control
  const fetchUsdcBalance = async () => {
    if (!address || !isConnected) {
      setUsdcBalance("0");
      return;
    }
    
    setIsFetchingBalance(true);
    
    try {
      // USDC address on Base mainnet
      const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const balance = await getTokenBalance(address, usdcAddress, 8453);
      setUsdcBalance(balance);
    } catch (error) {
      console.error("Error fetching USDC balance:", error);
      setUsdcBalance("0");
    } finally {
      setIsFetchingBalance(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh USDC balance
      if (isConnected && address) {
        await fetchUsdcBalance();
      }
      
      // Refresh quote if there's an amount entered
      if (amount && parseFloat(amount) > 0) {
        await fetchQuote();
      }
      
      // Add a small delay to show the refresh indicator
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

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
      // Validate inputs
      if (!amount || Number(amount) <= 0) {
        setQuote(null);
        return;
      }
      
      // Convert human-readable crypto amount to smallest units for API request
      let amountInSmallestUnits = "0";
      const humanAmount = parseFloat(amount);
      
      if (!isNaN(humanAmount) && humanAmount > 0) {
        // Convert to smallest units (wei for ETH, base units for ERC-20)
        const smallestUnits = humanAmount * Math.pow(10, toToken.decimals || 18);
        amountInSmallestUnits = Math.round(smallestUnits).toString();
        console.log(`Converting ${humanAmount} ${toToken.symbol} to ${amountInSmallestUnits} smallest units (${toToken.decimals} decimals)`);
      }
      
      if (amountInSmallestUnits === "0") {
        setQuote(null);
        return;
      }
      
      console.log('Fetching buy quote:', {
        humanAmount: amount,
        smallestUnits: amountInSmallestUnits,
        toToken: toToken.symbol,
        decimals: toToken.decimals,
        receiver: address || 'not connected',
        chainId: toChain.id
      });
      
      const response = await fetch(`${BUY_API_URL}/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          onramp: selectedOnramp,  // Use selected onramp provider
          chainId: toChain.id,
          tokenAddress: toToken.address,
          receiver: address || "0x0000000000000000000000000000000000000000",
          amountWei: amountInSmallestUnits,  // Send amount in smallest units
          currency: "USD",
          country: "US"
        })
      });
      
      // Check if response is HTML (error page)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const errorText = await response.text();
        console.error('Received HTML response instead of JSON:', errorText.substring(0, 200));
        throw new Error('API returned HTML instead of JSON - check API endpoint');
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Buy quote response:', data);
      console.log('Quote keys:', Object.keys(data));
      console.log('Destination amount:', data.destinationAmount);
      console.log('Intent amount:', data.intent?.amount);
      console.log('To token decimals:', toToken.decimals);
      console.log('To token:', toToken);
      
      // Set the quote data - the API returns the full response structure
      setQuote(data);
      console.log('Setting quote:', data);
      
    } catch (error: any) {
      console.error('Error fetching buy quote:', error);
      setQuote(null);
      
      // Show user-friendly error message
      if (error.message.includes('JSON Parse error')) {
        Alert.alert('API Error', 'The buy service is temporarily unavailable. Please try again later.');
      } else if (error.message.includes('API returned HTML')) {
        Alert.alert('Service Error', 'The buy service is currently unavailable. Please try again later.');
      } else {
        Alert.alert('Error', error.message || 'Failed to fetch quote');
      }
    } finally {
      setIsFetchingQuote(false);
    }
  };

  const handleBuy = async () => {
    if (!isConnected || !signer) {
      Alert.alert("Connect Wallet", "Please connect your wallet to buy.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Check if user is on Base mainnet (8453) - required for buy functionality
      // NOTE: API only supports mainnet chain IDs, not testnet
      const walletChainId = Number(chainId);
      const BASE_MAINNET_ID = 8453;  // Base mainnet
      
      if (walletChainId && walletChainId !== BASE_MAINNET_ID) {
        console.log(`Chain mismatch: wallet=${walletChainId}, required=${BASE_MAINNET_ID}`);
        Alert.alert("Switch Network", `Please switch your wallet to Base mainnet (${BASE_MAINNET_ID}) to continue. Current: ${walletChainId}. The buy API only supports mainnet transactions, not testnet.`);
        setIsProcessing(false);
        return;
      } else if (!walletChainId) {
        Alert.alert("Network Error", "Could not detect wallet chain. Please reconnect your wallet.");
        setIsProcessing(false);
        return;
      }

      // Convert human-readable crypto amount to smallest units for API request
      let amountInSmallestUnits = "0";
      const humanAmount = parseFloat(amount);
      
      if (!isNaN(humanAmount) && humanAmount > 0) {
        // Convert to smallest units (wei for ETH, base units for ERC-20)
        const smallestUnits = humanAmount * Math.pow(10, toToken.decimals || 18);
        amountInSmallestUnits = Math.round(smallestUnits).toString();
        console.log(`Converting ${humanAmount} ${toToken.symbol} to ${amountInSmallestUnits} smallest units (${toToken.decimals} decimals)`);
      }
      
      if (amountInSmallestUnits === "0") {
        Alert.alert("Invalid Amount", "Please enter a valid crypto amount.");
        setIsProcessing(false);
        return;
      }
      
      console.log('Executing buy transaction:', {
        humanAmount: amount,
        smallestUnits: amountInSmallestUnits,
        toToken: toToken.symbol,
        decimals: toToken.decimals,
        receiver: address,
        chainId: toChain.id
      });

      // Use the quote API to get the redirect URL
      const response = await fetch(`${BUY_API_URL}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onramp: selectedOnramp,  // Use selected onramp provider
          chainId: toChain.id,
          tokenAddress: toToken.address,
          receiver: address,
          amountWei: amountInSmallestUnits,  // Send amount in smallest units
          currency: "USD",
          country: "US"
        }),
      });

      // Check if response is HTML (error page)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const errorText = await response.text();
        console.error('Received HTML response instead of JSON:', errorText.substring(0, 200));
        throw new Error('API returned HTML instead of JSON - check API endpoint');
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Execute API Error Response:', errorText);
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Buy quote response:', result);

      // Handle the redirect URL
      if (result.link) {
        // Set the WebView URL and show the WebView
        setWebViewUrl(result.link);
        setWebViewVisible(true);
      } else {
        throw new Error(result.error || "Failed to initiate buy - no redirect link provided");
      }
    } catch (error: any) {
      console.error("Buy failed:", error);
      
      // Show user-friendly error message
      let errorMessage = error.message || "Something went wrong.";
      if (error.message.includes('JSON Parse error')) {
        errorMessage = 'The buy service is temporarily unavailable. Please try again later.';
      } else if (error.message.includes('API returned HTML')) {
        errorMessage = 'The buy service is currently unavailable. Please try again later.';
      }
      
      Alert.alert("Error", errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const openNetworkSelector = (side: "from" | "to") => {
    // For Buy tab, always select networks for the "to" side (destination)
    setSelectingSide("to");
    setChainSearchQuery("");
    setNetworkSelectorVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openTokenSelector = (side: "from" | "to") => {
    // For Buy tab, always select tokens for the "to" side (destination)
    setSelectingSide("to");
    setTokenSearchQuery("");
    setSelectedChainIdForTokenModal(toChain.id);
    setTokenSelectorVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectChain = (chain: Chain) => {
    // For Buy tab, only update the destination chain (toChain)
    setToChain(chain);
    setNetworkSelectorVisible(false);
    setTimeout(() => {
      setSelectedChainIdForTokenModal(chain.id);
      setTokenSelectorVisible(true);
    }, 300);
  };

  const handleSelectToken = (token: Token) => {
    // For Buy tab, only update the destination token (toToken)
    console.log('Selecting token:', token);
    console.log('Token decimals:', token.decimals);
    setToToken(token);
    setTokenSelectorVisible(false);
  };

  // Guards
  if (!isConnected) {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <View className="items-center">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
            <Text className="text-4xl">🔐</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mb-2">Connect Wallet</Text>
          <Text className="text-base text-muted text-center">Connect your wallet to buy BTC1 tokens</Text>
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

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="py-6">
          <Text className="text-3xl font-bold text-foreground mb-2">Buy</Text>
          <Text className="text-base text-muted mb-8">Purchase tokens with fiat currency</Text>
        </View>

        {/* Buy UI Card - Thirdweb Style */}
        <View className="bg-surface rounded-3xl p-6 border border-border shadow-lg">
          {/* YOU WANT SECTION - Chain and Token Selection at Top */}
          <View className="bg-muted/5 rounded-[32px] p-5 border border-border/30 mb-4">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-[11px] font-black text-muted uppercase tracking-[2px]">You Want</Text>
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
                  {toToken.symbol === 'BTC1' ? (
                    // Use BTC1 specific icon handling
                    <Image 
                      source={require('../../assets/images/icon.png')} 
                      style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8 }} 
                    />
                  ) : toToken.icon && (toToken.icon.startsWith('http') || toToken.icon.startsWith('data:image')) ? (
                    <Image source={{ uri: toToken.icon }} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8 }} />
                  ) : toToken.icon && (toToken.icon.startsWith('./') || toToken.icon.startsWith('/')) ? (
                    <Image source={require('../../assets/images/icon.png')} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8 }} />
                  ) : (
                    <View className="w-5 h-5 rounded-full bg-surface items-center justify-center mr-2 border border-border/20">
                      <Text className="text-xs">{toToken.icon || toToken.symbol[0]}</Text>
                    </View>
                  )}
                  <Text className="text-xs font-black text-foreground uppercase tracking-tight">{toToken.symbol}</Text>
                </View>
                <IconSymbol name="chevron.down" size={10} color={colors.muted} />
              </TouchableOpacity>
            </View>
            
            {/* Amount Input - Human Readable Crypto Amount */}
            <View className="bg-background/40 rounded-2xl px-5 py-4 border border-border/20 shadow-inner">
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 text-3xl font-black text-foreground p-0"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted + '60'}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={(text) => {
                    // Allow only numeric input with decimal point
                    if (text === '' || /^\d*\.?\d*$/.test(text)) {
                      setAmount(text);
                    }
                  }}
                  onFocus={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                />
                <Text className="text-foreground font-black text-2xl ml-2">{toToken.symbol}</Text>
              </View>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-xs font-bold text-muted uppercase tracking-widest">{toToken.symbol} Amount</Text>
              </View>
            </View>
          </View>

          {/* Payment Provider Selection - Modal Like Token Selector */}
          <View className="bg-muted/5 rounded-[32px] p-5 border border-border/30 mb-4">
            <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Payment Provider</Text>
            
            <TouchableOpacity 
              onPress={() => setProviderSelectorVisible(true)}
              className="bg-background/80 px-4 py-4 rounded-2xl border border-border/50 flex-row items-center justify-between shadow-sm"
            >
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3">
                  <Text className="text-primary font-bold text-sm">
                    {selectedOnramp === 'coinbase' ? 'C' : 
                     selectedOnramp === 'stripe' ? 'S' : 
                     selectedOnramp === 'transak' ? 'T' : 'P'}
                  </Text>
                </View>
                <View>
                  <Text className="text-foreground font-black capitalize">{selectedOnramp}</Text>
                  <Text className="text-xs text-muted">
                    {selectedOnramp === 'coinbase' ? 'Best rates available' : 
                     selectedOnramp === 'stripe' ? 'Global coverage' : 
                     selectedOnramp === 'transak' ? 'Fast processing' : 'Select provider'}
                  </Text>
                </View>
              </View>
              <IconSymbol name="chevron.down" size={16} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Estimated Cost in USD */}
          <View className="bg-muted/5 rounded-[32px] p-5 border border-border/30 mb-4">
            <View className="bg-background/40 rounded-2xl px-5 py-4 border border-border/20 shadow-inner">
              <Text className="text-xs text-muted font-black uppercase tracking-widest mb-1">Estimated Cost</Text>
              {isFetchingQuote ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="text-2xl font-black text-foreground">
                  {quote && amount && parseFloat(amount) > 0 ? (
                    (() => {
                      console.log('Calculating USD estimate for crypto amount');
                      console.log('Quote object:', quote);
                      console.log('Input amount:', amount);
                      console.log('To token:', toToken);
                      console.log('Token decimals:', toToken.decimals);
                                    
                      // Calculate USD estimate based on crypto amount and quote
                      if (quote.currencyAmount && quote.destinationAmount) {
                        const currencyAmt = parseFloat(quote.currencyAmount);
                        const destAmt = parseFloat(quote.destinationAmount);
                                      
                        if (!isNaN(currencyAmt) && !isNaN(destAmt) && destAmt > 0) {
                          console.log('Raw API values:', { currencyAmt, destAmt, cryptoAmount: parseFloat(amount) });
                          
                          // Check if currencyAmount is already in USD (large number)
                          if (currencyAmt >= 1) {
                            // currencyAmount is USD, destinationAmount is crypto in smallest units
                            // Convert destinationAmount from smallest units to human readable
                            const humanDestAmount = destAmt / Math.pow(10, toToken.decimals || 18);
                            // Calculate USD per unit of crypto
                            const usdPerUnit = currencyAmt / humanDestAmount;
                            const cryptoAmount = parseFloat(amount);
                            const usdEstimate = usdPerUnit * cryptoAmount;
                                        
                            if (usdEstimate > 0 && usdEstimate < 1000000) {
                              const formatted = `$${usdEstimate.toFixed(2)}`;
                              console.log(`USD estimate (Method 1): ${currencyAmt}/${humanDestAmount} * ${cryptoAmount} = ${formatted}`);
                              return formatted;
                            }
                          } else {
                            // currencyAmount is small (likely crypto), destinationAmount might be USD
                            if (destAmt >= 1) {
                              // destinationAmount is USD, currencyAmount is crypto in smallest units
                              const humanCurrencyAmount = currencyAmt / Math.pow(10, toToken.decimals || 18);
                              const usdPerUnit = destAmt / humanCurrencyAmount;
                              const cryptoAmount = parseFloat(amount);
                              const usdEstimate = usdPerUnit * cryptoAmount;
                                        
                              if (usdEstimate > 0 && usdEstimate < 1000000) {
                                const formatted = `$${usdEstimate.toFixed(2)}`;
                                console.log(`USD estimate (Method 2): ${destAmt}/${humanCurrencyAmount} * ${cryptoAmount} = ${formatted}`);
                                return formatted;
                              }
                            } else {
                              // Both are small numbers - use exchange rate approach
                              const usdPerUnit = currencyAmt / destAmt;
                              const cryptoAmount = parseFloat(amount);
                              const usdEstimate = usdPerUnit * cryptoAmount;
                                        
                              if (usdEstimate > 0 && usdEstimate < 1000000) {
                                const formatted = `$${usdEstimate.toFixed(2)}`;
                                console.log(`USD estimate (Method 3): ${currencyAmt}/${destAmt} * ${cryptoAmount} = ${formatted}`);
                                return formatted;
                              }
                            }
                          }
                        }
                      }
                                    
                      // Fallback to simple rate calculation
                      const cryptoAmount = parseFloat(amount);
                      if (!isNaN(cryptoAmount) && cryptoAmount > 0) {
                        // Use approximate market rates
                        let usdRate;
                        if (toToken.symbol === 'ETH') {
                          usdRate = 2900;
                        } else if (toToken.symbol === 'BTC1') {
                          usdRate = 1; // BTC1 is pegged to $1
                        } else if (['USDC', 'USDT'].includes(toToken.symbol)) {
                          usdRate = 1; // Stablecoins
                        } else {
                          usdRate = 100; // Default rate
                        }
                                      
                        const usdEstimate = cryptoAmount * usdRate;
                        const formatted = `$${usdEstimate.toFixed(2)}`;
                        console.log(`Fallback USD estimate: ${cryptoAmount} * ${usdRate} = ${formatted}`);
                        return formatted;
                      }
                                    
                      console.log('No valid calculation possible, returning $0.00');
                      return "$0.00";
                    })()
                  ) : "$0.00"}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={handleBuy}
            disabled={isProcessing || !amount || Number(amount) <= 0}
            className={`mt-6 py-4 rounded-2xl items-center justify-center ${
              isProcessing || !amount || Number(amount) <= 0 ? "bg-muted/50" : "bg-primary"
            }`}
          >
            {isProcessing ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-lg font-black">
                Buy
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="mt-8 mb-12 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <View className="flex-row items-center mb-2">
            <IconSymbol name="info.circle" size={16} color={colors.primary} />
            <Text className="ml-2 font-bold text-primary">Native Experience</Text>
          </View>
          <Text className="text-xs text-muted leading-5">
            Buy BTC1 directly with cross-chain support. Powered by our high-performance liquidity engine for the best possible rates.
          </Text>
        </View>
      </ScrollView>

      {/* WEBVIEW MODAL FOR ONRAMP FLOW */}
      <Modal
        visible={webViewVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setWebViewVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center justify-between p-4 bg-surface border-b border-border/20">
            <Text className="text-xl font-black text-foreground">Payment</Text>
            <TouchableOpacity 
              onPress={() => {
                setWebViewVisible(false);
                setWebViewUrl(null);
              }}
              className="w-10 h-10 rounded-full bg-muted/20 items-center justify-center"
            >
              <IconSymbol name="xmark" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          
          {webViewUrl ? (
            <WebView
              source={{ uri: webViewUrl }}
              className="flex-1"
              startInLoadingState={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={["*"]}
              mixedContentMode="compatibility"
              allowsInlineMediaPlayback={true}
              renderLoading={() => (
                <View className="flex-1 items-center justify-center bg-background">
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text className="mt-4 text-foreground">Loading payment gateway...</Text>
                </View>
              )}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('WebView error:', nativeEvent);
              }}
              onHttpError={(event) => {
                console.error('WebView HTTP error:', event);
              }}
              onShouldStartLoadWithRequest={(request) => {
                // Allow all navigation within the WebView
                return true;
              }}
            />
          ) : (
            <View className="flex-1 items-center justify-center bg-background">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="mt-4 text-foreground">Preparing payment gateway...</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* NETWORK SELECTOR MODAL */}
      <Modal
        visible={networkSelectorVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setNetworkSelectorVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-background">
          <View className="px-6 py-6 flex-row justify-between items-center border-b border-border/10">
            <View>
              <Text className="text-2xl font-black text-foreground tracking-tight">Select Network</Text>
              <Text className="text-[11px] text-muted font-bold uppercase tracking-widest mt-0.5">Choose source network</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setNetworkSelectorVisible(false)} 
              className="w-10 h-10 rounded-2xl bg-muted/10 items-center justify-center border border-border/20"
            >
              <IconSymbol name="xmark" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View className="px-6 py-5">
            <View className="bg-muted/10 rounded-2xl px-5 py-4 flex-row items-center border border-border/20 shadow-inner">
              <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
              <TextInput 
                placeholder="Search networks"
                placeholderTextColor={colors.muted}
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
                  className={`w-[48%] bg-muted/10 p-5 rounded-[32px] items-center justify-center border-2 ${
                    (selectingSide === 'from' ? fromChain.id : toChain.id) === chain.id 
                    ? 'border-primary bg-primary/10' 
                    : 'border-transparent'
                  }`}
                >
                  <View className="w-14 h-14 rounded-2xl bg-white/5 items-center justify-center mb-3 shadow-sm border border-white/10">
                    <Image source={{ uri: chain.icon }} style={{ width: 32, height: 32, borderRadius: 8 }} />
                  </View>
                  <Text numberOfLines={1} className="text-foreground font-black text-xs uppercase tracking-tight">
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
        <SafeAreaView className="flex-1 bg-background">
          <View className="px-6 py-6 flex-row justify-between items-center border-b border-border/10 bg-surface">
            <View>
              <Text className="text-2xl font-black text-foreground tracking-tight">Select Token</Text>
              <Text className="text-[11px] text-muted font-bold uppercase tracking-widest mt-0.5">
                On {supportedChains.find(c => c.id === selectedChainIdForTokenModal)?.name}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => setTokenSelectorVisible(false)} 
              className="w-10 h-10 rounded-2xl bg-muted/10 items-center justify-center border border-border/20"
            >
              <IconSymbol name="xmark" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View className="px-6 py-5 bg-surface border-b border-border/10">
            <View className="bg-muted/10 rounded-2xl px-5 py-4 flex-row items-center border border-border/20 shadow-inner">
              <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
              <TextInput 
                placeholder="Search name or paste address"
                placeholderTextColor={colors.muted}
                className="flex-1 ml-4 text-foreground font-black text-base h-8"
                value={tokenSearchQuery}
                onChangeText={setTokenSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="px-4 pt-4 pb-20">
              {!tokenSearchQuery && (
                <View className="mb-6 px-2">
                  <Text className="text-[10px] font-black text-muted uppercase tracking-widest mb-3">Suggested</Text>
                  <View className="flex-row flex-wrap gap-2">
                     {tokensForSelectedChain.slice(0, 4).map(token => (
                       <TouchableOpacity 
                         key={`suggested-${token.symbol}`}
                         onPress={() => handleSelectToken(token)}
                         className="bg-muted/10 px-3 py-2 rounded-xl border border-border/20 flex-row items-center"
                       >
                         {token.icon ? (
                            <Image source={{ uri: token.icon }} style={{ width: 16, height: 16, borderRadius: 8, marginRight: 6 }} />
                         ) : (
                            <Text className="mr-2 text-xs">{token.symbol[0]}</Text>
                         )}
                         <Text className="text-foreground font-bold text-xs">{token.symbol}</Text>
                       </TouchableOpacity>
                     ))}
                  </View>
                </View>
              )}

              <Text className="text-[10px] font-black text-muted uppercase tracking-widest mb-3 px-2">All Assets</Text>
              <View className="gap-1">
                {tokensForSelectedChain.map(token => {
                  const isSelected = (selectingSide === 'from' ? fromToken.symbol : toToken.symbol) === token.symbol;
                  
                  return (
                    <TouchableOpacity
                      key={`${selectedChainIdForTokenModal}-${token.address}-${token.symbol}`}
                      onPress={() => handleSelectToken(token)}
                      className={`px-4 py-4 rounded-3xl flex-row items-center justify-between border ${isSelected ? 'bg-primary/10 border-primary/30' : 'bg-muted/10 border-border/10'}`}
                    >
                      <View className="flex-row items-center flex-1">
                        <View className="w-12 h-12 rounded-2xl bg-muted/10 items-center justify-center mr-4 border border-border/20">
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
                            <Text className="text-foreground font-black text-lg tracking-tight mr-2">{token.symbol}</Text>
                            {token.symbol === "BTC1" && (
                              <View className="bg-primary/20 px-1.5 py-0.5 rounded-md border border-primary/30">
                                <Text className="text-primary text-[8px] font-black uppercase">Featured</Text>
                              </View>
                            )}
                          </View>
                          <Text numberOfLines={1} className="text-[11px] text-muted font-bold uppercase tracking-widest mt-0.5">{token.name}</Text>
                        </View>
                      </View>
                      <View className="flex-row items-center">
                        {isSelected && (
                          <View className="mr-2">
                            <IconSymbol name="checkmark.circle.fill" size={24} color={colors.primary} />
                          </View>
                        )}
                        <IconSymbol name="chevron.right" size={14} color={colors.muted} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {tokensForSelectedChain.length === 0 && (
                <View className="items-center py-20">
                  <View className="w-20 h-20 rounded-full bg-muted/10 items-center justify-center mb-6 border border-border/10">
                    <IconSymbol name="doc.text.magnifyingglass" size={32} color={colors.muted} />
                  </View>
                  <Text className="text-foreground font-black text-lg">No assets found</Text>
                  <Text className="text-muted text-sm mt-2 font-medium">Try searching for a different symbol or address</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* PROVIDER SELECTOR MODAL */}
      <Modal
        visible={providerSelectorVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setProviderSelectorVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-background">
          <View className="px-6 py-6 flex-row justify-between items-center border-b border-border/10 bg-surface">
            <View>
              <Text className="text-2xl font-black text-foreground tracking-tight">Select Provider</Text>
              <Text className="text-[11px] text-muted font-bold uppercase tracking-widest mt-0.5">
                Payment Method
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => setProviderSelectorVisible(false)} 
              className="w-10 h-10 rounded-2xl bg-muted/10 items-center justify-center border border-border/20"
            >
              <IconSymbol name="xmark" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-6 py-4">
            <View className="space-y-3">
              <TouchableOpacity 
                onPress={() => {
                  setSelectedOnramp('coinbase');
                  setProviderSelectorVisible(false);
                }}
                className="bg-surface/80 p-4 rounded-2xl border border-border/50 flex-row items-center"
              >
                <View className="w-10 h-10 rounded-full bg-blue-500/10 items-center justify-center mr-4">
                  <Text className="text-blue-500 font-bold text-sm">C</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-black capitalize">coinbase</Text>
                  <Text className="text-xs text-muted">Best rates available</Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => {
                  setSelectedOnramp('stripe');
                  setProviderSelectorVisible(false);
                }}
                className="bg-surface/80 p-4 rounded-2xl border border-border/50 flex-row items-center"
              >
                <View className="w-10 h-10 rounded-full bg-green-500/10 items-center justify-center mr-4">
                  <Text className="text-green-500 font-bold text-sm">S</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-black capitalize">stripe</Text>
                  <Text className="text-xs text-muted">Global coverage</Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => {
                  setSelectedOnramp('transak');
                  setProviderSelectorVisible(false);
                }}
                className="bg-surface/80 p-4 rounded-2xl border border-border/50 flex-row items-center"
              >
                <View className="w-10 h-10 rounded-full bg-purple-500/10 items-center justify-center mr-4">
                  <Text className="text-purple-500 font-bold text-sm">T</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-black capitalize">transak</Text>
                  <Text className="text-xs text-muted">Fast processing</Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </ScreenContainer>
  );
}    