'use client';

/**
 * Bridge Screen - Swap & Buy Tabs with Thirdweb Widgets
 * 
 * Features:
 * - Swap tab: Cross-chain swaps using SwapWidget
 * - Buy tab: Buy crypto with card/crypto using BuyWidget
 * - Uses Thirdweb's hosted widgets (handles all logic)
 */

import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ThemedView } from "@/components/themed-view";
import { useColors } from "@/hooks/use-colors";
import { WalletHeader } from "@/components/wallet-header";
import { useWeb3 } from "@/lib/web3-walletconnect-v2";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import SwapModalMobile from "@/components/SwapModalMobile";
import BuyModalMobile from "@/components/BuyModalMobile";

const WEB_APP_URL = 'https://develop--v2btc1.netlify.app';

type TabType = 'swap' | 'buy';

export default function BridgeScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const { address, chainId, isConnected } = useWeb3();
  const [activeTab, setActiveTab] = useState<TabType>('swap');
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [buyModalVisible, setBuyModalVisible] = useState(false);

  const handleOpenSwap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSwapModalVisible(true);
  };

  const handleOpenBuy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBuyModalVisible(true);
  };

  const handleTabChange = (tab: TabType) => {
    if (tab !== activeTab) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tab);
    }
  };

  // Early return if wallet not connected
  if (!isConnected || !address) {
    const isDarkMode = colorScheme === 'dark';
    const textColor = isDarkMode ? '#FFFFFF' : '#1F2937';
    const subTextColor = isDarkMode ? '#9CA3AF' : '#6B7280';
    
    return (
      <ScreenContainer>
        <WalletHeader address={address} chainId={chainId} />
        <ThemedView style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={[styles.errorText, { color: textColor }]}>
              Wallet Not Connected
            </Text>
            <Text style={[styles.errorSubtext, { color: subTextColor, marginTop: 8 }]}>
              Please connect your wallet to use Bridge
            </Text>
          </View>
        </ThemedView>
      </ScreenContainer>
    );
  }

  const isDarkMode = colorScheme === 'dark';
  const tabBg = isDarkMode ? '#1F2937' : '#F3F4F6';
  const activeTabBg = colors.primary;
  const inactiveTextColor = isDarkMode ? '#9CA3AF' : '#6B7280';

  return (
    <ScreenContainer>
      <WalletHeader address={address} chainId={chainId} />
      <ThemedView style={styles.container}>
        {/* Tab Switcher */}
        <View style={[styles.tabContainer, { backgroundColor: tabBg }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'swap' && { backgroundColor: activeTabBg }
            ]}
            onPress={() => handleTabChange('swap')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'swap' ? '#FFFFFF' : inactiveTextColor }
            ]}>
              ↔️ Swap
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'buy' && { backgroundColor: activeTabBg }
            ]}
            onPress={() => handleTabChange('buy')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'buy' ? '#FFFFFF' : inactiveTextColor }
            ]}>
              + Buy
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'swap' && (
          <View style={styles.contentContainer}>
            <TouchableOpacity
              onPress={handleOpenSwap}
              style={styles.openButton}
            >
              <Text style={styles.openButtonText}>🔄 Open Swap Widget</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {activeTab === 'buy' && (
          <View style={styles.contentContainer}>
            <TouchableOpacity
              onPress={handleOpenBuy}
              style={[styles.openButton, { backgroundColor: '#10b981' }]}
            >
              <Text style={styles.openButtonText}>💳 Open Buy Widget</Text>
            </TouchableOpacity>
          </View>
        )}
      </ThemedView>

      <SwapModalMobile
        visible={swapModalVisible}
        onClose={() => setSwapModalVisible(false)}
        webAppUrl={WEB_APP_URL}
      />

      <BuyModalMobile
        visible={buyModalVisible}
        onClose={() => setBuyModalVisible(false)}
        webAppUrl={WEB_APP_URL}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 4,
    margin: 16,
    borderRadius: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  openButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
  },
  openButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
