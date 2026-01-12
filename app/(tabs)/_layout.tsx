import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { BlurView } from "expo-blur";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const bottomPadding = Platform.OS === "web" ? 14 : Math.max(insets.bottom, 12);
  const TAB_HEIGHT = 62 + bottomPadding;

  const TabBarBackground = () =>
    Platform.OS === "ios" ? (
      <BlurView
        intensity={80}
        tint="default"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 24,
        }}
      />
    ) : (
      <View
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: colors.background,
          borderRadius: 24,
        }}
      />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: bottomPadding - 6,
          height: TAB_HEIGHT,
          borderRadius: 24,
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          backgroundColor: "transparent",
        },
        tabBarBackground: () => <TabBarBackground />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              name="house.fill"
              size={focused ? 30 : 26}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="mint"
        options={{
          title: "Mint",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              name="paperplane.fill"
              size={focused ? 30 : 26}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="redeem"
        options={{
          title: "Redeem",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              name="chevron.right"
              size={focused ? 30 : 26}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="rewards"
        options={{
          title: "Rewards",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              name="chevron.left.forwardslash.chevron.right"
              size={focused ? 30 : 26}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
