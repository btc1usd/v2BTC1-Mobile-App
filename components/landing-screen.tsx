import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from "react-native";
import { MotiView } from "moti";
import { ScreenContainer } from "./screen-container";
import { ConnectButton } from "thirdweb/react";
import { 
  inAppWallet, 
  createWallet 
} from "thirdweb/wallets";
import { client } from "@/lib/thirdweb";
import { defineChain } from "thirdweb";
import { DEFAULT_CHAIN_ID } from "@/lib/network-manager";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useThemeContext } from "@/lib/theme-provider";
import { LinearGradient } from "expo-linear-gradient";

export function LandingScreen() {
  const router = useRouter();
  const { colorScheme, setColorScheme } = useThemeContext();
  const chain = defineChain(DEFAULT_CHAIN_ID);

  // Define wallets inside the component to ensure proper scope
  const wallets = [
    // In-App Wallet with Social Login + Passkey
    inAppWallet({
      auth: {
        options: [
          "google",
          "apple",
          "facebook",
          "email",
          "phone",   // SMS authentication (more reliable than passkey)
        ],
        // Removed passkeyDomain temporarily due to native passkey issues
        // passkeyDomain: "https://btc1usd-mobile.pages.dev", // Required for native passkey support
        // redirectUrl: "btc1usd://auth", // App deep link for authentication return
      },
    }),
    
    // Mobile Wallets
    createWallet("io.metamask"),
    createWallet("com.coinbase.wallet"),
    createWallet("me.rainbow"),
    createWallet("com.trustwallet.app"),
    
    // Additional Popular Wallets
    createWallet("io.zerion.wallet"),
    createWallet("app.phantom"),
    createWallet("io.rabby"),
    
    // WalletConnect (catch-all for any wallet)
    createWallet("walletConnect"),
  ];

  const handleToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  };

  const handleConnected = () => {
    // Connection successful, navigate to dashboard
    router.replace("/(tabs)");
  };

  const features = [
    {
      icon: "₿",
      title: "Bitcoin-Backed",
      description: "100% backed by Bitcoin reserves with Shariah compliance"
    },
    {
      icon: "🛡️",
      title: "Secure",
      description: "Enterprise-grade security with regular third-party audits"
    },
    {
      icon: "📈",
      title: "Yield Generation",
      description: "Earn weekly rewards from protocol fees and donations"
    },
    {
      icon: "👥",
      title: "Community Governed",
      description: "Decentralized governance with community voting"
    }
  ];

  return (
    <ScreenContainer className="bg-background" edges={["top", "left", "right"]}>
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 py-8">
          {/* Theme Toggle - Elegant design */}
          <View className="absolute top-2 right-4 z-10">
            <TouchableOpacity
              onPress={handleToggleTheme}
              className="w-12 h-12 rounded-2xl items-center justify-center"
              style={{
                backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                borderWidth: 1,
                borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
              }}
              activeOpacity={0.7}
            >
              <Text className="text-2xl">{colorScheme === "dark" ? "🌙" : "☀️"}</Text>
            </TouchableOpacity>
          </View>

          {/* Hero Section with Premium Logo */}
          <View className="items-center mt-12 mb-10">
            {/* Animated Glow Effect Background */}
            <View style={{
              position: 'relative',
              marginBottom: 24,
            }}>
              {/* Outer Glow - Brighter and more prominent */}
              <MotiView
                from={{ opacity: 0.3 }}
                animate={{ opacity: 0.6 }}
                transition={{
                  type: 'timing',
                  duration: 1500,
                  loop: true,
                }}
                style={{
                  position: 'absolute',
                  width: 220,
                  height: 220,
                  borderRadius: 110,
                  backgroundColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.25)' : 'rgba(59, 130, 246, 0.2)',
                  top: -30,
                  left: -30,
                }}
              />
              
              {/* Middle Glow Ring */}
              <MotiView
                from={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 1.1, opacity: 0.8 }}
                transition={{
                  type: 'timing',
                  duration: 2000,
                  loop: true,
                }}
                style={{
                  position: 'absolute',
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  backgroundColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                  top: -20,
                  left: -20,
                }}
              />
              
              {/* Logo Container - White background for light/bright effect */}
              <View style={{
                width: 160,
                height: 160,
                borderRadius: 80,
                backgroundColor: '#ffffff',
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 3,
                borderColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.5)' : 'rgba(59, 130, 246, 0.3)',
                shadowColor: '#3b82f6',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.5,
                shadowRadius: 24,
                elevation: 16,
              }}>
                <Image
                  source={require("@/assets/images/icon.png")}
                  style={{ width: 120, height: 120 }}
                  resizeMode="contain"
                />
              </View>
            </View>
            
            {/* Brand Title - BLACK text on white for consistency */}
            <View className="items-center mb-4">
              <Text 
                className="text-6xl font-black text-center mb-2" 
                style={{ 
                  color: '#000000',
                  letterSpacing: 2,
                  textShadowColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.4)' : 'rgba(59, 130, 246, 0.3)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 10,
                }}
              >
                BTC1
              </Text>
              
              {/* Subtitle Badge */}
              <View style={{
                backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(37, 99, 235, 0.2)',
                marginBottom: 16,
              }}>
                <Text 
                  className="text-base font-bold text-center" 
                  style={{ color: colorScheme === 'dark' ? '#60a5fa' : '#2563eb' }}
                >
                  Bitcoin-Backed Coin
                </Text>
              </View>
              
              {/* Beautiful Tagline */}
              <View className="px-4 mb-4">
                <Text 
                  className="text-lg font-bold text-center leading-7" 
                  style={{ 
                    color: colorScheme === 'dark' ? '#e2e8f0' : '#1e293b',
                    lineHeight: 28,
                  }}
                >
                  New Digital Money Backed by Bitcoin
                </Text>
                <Text 
                  className="text-base font-semibold text-center leading-6 mt-2" 
                  style={{ 
                    color: colorScheme === 'dark' ? '#94a3b8' : '#64748b',
                  }}
                >
                  Stable Like Dollar • Sharing Rewards • Giving Back
                </Text>
              </View>
            </View>
            
            {/* Description with Icon */}
            <View className="flex-row items-center justify-center px-6 mb-2">
              <Text className="text-2xl mr-2">✨</Text>
              <Text 
                className="text-base font-semibold text-center" 
                style={{ color: colorScheme === 'dark' ? '#94a3b8' : '#64748b' }}
              >
                Shariah Compliant • Profit Sharing • Charity
              </Text>
            </View>
            
            {/* Trust Indicators */}
            <View className="flex-row items-center justify-center gap-3 mt-3">
              <View className="flex-row items-center">
                <Text className="text-base mr-1">🔒</Text>
                <Text style={{ color: colorScheme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 13, fontWeight: '600' }}>Secure</Text>
              </View>
              <Text style={{ color: colorScheme === 'dark' ? '#475569' : '#cbd5e1' }}>•</Text>
              
              <Text style={{ color: colorScheme === 'dark' ? '#475569' : '#cbd5e1' }}>•</Text>
              <View className="flex-row items-center">
                <Text className="text-base mr-1">⚡</Text>
                <Text style={{ color: colorScheme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 13, fontWeight: '600' }}>Fast</Text>
              </View>
            </View>
          </View>

          {/* Premium CTA Button */}
          <View className="px-2 mb-16">
            <View style={{
              borderRadius: 28,
              overflow: 'hidden',
              shadowColor: '#3b82f6',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 16,
              elevation: 12,
            }}>
              <ConnectButton
                client={client}
                wallets={wallets}
                chain={chain}
                onConnect={handleConnected}
                connectButton={{
                  label: "🚀 Get Started Now",
                  style: {
                    width: "100%",
                    height: 68,
                    borderRadius: 28,
                    fontSize: 20,
                    fontWeight: "900",
                    backgroundColor: colorScheme === 'dark' ? '#3b82f6' : '#2563eb',
                    color: "white",
                    border: 'none',
                    letterSpacing: 0.5,
                  }
                }}
                theme={colorScheme === 'dark' ? 'dark' : 'light'}
                locale="en_US"
              />
            </View>
            
            {/* Subtext */}
            <Text 
              className="text-center mt-3 text-xs font-semibold" 
              style={{ color: colorScheme === 'dark' ? '#64748b' : '#94a3b8' }}
            >
              Connect wallet to start earning rewards
            </Text>
          </View>

          {/* Premium Feature Cards */}
          <View className="gap-5 mb-8">
            {features.map((feature, index) => (
              <View 
                key={index}
                style={{
                  backgroundColor: colorScheme === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.8)',
                  borderRadius: 24,
                  borderWidth: 1.5,
                  borderColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(226, 232, 240, 0.8)',
                  padding: 20,
                  shadowColor: colorScheme === 'dark' ? '#000' : '#64748b',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 12,
                  elevation: 3,
                }}
              >
                <View className="flex-row items-center">
                  {/* Icon with Gradient Background */}
                  <View style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 16,
                    borderWidth: 1,
                    borderColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)',
                  }}>
                    <Text className="text-3xl">{feature.icon}</Text>
                  </View>
                  
                  <View className="flex-1">
                    <Text 
                      className="text-lg font-bold mb-1" 
                      style={{ color: colorScheme === 'dark' ? '#f1f5f9' : '#0f172a' }}
                    >
                      {feature.title}
                    </Text>
                    <Text 
                      className="text-sm leading-5" 
                      style={{ color: colorScheme === 'dark' ? '#94a3b8' : '#64748b' }}
                    >
                      {feature.description}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Premium Footer */}
          <View className="mt-6 items-center pb-4">
            <View className="flex-row items-center mb-3">
              <View style={{
                width: 40,
                height: 1,
                backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(203, 213, 225, 0.5)',
              }} />
              <Text 
                className="text-xs font-bold mx-3" 
                style={{ color: colorScheme === 'dark' ? '#64748b' : '#94a3b8' }}
              >
                POWERED BY
              </Text>
              <View style={{
                width: 40,
                height: 1,
                backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(203, 213, 225, 0.5)',
              }} />
            </View>
            
            <View className="flex-row items-center gap-2">
              <Text 
                className="text-sm font-bold" 
                style={{ color: colorScheme === 'dark' ? '#60a5fa' : '#3b82f6' }}
              >
                Base Network
              </Text>
              <Text style={{ color: colorScheme === 'dark' ? '#475569' : '#cbd5e1' }}>•</Text>
              <Text 
                className="text-sm font-bold" 
                style={{ color: colorScheme === 'dark' ? '#f59e0b' : '#f97316' }}
              >
                Bitcoin
              </Text>
            </View>
            
            <Text 
              className="text-xs mt-2" 
              style={{ color: colorScheme === 'dark' ? '#475569' : '#cbd5e1' }}
            >
              Secured 
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}   