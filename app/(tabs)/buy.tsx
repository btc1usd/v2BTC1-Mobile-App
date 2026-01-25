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
import { ScreenContainer } from "@/components/screen-container";
import { WalletHeader } from "@/components/wallet-header";
import { NetworkBanner } from "@/components/network-indicator";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { THIRDWEB_CLIENT_ID } from "@/lib/thirdweb";

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
    { symbol: "BTC1", name: "BTC1 USD", address: "0x43Cd5E8A5bdaEa790a23C4a5DcCc0c11E70C9daB", decimals: 18, icon: "₿" },
  ],
  8453: [
    { symbol: "BTC1", name: "BTC1 USD", address: "0x9B8fc91C33ecAFE4992A2A8dBA27172328f423a5", decimals: 18, icon: "₿" },
  ],
};

const DEFAULT_TOKENS = [
  { symbol: "ETH", name: "Ethereum", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", decimals: 18, icon: "⟠" },
  { symbol: "USDC", name: "USD Coin", address: "0x0000000000000000000000000000000000000000", decimals: 6, icon: "💵" },
];

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

export default function BuyScreen() {
  const { address, chainId, isConnected, signer, disconnectWallet } = useWeb3();
  const colors = useColors();

  // State
  const [supportedChains, setSupportedChains] = useState<Chain[]>(FALLBACK_CHAINS);
  const [tokensByChain, setTokensByChain] = useState<Record<number, Token[]>>(STATIC_TOKENS);

  const [fromChain, setFromChain] = useState<Chain>(FALLBACK_CHAINS[0]);
  const [toChain, setToChain] = useState<Chain>(FALLBACK_CHAINS[0]);
  const [fromToken, setFromToken] = useState<Token>(STATIC_TOKENS[8453]?.[0] || DEFAULT_TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(STATIC_TOKENS[8453]?.[0] || DEFAULT_TOKENS[0]);
  const [amount, setAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);

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

  // Fetch Chains from Thirdweb
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
          
          const current = mappedChains.find((c: any) => c.id === chainId) || mappedChains.find((c: any) => c.id === 8453) || mappedChains[0];
          setFromChain(current);
          setToChain(current);
          setSelectedChainIdForTokenModal(current.id);
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
        const response = await fetch(`https://bridge.thirdweb.com/v1/tokens?chainId=${chainIdToFetch}&limit=100&offset=0&includePrices=false`, {
          headers: { "x-client-id": THIRDWEB_CLIENT_ID },
        });
        const data = await response.json();
        const tokens = data.tokens || [];
        
        if (tokens.length > 0) {
          const mappedTokens = tokens.map((t: any) => ({
            symbol: t.symbol,
            name: t.name,
            address: t.address,
            decimals: t.decimals,
            icon: resolveIpfs(t.icon?.url),
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
      }
    };

    fetchTokens(fromChain.id);
    fetchTokens(toChain.id);
    fetchTokens(selectedChainIdForTokenModal);
  }, [fromChain.id, toChain.id, selectedChainIdForTokenModal]);

  // Sync fromChain with wallet chain if connected
  useEffect(() => {
    if (isConnected && chainId) {
      const walletChain = supportedChains.find(c => c.id === chainId);
      if (walletChain) setFromChain(walletChain);
    }
  }, [isConnected, chainId, supportedChains]);

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
      const response = await fetch(`${SWAP_API_URL}?fromChainId=${fromChain.id}&toChainId=${toChain.id}&fromToken=${fromToken.address}&toToken=${toToken.address}&amount=${amount}&userAddress=${address || ""}`);
      const data = await response.json();
      if (data.success) {
        setQuote(data.quote);
      }
    } catch (error) {
      console.error("Error fetching quote:", error);
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
      if (chainId !== fromChain.id) {
        Alert.alert("Switch Network", `Please switch your wallet to ${fromChain.name} to continue.`);
        setIsProcessing(false);
        return;
      }

      const response = await fetch(SWAP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChainId: fromChain.id,
          toChainId: toChain.id,
          fromToken: fromToken.address,
          toToken: toToken.address,
          amount: amount,
          userAddress: address,
        }),
      });

      const result = await response.json();

      if (result.success && result.transaction) {
        const tx = await signer.sendTransaction(result.transaction);
        console.log("Buy transaction sent:", tx.hash);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Buy transaction submitted!");
        setAmount("");
      } else {
        throw new Error(result.error || "Failed to initiate buy");
      }
    } catch (error: any) {
      console.error("Buy failed:", error);
      Alert.alert("Error", error.message || "Something went wrong.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
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

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        <View className="py-4">
          <Text className="text-3xl font-bold text-foreground mb-1">Buy BTC1</Text>
          <Text className="text-sm text-muted mb-6">Purchase BTC1 with any supported asset</Text>
        </View>

        {/* Buy UI Card */}
        <View className="bg-surface rounded-[40px] p-6 border border-border shadow-xl">
          {/* FROM SECTION */}
          <View className="bg-muted/5 rounded-[32px] p-5 border border-border/30">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-[11px] font-black text-muted uppercase tracking-[2px]">You Pay</Text>
              <View className="bg-primary/10 px-2 py-0.5 rounded-md">
                 <Text className="text-primary text-[9px] font-black uppercase">Source Asset</Text>
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
                onChangeText={setAmount}
              />
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-[10px] font-bold text-muted uppercase tracking-widest">Balance: 0.00</Text>
                <TouchableOpacity className="bg-primary/10 px-2 py-0.5 rounded">
                  <Text className="text-primary text-[9px] font-black uppercase">Max</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ARROW INDICATOR */}
          <View className="items-center -my-4 z-10">
            <View className="bg-surface w-11 h-11 rounded-2xl items-center justify-center border border-border shadow-2xl">
              <View className="bg-muted/5 w-full h-full items-center justify-center rounded-2xl">
                <IconSymbol name="arrow.down" size={20} color={colors.primary} />
              </View>
            </View>
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
                  {quote?.toAmount || "0.00"}
                </Text>
              )}
            </View>
          </View>


          <TouchableOpacity
            onPress={handleBuy}
            disabled={isProcessing || !amount || Number(amount) <= 0}
            className={`mt-6 py-4 rounded-2xl items-center justify-center shadow-lg ${
              isProcessing || !amount || Number(amount) <= 0 ? "bg-muted opacity-50" : "bg-primary"
            }`}
          >
            {isProcessing ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-lg font-black uppercase tracking-widest">
                {isConnected ? "Buy" : "Connect Wallet"}
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

    </ScreenContainer>
  );
}
