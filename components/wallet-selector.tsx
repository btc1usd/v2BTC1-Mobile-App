import React from "react";
import {
  View,
  Text,
} from "react-native";
import { ConnectButton } from "thirdweb/react";
import { 
  inAppWallet, 
  createWallet 
} from "thirdweb/wallets";
import { client } from "@/lib/thirdweb";
import { defineChain } from "thirdweb";
import { DEFAULT_CHAIN_ID } from "@/lib/network-manager";

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
  createWallet("io.metamask"),           // MetaMask
  createWallet("com.coinbase.wallet"),   // Coinbase Wallet
  createWallet("me.rainbow"),            // Rainbow
  createWallet("com.trustwallet.app"),   // Trust Wallet
  
  // Additional Popular Wallets
  createWallet("io.zerion.wallet"),      // Zerion
  createWallet("app.phantom"),            // Phantom
  createWallet("io.rabby"),               // Rabby
  
  // WalletConnect (catch-all for any wallet)
  createWallet("walletConnect"),
];

interface Props {
  onConnected?: () => void;
}

export function WalletSelector({ onConnected }: Props) {
  const chain = defineChain(DEFAULT_CHAIN_ID);

  return (
    <View className="flex-1">
      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-foreground mb-2">
          Connect Wallet
        </Text>
        <Text className="text-base text-muted">
          Choose your preferred wallet to get started
        </Text>
      </View>

      <View className="items-center justify-center p-4">
        <ConnectButton
          client={client}
          wallets={wallets}
          chain={chain}
          onConnect={onConnected}
          connectButton={{
            label: "Sign in to BTC1",
            style: {
              width: "100%",
              height: 56,
              borderRadius: 28,
            }
          }}
        />
      </View>

      {/* Info Card */}
      <View className="bg-primary/5 rounded-2xl p-5 border border-primary/20 mb-4 mt-8">
        <View className="flex-row items-start">
          <Text className="text-xl mr-3">💡</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground mb-2">
              Multiple Ways to Connect
            </Text>
            <Text className="text-xs text-muted leading-5">
              • Sign in with Google, Apple, or Email{"\n"}
              • Use Passkey for biometric authentication{"\n"}
              • Connect MetaMask, Coinbase, Rainbow, or any mobile wallet{"\n"}
              • Use WalletConnect for 300+ supported wallets
            </Text>
          </View>
        </View>
      </View>

      {/* Security Note */}
      <View className="bg-surface rounded-2xl p-4 border border-border">
        <View className="flex-row items-center justify-center">
          <View className="w-2 h-2 rounded-full bg-success mr-2" />
          <Text className="text-xs text-muted">
            Secured by thirdweb
          </Text>
        </View>
      </View>
    </View>
  );
}
