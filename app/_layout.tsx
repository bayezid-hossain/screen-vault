import { getDatabase } from "@/lib/database";
import { loadPersistedSettings, scheduleDailyNudge, syncScreenshots } from "@/lib/screenshot-monitor";
import { useAppStore } from "@/lib/store";
import * as MediaLibrary from "expo-media-library";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { AppState, AppStateStatus, Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
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
      await syncScreenshots();
      await scheduleDailyNudge();
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
    return () => sub.remove();
  }, []);

  // ─── Permission Denied Screen ───
  if (permState === "denied") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={theme === "light" ? "dark" : "light"} />
        <View className="flex-1 bg-white dark:bg-surface-950 items-center justify-center p-8">
          <Text className="text-5xl mb-4">🔒</Text>
          <Text className="text-black dark:text-white text-2xl font-bold text-center mb-2">Permission Required</Text>
          <Text className="text-surface-500 dark:text-surface-300 text-center leading-6 mb-8">
            ScreenVault needs access to your photos to find screenshots.{"\n\n"}
            Please go to Settings and set {'"'}Photos and videos{'"'} to {'"'}Allow all{'"'}.
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
          <Text className="text-surface-500 dark:text-surface-300 text-center leading-6 mb-8">
            You selected "Allow selected photos" but ScreenVault needs access to ALL photos to automatically find screenshots.{"\n\n"}
            Please go to Settings → Apps → ScreenVault → Permissions → Photos and videos → select "Allow all".
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
          <Text className="text-surface-500 dark:text-surface-300 text-lg">Initializing...</Text>
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
          contentStyle: { backgroundColor: theme === "light" ? "#f8f9fa" : "#101113" },
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

