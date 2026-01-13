import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Image } from "react-native";
import { ScreenContainer } from "./screen-container";
import { WalletSelector } from "./wallet-selector";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useThemeContext } from "@/lib/theme-provider";

export function LandingScreen() {
  const router = useRouter();
  const [showWalletConnect, setShowWalletConnect] = React.useState(false);
  const { colorScheme, setColorScheme } = useThemeContext();

  const handleGetStarted = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowWalletConnect(true);
  };

  const handleToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  };

  const handleConnected = () => {
    // Connection successful, router will auto-navigate via useEffect in layout
  };
  
  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowWalletConnect(false);
  };

  const features = [
    {
      icon: "₿",
      title: "Bitcoin-Backed",
      description: "100% backed by Bitcoin reserves with Shariah compliance"
    },
    {
      icon: "🛡️",
      title: "Secure & Audited",
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
    <ScreenContainer className="bg-background">
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 py-12">
          {/* Theme Toggle - Always visible */}
          <View className="absolute top-4 right-6 z-10">
            <TouchableOpacity
              onPress={handleToggleTheme}
              className="bg-surface w-10 h-10 rounded-full border border-border items-center justify-center shadow-sm"
              activeOpacity={0.7}
            >
              <Text className="text-lg">{colorScheme === "dark" ? "🌙" : "☀️"}</Text>
            </TouchableOpacity>
          </View>

          {/* Show wallet connect screen or landing */}
          {showWalletConnect ? (
            <View>
              {/* Back Button */}
              <TouchableOpacity
                onPress={handleBack}
                className="flex-row items-center mb-6 active:opacity-70"
              >
                <Text className="text-2xl text-primary mr-2">‹</Text>
                <Text className="text-base font-semibold text-primary">Back</Text>
              </TouchableOpacity>
              
              {/* Wallet Selector Component */}
              <WalletSelector onConnected={handleConnected} />
            </View>
          ) : (
            <>
              {/* Logo and Header */}
              <View className="items-center mb-12">
                <View className="bg-gradient-to-br from-primary/20 to-primary/10 p-8 rounded-full mb-6 shadow-lg">
                  <Image
                    source={require("@/assets/images/icon.png")}
                    style={{ width: 100, height: 100 }}
                    resizeMode="contain"
                  />
                </View>
                
                <Text className="text-5xl font-bold text-center mb-3" style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000' }}>
                  BTC1
                </Text>
                <Text className="text-xl text-center font-semibold mb-2" style={{ color: colorScheme === 'dark' ? '#ffffff' : '#000000' }}>
                  Bitcoin-Backed Coin
                </Text>
                <Text className="text-base text-muted text-center px-4">
                  With built-in Profit Sharing & Charity
                </Text>
              </View>

              {/* Features Grid */}
              <View className="gap-4 mb-12">
                {features.map((feature, index) => (
                  <View 
                    key={index}
                    className="bg-surface p-6 rounded-3xl border-2 border-border shadow-sm"
                  >
                    <View className="flex-row items-start">
                      <View className="bg-primary/10 p-3 rounded-2xl mr-4">
                        <Text className="text-4xl">{feature.icon}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-xl font-bold text-foreground mb-2">
                          {feature.title}
                        </Text>
                        <Text className="text-sm text-muted leading-6">
                          {feature.description}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Connect Wallet Button */}
              <View className="mt-auto pt-8">
                <TouchableOpacity 
                  onPress={handleGetStarted}
                  className="bg-primary py-5 px-6 rounded-full items-center active:opacity-80 shadow-lg"
                >
                  <Text className="text-white text-xl font-bold">
                    Get Started
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => {}}
                  className="mt-4 py-3 items-center"
                >
                  <Text className="text-primary text-base font-semibold">
                    Learn More
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View className="mt-8 items-center">
                <Text className="text-sm text-muted text-center">
                  Powered by Base • Secured by Bitcoin
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
