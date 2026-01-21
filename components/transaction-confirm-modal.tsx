import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, Animated, Easing } from "react-native";
import * as Haptics from "expo-haptics";

interface TransactionDetail {
  label: string;
  value: string;
  isHighlight?: boolean;
}

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
  network?: string;
  gasEstimate?: string;
  transactionDetails?: TransactionDetail[];
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
  network = "Base Sepolia",
  gasEstimate = "~0.001 ETH",
  transactionDetails,
}: TransactionConfirmModalProps) {
  
  // Animation values
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 15,
          stiffness: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

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
      animationType="none"
      onRequestClose={onCancel}
    >
      <Animated.View 
        className="flex-1 bg-black/90 justify-end items-center"
        style={{ opacity: opacityAnim }}
      >
        <Animated.View 
          className="bg-zinc-900 rounded-t-3xl w-full max-w-2xl overflow-hidden border-t border-zinc-800"
          style={{ 
            transform: [{ scale: scaleAnim }],
          }}
        >
          {/* Transaction Details Card */}
          <View className="p-6 bg-zinc-900">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-white">Transaction Details</Text>
              <View className="px-3 py-1 bg-orange-500/20 rounded-lg">
                <Text className="text-sm font-bold text-orange-400 uppercase">{actionText}</Text>
              </View>
            </View>

            {/* Divider */}
            <View className="h-px bg-zinc-800 mb-6" />

            {/* Transaction Details */}
            {isProcessing ? (
              <View className="items-center py-8">
                <View className="w-20 h-20 rounded-full bg-orange-500/10 items-center justify-center mb-4">
                  <ActivityIndicator size="large" color="#F97316" />
                </View>
                <Text className="text-white font-semibold text-lg mb-2">Processing Transaction</Text>
                <Text className="text-zinc-400 text-sm text-center">{processingMessage}</Text>
              </View>
            ) : (
              <View className="space-y-5">
                {/* Amount - Primary Detail */}
                <View className="flex-row justify-between items-center py-1">
                  <Text className="text-base text-zinc-400">Amount</Text>
                  <Text className="text-3xl font-bold text-white">
                    {amount} <Text className="text-orange-400">{token}</Text>
                  </Text>
                </View>

                {/* Divider */}
                <View className="h-px bg-zinc-800" />

                {/* Additional Transaction Details */}
                {transactionDetails && transactionDetails.length > 0 && transactionDetails.map((detail, index) => (
                  <React.Fragment key={index}>
                    <View className="flex-row justify-between items-center py-1">
                      <Text className="text-base text-zinc-400">{detail.label}</Text>
                      <Text className={`text-base font-semibold ${
                        detail.isHighlight ? 'text-orange-400' : 'text-white'
                      }`}>
                        {detail.value}
                      </Text>
                    </View>
                    {index < transactionDetails.length - 1 && (
                      <View className="h-px bg-zinc-800 my-4" />
                    )}
                  </React.Fragment>
                ))}

                {/* Fallback when no transactionDetails */}
                {(!transactionDetails || transactionDetails.length === 0) && (
                  <>
                    <View className="flex-row justify-between items-center py-1">
                      <Text className="text-base text-zinc-400">Network</Text>
                      <Text className="text-base font-semibold text-white">{network}</Text>
                    </View>
                    <View className="h-px bg-zinc-800" />
                    <View className="flex-row justify-between items-center py-1">
                      <Text className="text-base text-zinc-400">Gas Estimate</Text>
                      <Text className="text-base font-semibold text-white">{gasEstimate}</Text>
                    </View>
                    <View className="h-px bg-zinc-800" />
                    <View className="flex-row justify-between items-center py-1">
                      <Text className="text-base text-zinc-400">Action</Text>
                      <Text className="text-base font-semibold text-orange-400">Mint BTC1</Text>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>

          {/* Action Buttons */}
          {!isProcessing && (
            <View className="flex-row gap-3 p-6 pt-4 bg-zinc-900">
              <TouchableOpacity
                onPress={handleCancel}
                className="flex-1 py-4 rounded-2xl bg-zinc-800 border border-zinc-700 items-center active:bg-zinc-700"
                disabled={isProcessing}
              >
                <Text className="text-white font-bold text-lg">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleConfirm}
                className="flex-1 py-4 rounded-2xl bg-orange-500 items-center active:opacity-90"
                disabled={isProcessing}
              >
                <Text className="text-white font-bold text-lg">{actionText}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}