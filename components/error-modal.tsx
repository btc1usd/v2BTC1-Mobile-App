import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import * as Haptics from "expo-haptics";

interface ErrorModalProps {
  visible: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export function ErrorModal({ visible, title = "Transaction Failed", message, onClose }: ErrorModalProps) {
  const handleClose = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-surface rounded-3xl p-6 w-full max-w-sm border-2 border-destructive/30">
          {/* Icon */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-destructive/20 items-center justify-center">
              <Text className="text-4xl">⚠️</Text>
            </View>
          </View>

          {/* Title */}
          <Text className="text-xl font-bold text-foreground text-center mb-2">
            {title}
          </Text>

          {/* Message */}
          <Text className="text-sm text-muted text-center leading-6 mb-6">
            {message}
          </Text>

          {/* Close Button */}
          <TouchableOpacity
            onPress={handleClose}
            className="bg-destructive py-4 rounded-xl items-center"
          >
            <Text className="text-white text-base font-bold">OK, Got It</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
