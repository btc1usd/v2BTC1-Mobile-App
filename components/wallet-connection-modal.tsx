import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal as RNModal, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/use-colors";

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    id: "any",
    name: "Any Wallet",
    icon: "🔗",
    description: "Show all installed wallet apps",
  },
  {
    id: "metamask",
    name: "MetaMask",
    icon: "🦊",
    description: "Opens MetaMask app specifically",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    icon: "🔵",
    description: "Opens Coinbase Wallet app specifically",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    icon: "💎",
    description: "Opens Trust Wallet app specifically",
  },
  {
    id: "rainbow",
    name: "Rainbow",
    icon: "🌈",
    description: "Opens Rainbow app specifically",
  },
];

interface WalletConnectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectWallet: (walletId: string) => void;
  isConnecting?: boolean;
  error?: string | null;
}

export function WalletConnectionModal({
  visible,
  onClose,
  onSelectWallet,
  isConnecting = false,
  error = null,
}: WalletConnectionModalProps) {
  const colors = useColors();
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  const handleSelectWallet = async (walletId: string) => {
    if (isConnecting) return; // Prevent multiple connections
    
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedWalletId(walletId);
    onSelectWallet(walletId);
  };

  const handleClose = async () => {
    if (isConnecting) return; // Prevent closing while connecting
    
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedWalletId(null);
    onClose();
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={handleClose}
        />
        
        <View 
          style={[
            styles.modalContainer, 
            { backgroundColor: colors.background }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              Connect Wallet
            </Text>
            <TouchableOpacity 
              onPress={handleClose} 
              style={styles.closeButton}
              disabled={isConnecting}
            >
              <Text style={[styles.closeText, { color: isConnecting ? colors.border : colors.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {error && (
            <View style={[styles.errorContainer, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
              <Text style={[styles.errorText, { color: '#991B1B' }]}>{error}</Text>
            </View>
          )}

          {/* Wallet Options */}
          <View style={styles.optionsContainer}>
            {WALLET_OPTIONS.map((wallet) => (
              <TouchableOpacity
                key={wallet.id}
                onPress={() => handleSelectWallet(wallet.id)}
                disabled={isConnecting}
                style={[
                  styles.walletOption,
                  { 
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: isConnecting ? 0.6 : 1,
                  }
                ]}
              >
                <View style={styles.walletIconContainer}>
                  <Text style={styles.walletIcon}>{wallet.icon}</Text>
                </View>
                <View style={styles.walletInfo}>
                  <Text style={[styles.walletName, { color: colors.text }]}>
                    {wallet.name}
                  </Text>
                  <Text style={[styles.walletDescription, { color: colors.muted }]}>
                    {wallet.description}
                  </Text>
                </View>
                {isConnecting && selectedWalletId === wallet.id ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={[styles.arrow, { color: colors.muted }]}>›</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {isConnecting ? (
              <Text style={[styles.footerText, { color: colors.text }]}>
                Opening wallet app...
              </Text>
            ) : (
              <Text style={[styles.footerText, { color: colors.muted }]}>
                By connecting, you agree to our Terms of Service
              </Text>
            )}
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 24,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 24,
    fontWeight: "300",
  },
  optionsContainer: {
    gap: 12,
  },
  walletOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  walletIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  walletIcon: {
    fontSize: 32,
  },
  walletInfo: {
    flex: 1,
  },
  walletName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  walletDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  arrow: {
    fontSize: 24,
    marginLeft: 8,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
  footer: {
    marginTop: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
});
