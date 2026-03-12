import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
} from "react-native";
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
import { Modal, TextInput } from "react-native";

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

  const folderId = parseInt(id ?? "0", 10);

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isSelectMode = selectedIds.size > 0;

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
              <Heart size={14} color="#ffd43b" fill="#ffd43b" strokeWidth={0} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [selectedIds, isSelectMode, toggleSelect]
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-950">
      {/* Header */}
      <View className="px-4 pt-2 pb-3 flex-row items-center gap-3">
        <Pressable onPress={() => router.back()} className="p-2">
          <ArrowLeft size={22} color="#fff" strokeWidth={2} />
        </Pressable>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {folder ? (
              <View
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: folder.color }}
              />
            ) : null}
            <Text className="text-white text-lg font-bold" numberOfLines={1}>
              {folder?.name ?? "Folder"}
            </Text>
          </View>
          <Text className="text-surface-300 text-xs mt-0.5">
            {screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {isSelectMode ? (
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setShowTagPicker(true)}
              className="p-2 bg-primary-900/15 rounded-lg"
            >
              <Tags size={18} color="#5c7cfa" strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={handleFavoriteSelected}
              className="p-2 bg-accent-amber/15 rounded-lg"
            >
              <Heart size={18} color="#ffd43b" strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={handleDeleteSelected}
              className="p-2 bg-accent-red/15 rounded-lg"
            >
              <Trash2 size={18} color="#ff6b6b" strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => setSelectedIds(new Set())}
              className="px-2 py-2"
            >
              <X size={20} color="#868e96" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Gallery Grid */}
      {screenshots.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-surface-300 text-base">No screenshots in this folder</Text>
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
      <Modal visible={showTagPicker} transparent animationType="fade">
        <Pressable
          onPress={() => setShowTagPicker(false)}
          className="flex-1 bg-black/60 items-center justify-center p-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full bg-surface-800 rounded-3xl p-6"
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">Apply Tags</Text>
              <Pressable onPress={() => setShowTagPicker(false)}>
                <X size={22} color="#868e96" />
              </Pressable>
            </View>
            <Text className="text-surface-400 text-sm mb-4">
              Applying to {selectedIds.size} screenshots
            </Text>

            <ScrollView className="max-h-64">
              <View className="flex-row flex-wrap gap-2">
                {tags.length === 0 ? (
                  <Text className="text-surface-500 text-center py-4 italic">
                    No tags available. Create them in the Folders tab.
                  </Text>
                ) : (
                  tags.map((tag) => (
                    <Pressable
                      key={tag.id}
                      onPress={() => handleToggleTag(tag.id)}
                      className="rounded-full px-4 py-2 border mr-2 mb-2"
                      style={{
                        backgroundColor: tag.color + "15",
                        borderColor: tag.color,
                      }}
                    >
                      <Text style={{ color: tag.color, fontWeight: "600" }}>
                        {tag.name}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            </ScrollView>

            <Pressable
              onPress={() => setShowTagPicker(false)}
              className="bg-primary-600 py-3.5 rounded-xl items-center mt-6"
            >
              <Text className="text-white font-bold">Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
