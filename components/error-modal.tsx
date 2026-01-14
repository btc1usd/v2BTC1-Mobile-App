import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import * as Haptics from "expo-haptics";

interface ErrorModalProps {
  visible: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export function ErrorModal({ visible, title, message, onClose }: ErrorModalProps) {
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
      statusBarTranslucent
    >
      <View className="flex-1 bg-black/85 items-center justify-center px-6">
        <View 
          className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-sm"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 24,
          }}
        >
          {/* Icon */}
          <View className="items-center mb-6">
            <View className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center">
              <Text className="text-5xl">⚠️</Text>
            </View>
          </View>

          {/* Message Only - Clean and Simple */}
          <Text className="text-xl font-semibold text-gray-900 dark:text-white text-center leading-8 mb-8">
            {message}
          </Text>

          {/* Close Button */}
          <TouchableOpacity
            onPress={handleClose}
            className="bg-red-500 py-4 rounded-2xl items-center active:bg-red-600"
            style={{
              shadowColor: '#ef4444',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Text className="text-white text-lg font-semibold">Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
