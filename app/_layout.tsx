import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { getDatabase } from "@/lib/database";
import { loadPersistedSettings, refreshUnprocessedCount, scheduleDailyNudge, syncScreenshots } from "@/lib/screenshot-monitor";
import { useAppStore } from "@/lib/store";
import * as MediaLibrary from "expo-media-library";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { AppState, AppStateStatus, Linking, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";

SplashScreen.preventAutoHideAsync();

type PermState = "loading" | "denied" | "limited" | "granted";

export default function RootLayout() {
  const [permState, setPermState] = useState<PermState>("loading");
  const { setColorScheme } = useColorScheme();
  const theme = useAppStore((s) => s.theme);

  // Sync theme
  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);

  async function checkAndSync() {
    const perm = await MediaLibrary.getPermissionsAsync();
    //console.log("[RootLayout] Permission check:", perm.status, "access:", perm.accessPrivileges);

    if (perm.status === "denied" || perm.status === "undetermined") {
      // Try requesting
      const req = await MediaLibrary.requestPermissionsAsync();
      //console.log("[RootLayout] Permission request result:", req.status, "access:", req.accessPrivileges);

      if (req.status === "denied") {
        setPermState("denied");
        return;
      }
      if (req.accessPrivileges === "limited") {
        setPermState("limited");
        // Still try to sync with what we have
        await syncScreenshots();
        return;
      }
      if (req.granted) {
        setPermState("granted");
        await syncScreenshots();
        await scheduleDailyNudge();
        return;
      }
    }

    if (perm.accessPrivileges === "limited") {
      setPermState("limited");
      // Still try to sync with limited access
      await syncScreenshots();
      return;
    }

    if (perm.granted) {
      setPermState("granted");
      // Don't await sync here during initial boot to avoid long splash screen hang
      syncScreenshots();
      scheduleDailyNudge();
    }
  }

  useEffect(() => {
    async function init() {
      try {
        await getDatabase();
        //console.log("[RootLayout] Database ready");
        await loadPersistedSettings();
        await checkAndSync();
      } catch (error) {
        console.error("[RootLayout] Init error:", error);
      } finally {
        SplashScreen.hideAsync();
      }
    }
    init();

    // Re-check on foreground return (e.g. after changing permissions in Settings)
    const sub = AppState.addEventListener("change", async (state: AppStateStatus) => {
      if (state === "active") {
        await checkAndSync();
      }
    });

    // Listen for media library changes (new screenshots)
    const mediaLibSub = MediaLibrary.addListener(async (event) => {
      if (event.hasIncrementalChanges !== false) {
        const imported = await syncScreenshots();
        if (imported > 0) {
          try {
            const Notifications = require("expo-notifications");
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "📸 New Screenshot Detected",
                body: `${imported} new screenshot${imported > 1 ? "s" : ""} found and imported!`,
                data: { type: "NEW_SCREENSHOT" },
              },
              trigger: null, // Fire immediately
            });
          } catch { }
          await refreshUnprocessedCount();
        }
      }
    });

    return () => {
      sub.remove();
      mediaLibSub.remove();
    };
  }, []);

  // ─── Permission Denied Screen ───
  if (permState === "denied") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={theme === "light" ? "dark" : "light"} />
        <View className="flex-1 bg-white dark:bg-surface-950 items-center justify-center p-8">
          <Text className="text-5xl mb-4">🔒</Text>
          <Text className="text-black dark:text-white text-2xl font-bold text-center mb-2">Permission Required</Text>
          <Text className="text-surface-500 dark:text-white text-center leading-6 mb-8">
            ScreenVault needs access to your photos to find screenshots.{"\n\n"}
            Please go to Settings and set {'"'}Photos{'"'} to {'"'}Allow all{'"'}.
          </Text>
          <Button
            onPress={() => Linking.openSettings()}
            size="lg"
            className="w-full rounded-2xl py-4 h-auto"
          >
            <Text className="text-white font-bold text-lg">Open Settings</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={async () => {
              const r = await MediaLibrary.requestPermissionsAsync();
              if (r.granted) { setPermState(r.accessPrivileges === "limited" ? "limited" : "granted"); syncScreenshots(); }
            }}
            className="mt-5 py-3 h-auto"
          >
            <Text className="text-primary-600 dark:text-primary-400 font-semibold text-base">Try Again</Text>
          </Button>
        </View>
      </GestureHandlerRootView>
    );
  }

  // ─── Limited Access Screen ───
  if (permState === "limited") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={theme === "light" ? "dark" : "light"} />
        <View className="flex-1 bg-white dark:bg-surface-950 items-center justify-center p-8">
          <Text className="text-5xl mb-4">📸</Text>
          <Text className="text-black dark:text-white text-2xl font-bold text-center mb-2">Limited Photo Access</Text>
          <Text className="text-surface-500 dark:text-white text-center leading-6 mb-8">
            You selected "Allow selected photos" but ScreenVault needs access to ALL photos to automatically find screenshots.{"\n\n"}
            Please go to Settings → Apps → ScreenVault → Permissions → Photos → select "Allow all".
          </Text>
          <Button
            onPress={() => Linking.openSettings()}
            size="lg"
            className="w-full rounded-2xl py-4 h-auto"
          >
            <Text className="text-white font-bold text-lg">Open Settings → Allow All</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => setPermState("granted")}
            className="mt-5 py-3 h-auto"
          >
            <Text className="text-primary-600 dark:text-primary-400 font-semibold text-base">Continue with Limited Access</Text>
          </Button>
        </View>
      </GestureHandlerRootView>
    );
  }

  // ─── Loading ───
  if (permState === "loading") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={theme === "light" ? "dark" : "light"} />
        <View className="flex-1 bg-white dark:bg-surface-950 items-center justify-center p-8">
          <Text className="text-5xl mb-4">⏳</Text>
          <Text className="text-surface-500 dark:text-white text-lg">Initializing...</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  // ─── Main App ───
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={theme === "light" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme === "light" ? "#f8f9fa" : "#121214" },
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
        <Stack.Screen
          name="viewer"
          options={{
            headerShown: false,
            presentation: "modal",
            animation: "fade",
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

