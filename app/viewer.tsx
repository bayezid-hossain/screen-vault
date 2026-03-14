import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  getScreenshotsByIds,
  markAsDeleted,
  toggleFavorite,
  type ScreenshotRow,
} from "@/lib/database";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useAppStore } from "@/lib/store";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  Heart,
  Share,
  Trash2,
  Crop,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  Share as RNShare,
  StatusBar,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function GalleryViewer() {
  const { ids, index } = useLocalSearchParams<{ ids: string; index: string }>();
  const router = useRouter();
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [activeIndex, setActiveIndex] = useState(parseInt(index ?? "0", 10));
  const [showUI, setShowUI] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const listRef = useRef<FlatList>(null);
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  useEffect(() => {
    const idList = ids?.split(",").map(Number).filter(Boolean) ?? [];
    if (idList.length === 0) return;

    getScreenshotsByIds(idList).then((data) => {
      setScreenshots(data);
    });
  }, [ids]);

  useEffect(() => {
    if (screenshots.length > 0 && activeIndex >= 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: activeIndex,
          animated: false,
        });
      }, 100);
    }
  }, [screenshots.length]);

  const toggleUI = useCallback(() => {
    setShowUI((prev) => !prev);
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const currentScreenshot = screenshots[activeIndex];

  const handleFavorite = useCallback(async () => {
    if (!currentScreenshot) return;
    await toggleFavorite(currentScreenshot.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newFavStatus = currentScreenshot.isFavorite ? 0 : 1;
    setScreenshots((prev) =>
      prev.map((s) =>
        s.id === currentScreenshot.id ? ({ ...s, isFavorite: newFavStatus } as ScreenshotRow) : s
      )
    );
  }, [currentScreenshot]);

  const handleDelete = useCallback(async () => {
    if (currentScreenshot) {
      setConfirmDelete(true);
    }
  }, [currentScreenshot]);

  const confirmDeleteAction = useCallback(async () => {
    if (!currentScreenshot) return;
    await markAsDeleted(currentScreenshot.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    const newScreenshots = screenshots.filter((s) => s.id !== currentScreenshot.id);
    if (newScreenshots.length === 0) {
      router.back();
      return;
    }

    setScreenshots(newScreenshots);
    if (activeIndex >= newScreenshots.length) {
      setActiveIndex(newScreenshots.length - 1);
    }
    setConfirmDelete(false);
  }, [currentScreenshot, screenshots, activeIndex, router]);

  const handleShare = useCallback(async () => {
    if (!currentScreenshot) return;
    try {
      await RNShare.share({
        url: currentScreenshot.editedUri ?? currentScreenshot.uri,
      });
    } catch (error) {
      console.error("[Viewer] Share error:", error);
    }
  }, [currentScreenshot]);

  const handleEdit = useCallback(() => {
    if (!currentScreenshot) return;
    router.push({
      pathname: "/editor",
      params: { id: currentScreenshot.id, uri: currentScreenshot.uri },
    });
  }, [currentScreenshot, router]);

  const renderItem = useCallback(
    ({ item }: { item: ScreenshotRow }) => {
      return (
        <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}>
          <ZoomableImage
            uri={item.editedUri ?? item.uri}
            onTap={toggleUI}
            onZoomChange={setIsZoomed}
          />
        </View>
      );
    },
    [toggleUI]
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  if (screenshots.length === 0) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text className="text-white/40">Loading gallery...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar hidden={!showUI} />
      
      <FlatList
        ref={listRef}
        data={screenshots}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        scrollEnabled={!isZoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={activeIndex}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        keyExtractor={(item) => item.id.toString()}
        getItemLayout={(_, idx) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * idx,
          index: idx,
        })}
      />

      {/* Header */}
      {showUI && (
        <Animated.View
          className="absolute top-0 left-0 right-0 z-10"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          <SafeAreaView edges={["top"]} className="bg-black/40">
            <View className="px-4 py-2 flex-row items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onPress={handleBack}
                className="h-10 w-10 rounded-full"
              >
                <Icon as={ArrowLeft} className="text-white" size={22} strokeWidth={2} />
              </Button>
              <Text className="text-white/60 text-sm font-medium">
                {activeIndex + 1} / {screenshots.length}
              </Text>
              <View style={{ width: 40 }} />
            </View>
          </SafeAreaView>
        </Animated.View>
      )}

      {/* Footer Actions */}
      {showUI && currentScreenshot && (
        <Animated.View
          className="absolute bottom-0 left-0 right-0 z-10"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          <SafeAreaView edges={["bottom"]} className="bg-black/40">
            <View className="flex-row items-center justify-around px-4 py-2">
              <ActionItem
                icon={Heart}
                label="Favorite"
                onPress={handleFavorite}
                color={currentScreenshot.isFavorite ? "#ffd43b" : "#fff"}
                fill={currentScreenshot.isFavorite ? "#ffd43b" : "none"}
              />
              <ActionItem
                icon={Crop}
                label="Edit"
                onPress={handleEdit}
                color="#fff"
              />
              <ActionItem
                icon={Share}
                label="Share"
                onPress={handleShare}
                color="#fff"
              />
              <ActionItem
                icon={Trash2}
                label="Trash"
                onPress={handleDelete}
                color="#ff6b6b"
              />
            </View>
          </SafeAreaView>
        </Animated.View>
      )}

      <ConfirmationModal
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={confirmDeleteAction}
        title="Move to Trash"
        message="Are you sure you want to move this screenshot to the trash?"
        confirmLabel="Move to Trash"
      />
    </View>
  );
}

function ActionItem({
  icon,
  label,
  onPress,
  color,
  fill,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  color: string;
  fill?: string;
}) {
  return (
    <Pressable onPress={onPress} className="items-center gap-1 p-2">
      <Icon as={icon} size={22} color={color} fill={fill} strokeWidth={2} />
      <Text className="text-white text-[10px] uppercase font-bold tracking-wider">
        {label}
      </Text>
    </Pressable>
  );
}

// ══════════════════════════════════════════════════
// ── Zoomable Image with Pinch, Pan & Double-Tap ──
// ══════════════════════════════════════════════════

function ZoomableImage({
  uri,
  onTap,
  onZoomChange,
}: {
  uri: string;
  onTap: () => void;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  const notifyZoom = useCallback(
    (zoomed: boolean) => {
      onZoomChange?.(zoomed);
    },
    [onZoomChange]
  );

  const clampTranslation = (tx: number, ty: number, s: number) => {
    "worklet";
    const maxX = ((s - 1) * SCREEN_WIDTH) / 2;
    const maxY = ((s - 1) * SCREEN_HEIGHT) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty)),
    };
  };

  // ── Pinch to zoom ──
  const pinchGesture = Gesture.Pinch()
    .onStart((event) => {
      originX.value = event.focalX - SCREEN_WIDTH / 2;
      originY.value = event.focalY - SCREEN_HEIGHT / 2;
    })
    .onUpdate((event) => {
      const newScale = Math.min(5, Math.max(0.5, savedScale.value * event.scale));
      scale.value = newScale;
      const scaleDiff = newScale / savedScale.value;
      translateX.value = savedTranslateX.value + originX.value * (1 - scaleDiff);
      translateY.value = savedTranslateY.value + originY.value * (1 - scaleDiff);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyZoom)(false);
      } else if (scale.value > 5) {
        scale.value = withSpring(5);
        savedScale.value = 5;
        const clamped = clampTranslation(translateX.value, translateY.value, 5);
        translateX.value = withSpring(clamped.x);
        translateY.value = withSpring(clamped.y);
        savedTranslateX.value = clamped.x;
        savedTranslateY.value = clamped.y;
        runOnJS(notifyZoom)(true);
      } else {
        savedScale.value = scale.value;
        const clamped = clampTranslation(translateX.value, translateY.value, scale.value);
        translateX.value = withSpring(clamped.x);
        translateY.value = withSpring(clamped.y);
        savedTranslateX.value = clamped.x;
        savedTranslateY.value = clamped.y;
        runOnJS(notifyZoom)(scale.value > 1.05);
      }
    });

  // ── Pan to move when zoomed ──
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .manualActivation(true)
    .onTouchesMove((_event, stateManager) => {
      // Only activate pan when zoomed in — otherwise let FlatList handle swipe
      if (savedScale.value > 1) {
        stateManager.activate();
      } else {
        stateManager.fail();
      }
    })
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      const clamped = clampTranslation(translateX.value, translateY.value, scale.value);
      translateX.value = withSpring(clamped.x);
      translateY.value = withSpring(clamped.y);
      savedTranslateX.value = clamped.x;
      savedTranslateY.value = clamped.y;
    });

  // ── Single tap to toggle UI ──
  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(onTap)();
    });

  // ── Double tap to zoom in/out ──
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((event) => {
      if (scale.value > 1.05) {
        // Zoom out to 1x
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyZoom)(false);
      } else {
        // Zoom in to 2.5x at tap point
        const targetScale = 2.5;
        const tapOffsetX = event.x - SCREEN_WIDTH / 2;
        const tapOffsetY = event.y - SCREEN_HEIGHT / 2;
        const tx = tapOffsetX * (1 - targetScale);
        const ty = tapOffsetY * (1 - targetScale);
        const clamped = clampTranslation(tx, ty, targetScale);
        scale.value = withSpring(targetScale);
        translateX.value = withSpring(clamped.x);
        translateY.value = withSpring(clamped.y);
        savedScale.value = targetScale;
        savedTranslateX.value = clamped.x;
        savedTranslateY.value = clamped.y;
        runOnJS(notifyZoom)(true);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Gesture composition:
  // - Double-tap takes priority (detected first)
  // - Pinch and pan run simultaneously
  // - Single-tap is fallback
  const gesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
    tapGesture,
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1 }, animatedStyle]}>
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          priority="high"
        />
      </Animated.View>
    </GestureDetector>
  );
}
