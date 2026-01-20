import React from "react";
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/use-colors";

interface TransactionConfirmModalProps {
  visible: boolean;
  title: string;
  description: string;
  actionText: string;
  amount: string;
  token: string;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
  processingMessage?: string;
}

export function TransactionConfirmModal({
  visible,
  title,
  description,
  actionText,
  amount,
  token,
  onConfirm,
  onCancel,
  isProcessing = false,
  processingMessage = "Processing transaction...",
}: TransactionConfirmModalProps) {
  const colors = useColors();

  const handleConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm();
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-4">
        <View className="bg-surface rounded-3xl border border-border w-full max-w-sm overflow-hidden">
          {/* Header */}
          <View className="border-b border-border p-6">
            <Text className="text-xl font-bold text-foreground text-center">{title}</Text>
            <Text className="text-sm text-muted text-center mt-1">{description}</Text>
          </View>

          {/* Content */}
          <View className="p-6">
            {isProcessing ? (
              <View className="items-center">
                <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4 relative">
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text className="absolute -bottom-1 text-lg">⚡</Text>
                </View>
                <Text className="text-lg font-bold text-foreground mb-2">Processing</Text>
                <Text className="text-sm text-muted text-center mb-4">
                  {processingMessage}
                </Text>
                <Text className="text-xs text-muted/60 text-center">
                  Please check your wallet to sign the request.
                </Text>
              </View>
            ) : (
              <>
                <View className="bg-background rounded-2xl p-4 mb-6">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-sm text-muted">Amount</Text>
                    <Text className="text-sm font-bold text-foreground">
                      {amount} {token}
                    </Text>
                  </View>
                  <View className="h-px bg-border my-2" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm text-muted">Action</Text>
                    <Text className="text-sm font-bold text-primary">{actionText}</Text>
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleCancel}
                    className="flex-1 py-3 rounded-xl bg-muted/30 items-center"
                  >
                    <Text className="text-foreground font-semibold">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirm}
                    className="flex-1 py-3 rounded-xl bg-primary items-center"
                  >
                    <Text className="text-white font-semibold">{actionText}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}