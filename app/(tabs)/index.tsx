import {
  assignToFolder,
  getFolders,
  getUnprocessedScreenshots,
  markAsDeleted,
  restoreScreenshot,
  toggleFavorite,
  type FolderRow,
  type ScreenshotRow,
} from "@/lib/database";
import { refreshUnprocessedCount, syncScreenshots } from "@/lib/screenshot-monitor";
import { useAppStore } from "@/lib/store";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import {
  FolderInput,
  Heart,
  RefreshCcw,
  Sparkles,
  Trash2
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Pressable,
  Text,
  View
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 48;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

export default function InboxScreen() {
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<ScreenshotRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isImporting = useAppStore((s) => s.isImporting);
  const lastSyncTimestamp = useAppStore((s) => s.lastSyncTimestamp);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [shots, flds] = await Promise.all([
        getUnprocessedScreenshots(),
        getFolders(),
      ]);
      console.log("[Inbox] Loaded", shots.length, "unprocessed screenshots");
      setScreenshots(shots);
      setFolders(flds);
      setCurrentIndex(0);
      await refreshUnprocessedCount();
    } catch (err) {
      console.error("[Inbox] Load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount AND whenever a sync completes
  useEffect(() => {
    loadData();
  }, [loadData, lastSyncTimestamp]);

  const currentScreenshot = screenshots[currentIndex];

  const handleAssignToFolder = useCallback(
    async (folderId: number) => {
      if (!currentScreenshot) return;
      await assignToFolder(currentScreenshot.id, folderId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowFolderPicker(false);
      const remaining = screenshots.filter((s) => s.id !== currentScreenshot.id);
      setScreenshots(remaining);
      setCurrentIndex(0);
      await refreshUnprocessedCount();
    },
    [currentScreenshot, screenshots]
  );

  const handleDelete = useCallback(async () => {
    if (!currentScreenshot) return;
    await markAsDeleted(currentScreenshot.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setLastDeleted(currentScreenshot);
    const remaining = screenshots.filter((s) => s.id !== currentScreenshot.id);
    setScreenshots(remaining);
    setCurrentIndex(0);
    useAppStore.getState().incrementDeleted();
    await refreshUnprocessedCount();
  }, [currentScreenshot, screenshots]);

  const handleFavorite = useCallback(async () => {
    if (!currentScreenshot) return;
    await toggleFavorite(currentScreenshot.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Move to next without removing (it's still unprocessed, but favorited)
    if (currentIndex < screenshots.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (screenshots.length > 1) {
      setCurrentIndex(0);
    }
  }, [currentScreenshot, currentIndex, screenshots.length]);

  const handleUndo = useCallback(async () => {
    if (!lastDeleted) return;
    await restoreScreenshot(lastDeleted.id);
    setScreenshots((prev) => [lastDeleted, ...prev]);
    setCurrentIndex(0);
    setLastDeleted(null);
    await refreshUnprocessedCount();
  }, [lastDeleted]);

  const handleSync = useCallback(async () => {
    await syncScreenshots();
    await loadData();
  }, [loadData]);

  // Loading state
  if (isLoading && screenshots.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-950">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-surface-300 text-lg">
            {isImporting ? "Scanning for screenshots..." : "Loading..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (screenshots.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-950">
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-3xl bg-primary-900/30 items-center justify-center mb-6">
            <Sparkles size={40} color="#5c7cfa" strokeWidth={1.5} />
          </View>
          <Text className="text-white text-2xl font-bold text-center mb-2">
            Inbox Zero! 🎉
          </Text>
          <Text className="text-surface-300 text-base text-center mb-8">
            All screenshots have been organized.{"\n"}Take a screenshot to get started.
          </Text>
          <Pressable
            onPress={handleSync}
            className="bg-primary-700 px-6 py-3 rounded-2xl flex-row items-center gap-2"
          >
            <RefreshCcw size={18} color="#fff" strokeWidth={2} />
            <Text className="text-white font-semibold">
              {isImporting ? "Scanning..." : "Scan for Screenshots"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-950">
      {/* Header */}
      <View className="px-6 pt-2 pb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-white text-2xl font-bold">Inbox</Text>
          <Text className="text-surface-300 text-sm mt-1">
            {screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""} to organize
          </Text>
        </View>
        <Pressable onPress={handleSync} className="p-2">
          <RefreshCcw size={20} color="#868e96" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Card Area */}
      <View className="flex-1 items-center justify-center px-6">
        {currentScreenshot ? (
          <SwipeCard
            key={currentScreenshot.id}
            screenshot={currentScreenshot}
            onSwipeLeft={handleDelete}
            onSwipeRight={() => setShowFolderPicker(true)}
            onSwipeUp={handleFavorite}
          />
        ) : null}

        {/* Action hints */}
        <View className="flex-row items-center justify-center gap-8 mt-6">
          <View className="items-center">
            <View className="w-12 h-12 rounded-full bg-accent-red/15 items-center justify-center">
              <Trash2 size={20} color="#ff6b6b" strokeWidth={2} />
            </View>
            <Text className="text-surface-300 text-xs mt-2">Delete</Text>
          </View>
          <View className="items-center">
            <View className="w-12 h-12 rounded-full bg-accent-amber/15 items-center justify-center">
              <Heart size={20} color="#ffd43b" strokeWidth={2} />
            </View>
            <Text className="text-surface-300 text-xs mt-2">Favorite</Text>
          </View>
          <View className="items-center">
            <View className="w-12 h-12 rounded-full bg-accent-green/15 items-center justify-center">
              <FolderInput size={20} color="#51cf66" strokeWidth={2} />
            </View>
            <Text className="text-surface-300 text-xs mt-2">Organize</Text>
          </View>
        </View>
      </View>

      {/* Undo Toast */}
      {lastDeleted ? (
        <Pressable
          onPress={handleUndo}
          className="absolute bottom-24 left-6 right-6 bg-surface-700 rounded-2xl px-4 py-3 flex-row items-center justify-between"
        >
          <Text className="text-white text-sm">Screenshot deleted</Text>
          <Text className="text-primary-400 font-semibold text-sm">UNDO</Text>
        </Pressable>
      ) : null}

      {/* Folder Picker Modal */}
      {showFolderPicker ? (
        <Pressable
          onPress={() => setShowFolderPicker(false)}
          className="absolute inset-0 bg-black/60 justify-end"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-surface-800 rounded-t-3xl px-6 pt-6 pb-10"
          >
            <Text className="text-white text-xl font-bold mb-4">
              Assign to Folder
            </Text>
            {folders.length === 0 ? (
              <Text className="text-surface-300 text-center py-8">
                No folders yet. Create one in the Folders tab first.
              </Text>
            ) : (
              folders.map((folder) => (
                <Pressable
                  key={folder.id}
                  onPress={() => handleAssignToFolder(folder.id)}
                  className="flex-row items-center gap-3 py-3 px-4 rounded-xl active:bg-surface-700"
                >
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: folder.color + "25" }}
                  >
                    <FolderInput size={20} color={folder.color} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-semibold">{folder.name}</Text>
                    <Text className="text-surface-300 text-xs">
                      {folder.screenshotCount} screenshots
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

// ── Swipe Card Component ──

function SwipeCard({
  screenshot,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
}: {
  screenshot: ScreenshotRow;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = Math.min(0, event.translationY); // Only allow swipe up
    })
    .onEnd((event) => {
      // Swipe left → delete
      if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH * 1.5, { duration: 300 });
        scale.value = withTiming(0.8, { duration: 300 });
        runOnJS(onSwipeLeft)();
        return;
      }
      // Swipe right → assign to folder
      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH * 1.5, { duration: 300 });
        scale.value = withTiming(0.8, { duration: 300 });
        runOnJS(onSwipeRight)();
        return;
      }
      // Swipe up → favorite
      if (event.translationY < -SWIPE_THRESHOLD) {
        translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 300 });
        scale.value = withTiming(0.8, { duration: 300 });
        runOnJS(onSwipeUp)();
        return;
      }
      // Spring back
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      [-15, 0, 15],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
        { scale: scale.value },
      ],
    };
  });

  const leftIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -50, 0],
      [1, 0.3, 0],
      Extrapolation.CLAMP
    ),
  }));

  const rightIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, 50, SWIPE_THRESHOLD],
      [0, 0.3, 1],
      Extrapolation.CLAMP
    ),
  }));

  const upIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [-SWIPE_THRESHOLD, -50, 0],
      [1, 0.3, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          {
            width: CARD_WIDTH,
            height: CARD_WIDTH * 1.6,
            maxHeight: SCREEN_HEIGHT * 0.55,
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: "#1a1b1e",
          },
          animatedStyle,
        ]}
      >
        <Image
          source={{ uri: screenshot.editedUri ?? screenshot.uri }}
          style={{ width: "100%", height: "100%", borderRadius: 24 }}
          contentFit="cover"
          transition={200}
        />

        {/* Delete indicator (left swipe) */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 16,
              right: 16,
              backgroundColor: "#ff6b6b",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
            },
            leftIndicatorStyle,
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
            DELETE
          </Text>
        </Animated.View>

        {/* Organize indicator (right swipe) */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 16,
              left: 16,
              backgroundColor: "#51cf66",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
            },
            rightIndicatorStyle,
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
            ORGANIZE
          </Text>
        </Animated.View>

        {/* Favorite indicator (up swipe) */}
        <Animated.View
          style={[
            {
              position: "absolute",
              bottom: 16,
              alignSelf: "center",
              backgroundColor: "#ffd43b",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
            },
            upIndicatorStyle,
          ]}
        >
          <Text style={{ color: "#000", fontWeight: "700", fontSize: 14 }}>
            ★ FAVORITE
          </Text>
        </Animated.View>

        {/* Bottom info */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingBottom: 16,
            paddingTop: 40,
          }}
        >
          <Text
            style={{ color: "#fff", fontSize: 12, opacity: 0.8 }}
            numberOfLines={1}
          >
            {screenshot.filename}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
