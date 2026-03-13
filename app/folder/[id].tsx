import { useEffect, useState, useCallback } from "react";
import {
  View,
  Dimensions,
  Pressable,
} from "react-native";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Trash2,
  Heart,
  MoreVertical,
  Tags,
  Plus,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  getScreenshotsByFolder,
  getFolders,
  getTags,
  addTagToScreenshot,
  removeTagFromScreenshot,
  getScreenshotTags,
  markAsDeleted,
  toggleFavorite,
  type ScreenshotRow,
  type FolderRow,
  type TagRow,
} from "@/lib/database";
import { ScrollView } from "react-native-gesture-handler";
import { useAppStore } from "@/lib/store";
import { useColorScheme } from "nativewind";

const SCREEN_WIDTH = Dimensions.get("window").width;
const COLUMN_COUNT = 3;
const GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [folder, setFolder] = useState<FolderRow | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [screenshotTags, setScreenshotTags] = useState<Record<number, TagRow[]>>({});

  const { colorScheme } = useColorScheme();
  const theme = useAppStore((s) => s.theme);
  const dbRevision = useAppStore((s) => s.databaseRevision);
  const isDark = theme === "dark";
  const folderId = parseInt(id ?? "0", 10);
  const isSelectMode = selectedIds.size > 0;

  const loadData = useCallback(async () => {
    const [folders, shots, allTags] = await Promise.all([
      getFolders(),
      getScreenshotsByFolder(folderId),
      getTags(),
    ]);
    const f = folders.find((f) => f.id === folderId);
    setFolder(f ?? null);
    setScreenshots(shots);
    setTags(allTags);

    // Load tags for each visible screenshot
    const sTags: Record<number, TagRow[]> = {};
    for (const shot of shots) {
      sTags[shot.id] = await getScreenshotTags(shot.id);
    }
    setScreenshotTags(sTags);
  }, [folderId]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, dbRevision]);

  const handleDeleteSelected = useCallback(async () => {
    for (const sid of selectedIds) {
      await markAsDeleted(sid);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSelectedIds(new Set());
    await loadData();
  }, [selectedIds, loadData]);

  const handleFavoriteSelected = useCallback(async () => {
    for (const sid of selectedIds) {
      await toggleFavorite(sid);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedIds(new Set());
    await loadData();
  }, [selectedIds, loadData]);

  const handleToggleTag = useCallback(async (tagId: number) => {
    for (const sid of selectedIds) {
      const currentTags = screenshotTags[sid] || [];
      const hasTag = currentTags.some(t => t.id === tagId);
      if (hasTag) {
        await removeTagFromScreenshot(sid, tagId);
      } else {
        await addTagToScreenshot(sid, tagId);
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await loadData();
  }, [selectedIds, screenshotTags, loadData]);

  const renderItem = useCallback(
    ({ item }: { item: ScreenshotRow }) => {
      const isSelected = selectedIds.has(item.id);
      return (
        <Pressable
          onPress={() => {
            if (isSelectMode) {
              toggleSelect(item.id);
            }
          }}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            toggleSelect(item.id);
          }}
          style={{
            width: ITEM_SIZE,
            height: ITEM_SIZE,
            margin: GAP / 2,
          }}
        >
          <Image
            source={{ uri: item.editedUri ?? item.uri }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 4,
              borderWidth: isSelected ? 3 : 0,
              borderColor: "#5c7cfa",
            }}
            contentFit="cover"
          />
          {isSelected ? (
            <View
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: "#5c7cfa",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>
            </View>
          ) : null}
          {screenshotTags[item.id]?.length > 0 ? (
            <View
              style={{
                position: "absolute",
                bottom: 4,
                left: 4,
                flexDirection: "row",
                gap: 2,
              }}
            >
              {screenshotTags[item.id].slice(0, 2).map(tag => (
                <View
                  key={tag.id}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: tag.color || "#748ffc",
                  }}
                />
              ))}
            </View>
          ) : null}
          {item.isFavorite ? (
            <View
              style={{
                position: "absolute",
                bottom: 4,
                right: 4,
              }}
            >
              <Icon as={Heart} className="text-accent-amber" size={14} fill="#ffd43b" strokeWidth={0} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [selectedIds, isSelectMode, toggleSelect]
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
      {/* Header */}
      <View className="px-4 pt-2 pb-3 flex-row items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => router.back()}
          className="rounded-full"
        >
          <Icon as={ArrowLeft} className="text-foreground" size={22} strokeWidth={2} />
        </Button>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {folder ? (
              <View
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: folder.color }}
              />
            ) : null}
            <Text className="text-surface-900 dark:text-white text-lg font-bold" numberOfLines={1}>
              {folder?.name ?? "Folder"}
            </Text>
          </View>
          <Text className="text-surface-600 dark:text-surface-300 text-xs mt-0.5">
            {screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {isSelectMode ? (
          <View className="flex-row items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onPress={() => setShowTagPicker(true)}
              className="bg-primary-900/10 dark:bg-primary-900/20"
            >
              <Icon as={Tags} className="text-primary-500" size={18} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={handleFavoriteSelected}
              className="bg-accent-amber/10 dark:bg-accent-amber/20"
            >
              <Icon as={Heart} className="text-accent-amber" size={18} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={handleDeleteSelected}
              className="bg-accent-red/10 dark:bg-accent-red/20"
            >
              <Icon as={Trash2} className="text-destructive" size={18} strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={() => setSelectedIds(new Set())}
            >
              <Icon as={X} className="text-muted-foreground" size={20} />
            </Button>
          </View>
        ) : null}
      </View>

      {/* Gallery Grid */}
      {screenshots.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-surface-500 dark:text-surface-300 text-base">No screenshots in this folder</Text>
        </View>
      ) : (
        <FlashList
          data={screenshots}
          renderItem={renderItem}
          numColumns={COLUMN_COUNT}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: GAP / 2 }}
        />
      )}

      {/* Tag Picker Modal */}
      <BottomSheetModal open={showTagPicker} onOpenChange={setShowTagPicker}>
        <View className="px-6 pt-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
          <View>
            <Text className="text-surface-900 dark:text-white text-xl font-bold">Apply Tags</Text>
            <Text className="text-surface-600 dark:text-surface-400 text-xs mt-1">
              Applying to {selectedIds.size} screenshots
            </Text>
          </View>
        </View>

        <View className="p-6 pb-12">
          <ScrollView className="max-h-80">
            <View className="flex-row flex-wrap gap-3">
              {tags.length === 0 ? (
                <Text className="text-surface-500 dark:text-surface-400 text-sm italic py-4">No tags created yet.</Text>
              ) : (
                tags.map((tag) => (
                  <Button
                    key={tag.id}
                    variant="ghost"
                    onPress={() => handleToggleTag(tag.id)}
                    className="rounded-full px-4 py-2 h-auto border"
                    style={{
                      backgroundColor: tag.color + "15",
                      borderColor: tag.color,
                    }}
                  >
                    <Text style={{ color: tag.color, fontWeight: "600" }}>
                      {tag.name}
                    </Text>
                  </Button>
                ))
              )}
            </View>
          </ScrollView>

          <Button
            onPress={() => setShowTagPicker(false)}
            size="lg"
            className="rounded-xl py-3.5 h-auto mt-8"
          >
            <Text className="text-white font-bold">Done</Text>
          </Button>
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
