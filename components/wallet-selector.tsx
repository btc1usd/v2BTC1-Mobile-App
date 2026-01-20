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
  inAppWallet({
    auth: {
      options: ["google", "apple", "facebook", "email"],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("com.trustwallet.app"),
  createWallet("me.rainbow"),
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
              What is a Wallet?
            </Text>
            <Text className="text-xs text-muted leading-5">
              A wallet lets you connect to BTC1USD and manage your funds. 
              We recommend MetaMask or Rainbow for the best experience.
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
