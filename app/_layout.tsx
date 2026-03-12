import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { getDatabase } from "@/lib/database";
import { syncScreenshots, requestMediaPermission, scheduleDailyNudge } from "@/lib/screenshot-monitor";
import { AppState, AppStateStatus } from "react-native";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    async function init() {
      try {
        // Initialize database
        await getDatabase();
        // Request permissions
        await requestMediaPermission();
        // Initial sync
        await syncScreenshots();
        // Schedule daily nudge
        await scheduleDailyNudge();
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        SplashScreen.hideAsync();
      }
    }
    init();

    // Re-sync when app returns to foreground
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        syncScreenshots();
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#101113" },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="folder/[id]"
          options={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="editor"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
