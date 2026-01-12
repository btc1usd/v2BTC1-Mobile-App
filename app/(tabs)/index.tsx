import React, { Component, ErrorInfo, ReactNode, memo } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { BlurView } from "expo-blur";

import { LandingScreen } from "@/components/landing-screen";
import { DashboardScreen } from "@/components/dashboard-screen";
import { useWallet } from "@/hooks/use-wallet-wc";

/* ============================================================================
   Web3 Error Boundary – Polished, Production-grade UI
   ============================================================================ */

type Web3ErrorBoundaryProps = {
  children: ReactNode;
};

type Web3ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class Web3ErrorBoundary extends Component<
  Web3ErrorBoundaryProps,
  Web3ErrorBoundaryState
> {
  state: Web3ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): Web3ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Web3ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      const Container = Platform.OS === "ios" ? BlurView : View;

      return (
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Container
            {...(Platform.OS === "ios"
              ? { intensity: 80, tint: "systemMaterial" }
              : {})}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg"
          >
            <View className="items-center">
              <Text className="text-4xl mb-3">⚠️</Text>

              <Text className="text-xl font-semibold text-foreground mb-2 text-center">
                Wallet Connection Error
              </Text>

              <Text className="text-sm text-muted text-center leading-5">
                {this.state.error?.message ??
                  "We were unable to initialize the Web3 provider."}
              </Text>

              <View className="h-px w-full bg-border my-4" />

              <Text className="text-xs text-muted text-center mb-4">
                Please restart the app or reconnect your wallet.
              </Text>

              <Pressable
                onPress={() => this.setState({ hasError: false, error: null })}
                className="w-full rounded-xl bg-primary py-3"
              >
                <Text className="text-center text-sm font-semibold text-primary-foreground">
                  Retry
                </Text>
              </Pressable>
            </View>
          </Container>
        </View>
      );
    }

    return this.props.children;
  }
}

/* ============================================================================
   Home Screen Content – Clean & Memoized
   ============================================================================ */

const HomeScreenContent = memo(function HomeScreenContent() {
  const { isConnected } = useWallet();

  if (!isConnected) {
    return <LandingScreen />;
  }

  return <DashboardScreen />;
});

/* ============================================================================
   Home Screen Entry
   ============================================================================ */

export default function HomeScreen() {
  return (
    <Web3ErrorBoundary>
      <HomeScreenContent />
    </Web3ErrorBoundary>
  );
}
