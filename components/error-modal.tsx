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
      <View className="flex-1 bg-black/70 items-center justify-center px-6">
        <View 
          className="bg-surface rounded-3xl p-6 w-full max-w-sm border-2 border-destructive shadow-2xl"
          style={{
            shadowColor: '#ef4444',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.5,
            shadowRadius: 16,
            elevation: 24,
          }}
        >
          {/* Icon */}
          <View className="items-center mb-4">
            <View 
              className="w-20 h-20 rounded-full bg-destructive/30 items-center justify-center"
              style={{
                shadowColor: '#ef4444',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Text className="text-5xl">⚠️</Text>
            </View>
          </View>

          {/* Title */}
          <Text className="text-2xl font-bold text-foreground text-center mb-3">
            {title}
          </Text>

          {/* Message */}
          <Text className="text-base text-muted text-center leading-7 mb-8">
            {message}
          </Text>

          {/* Close Button */}
          <TouchableOpacity
            onPress={handleClose}
            className="bg-destructive py-4 rounded-xl items-center shadow-lg"
            style={{
              shadowColor: '#ef4444',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Text className="text-white text-lg font-bold">OK, Got It</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
