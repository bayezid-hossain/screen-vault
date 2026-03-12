import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Inbox, FolderOpen, BarChart3 } from "lucide-react-native";
import { useAppStore } from "@/lib/store";

export default function TabLayout() {
  const unprocessedCount = useAppStore((s) => s.unprocessedCount);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#141517",
          borderTopColor: "#1a1b1e",
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
          elevation: 0,
        },
        tabBarActiveTintColor: "#5c7cfa",
        tabBarInactiveTintColor: "#868e96",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Inbox size={size} color={color} strokeWidth={2} />
              {unprocessedCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    backgroundColor: "#ff6b6b",
                    borderRadius: 10,
                    minWidth: 18,
                    height: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                    {unprocessedCount > 99 ? "99+" : unprocessedCount}
                  </Text>
                </View>
              ) : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="folders"
        options={{
          title: "Folders",
          tabBarIcon: ({ color, size }) => (
            <FolderOpen size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => (
            <BarChart3 size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
