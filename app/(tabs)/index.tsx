import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
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
import {
  fullRescan,
  refreshUnprocessedCount
} from "@/lib/screenshot-monitor";
import { useAppStore } from "@/lib/store";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import {
  FolderInput as FolderIcon,
  Heart,
  RefreshCcw,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  ScrollView,
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
  const dbRevision = useAppStore((s) => s.databaseRevision);
  const selectedAlbumName = useAppStore((s) => s.selectedAlbumName);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [shots, flds] = await Promise.all([
        getUnprocessedScreenshots(),
        getFolders(),
      ]);
      //console.log("[Inbox] Loaded", shots.length, "unprocessed screenshots");
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
  }, [loadData, dbRevision]);

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
    await fullRescan();
    await loadData();
  }, [loadData]);

  // Loading state
  if (isLoading && screenshots.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-surface-500 dark:text-surface-300 text-lg">
            {isImporting ? "Scanning for screenshots..." : "Loading..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (screenshots.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-3xl bg-primary-100 dark:bg-primary-900/30 items-center justify-center mb-6">
            <Icon as={Sparkles} className="text-primary-500" size={40} />
          </View>
          <Text className="text-black dark:text-white text-2xl font-bold text-center mb-2">
            Inbox Zero! 🎉
          </Text>
          <Text className="text-surface-500 dark:text-surface-300 text-base text-center mb-8">
            All screenshots have been organized.{"\n"}
            {selectedAlbumName
              ? `Source: ${selectedAlbumName}`
              : "Take a screenshot to get started."}
          </Text>

          <Button
            onPress={handleSync}
            size="lg"
            className="rounded-2xl flex-row items-center justify-center gap-2 w-full max-w-xs"
          >
            <Icon as={RefreshCcw} className="text-white" size={18} strokeWidth={2} />
            <Text className="text-white font-bold text-base">
              {isImporting ? "Scanning..." : "Scan for Screenshots"}
            </Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
      {/* Header */}
      <View className="px-6 pt-2 pb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-black dark:text-white text-2xl font-bold">Inbox</Text>
          <Text className="text-surface-500 dark:text-surface-300 text-sm mt-1">
            {screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""}{" "}
            to organize
          </Text>
        </View>
        <Button
          variant="ghost"
          size="icon"
          onPress={handleSync}
          className="rounded-full bg-surface-100 dark:bg-surface-800"
        >
          <Icon as={RefreshCcw} className="text-muted-foreground" size={20} strokeWidth={2} />
        </Button>
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

        {/* Action buttons */}
        <View className="flex-row items-center justify-center gap-8 mt-6">
          <Button
            variant="ghost"
            onPress={handleDelete}
            className="items-center flex-col h-auto p-0 active:opacity-60"
          >
            <View className="w-12 h-12 rounded-full bg-accent-red/10 dark:bg-accent-red/15 items-center justify-center">
              <Icon as={Trash2} className="text-destructive" size={20} strokeWidth={2} />
            </View>
            <Text className="text-muted-foreground text-xs mt-2">Delete</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={handleFavorite}
            className="items-center flex-col h-auto p-0 active:opacity-60"
          >
            <View className="w-12 h-12 rounded-full bg-accent-amber/10 dark:bg-accent-amber/15 items-center justify-center">
              <Icon as={Heart} className="text-accent-amber" size={20} strokeWidth={2} />
            </View>
            <Text className="text-muted-foreground text-xs mt-2">Favorite</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => setShowFolderPicker(true)}
            className="items-center flex-col h-auto p-0 active:opacity-60"
          >
            <View className="w-12 h-12 rounded-full bg-accent-green/10 dark:bg-accent-green/15 items-center justify-center">
              <Icon as={FolderIcon} className="text-accent-green" size={20} strokeWidth={2} />
            </View>
            <Text className="text-muted-foreground text-xs mt-2">Organize</Text>
          </Button>
        </View>
      </View>

      {/* Undo Toast */}
      {lastDeleted ? (
        <Button
          variant="outline"
          onPress={handleUndo}
          className="absolute bottom-24 left-6 right-6 bg-surface-100 dark:bg-surface-700 rounded-2xl px-4 py-3 flex-row items-center justify-between border border-surface-200 dark:border-transparent"
        >
          <Text className="text-surface-900 dark:text-white text-sm">Screenshot deleted</Text>
          <Text className="text-primary-700 dark:text-primary-400 font-bold text-sm">UNDO</Text>
        </Button>
      ) : null}

      {/* Folder Picker Modal */}
      <BottomSheetModal open={showFolderPicker} onOpenChange={setShowFolderPicker}>
        <View className="p-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
          <Text className="text-black dark:text-white text-xl font-bold">
            Assign to Folder
          </Text>
        </View>
        <View className="px-6 pb-12">
          {folders.length === 0 ? (
            <Text className="text-surface-500 dark:text-surface-300 text-center py-10 text-base">
              No folders yet. Create one in the Folders tab first.
            </Text>
          ) : (
            <ScrollView className="max-h-[60vh] h-full pt-6 gap-y-4">
              <View className="gap-2 gap-y-4 h-full">
                {folders.map((folder) => (
                  <Button
                    key={folder.id}
                    variant="ghost"
                    onPress={() => handleAssignToFolder(folder.id)}
                    className="flex flex-row items-center justify-center"
                  >
                    <View
                      className="rounded-2xl p-2"
                      style={{ backgroundColor: folder.color + "20" }}
                    >
                      <Icon
                        as={FolderIcon}
                        color={folder.color}
                        size={22}
                        strokeWidth={2}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-black dark:text-white font-bold text-base">
                        {folder.name}
                      </Text>
                      <Text className="text-surface-500 dark:text-white/40 text-sm mt-0.5">
                        {folder.screenshotCount} screenshots
                      </Text>
                    </View>
                  </Button>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </BottomSheetModal>
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
      // Swipe right → open folder picker (card stays in place)
      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        runOnJS(onSwipeRight)();
        return;
      }
      // Swipe up → favorite (card stays, moves to next)
      if (event.translationY < -SWIPE_THRESHOLD) {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
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
        className="bg-surface-900 dark:bg-surface-800"
        style={[
          {
            width: CARD_WIDTH,
            height: CARD_WIDTH * 1.6,
            maxHeight: SCREEN_HEIGHT * 0.55,
            borderRadius: 24,
            overflow: "hidden",
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
          className="bg-black/40"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingBottom: 16,
            paddingTop: 12,
          }}
        >
          <Text
            className="text-white opacity-80 text-xs"
            numberOfLines={1}
          >
            {screenshot.filename}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
