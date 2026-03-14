import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  addTagToScreenshot,
  batchAssignToFolder,
  batchMarkAsDeleted,
  batchToggleFavorite,
  createFolder,
  getFolders,
  getScreenshotsByFolder,
  getScreenshotTags,
  getTags,
  removeTagFromScreenshot,
  unorganizeScreenshots,
  type FolderRow,
  type ScreenshotRow,
  type TagRow
} from "@/lib/database";
import { useAppStore } from "@/lib/store";
import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  X as CloseIcon,
  FolderInput,
  Heart,
  Inbox,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Pressable,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const COLUMN_COUNT = 3;
const GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (COLUMN_COUNT + 1)) / COLUMN_COUNT;

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [folder, setFolder] = useState<FolderRow | null>(null);
  const [allFolders, setAllFolders] = useState<FolderRow[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [screenshotTags, setScreenshotTags] = useState<Record<number, TagRow[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const theme = useAppStore((s) => s.theme);
  const dbRevision = useAppStore((s) => s.databaseRevision);
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
    setAllFolders(folders);
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
    if (selectedIds.size > 0) {
      setConfirmDelete(true);
    }
  }, [selectedIds]);

  const confirmDeleteAction = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await batchMarkAsDeleted(ids);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setSelectedIds(new Set());
    setConfirmDelete(false);
    await loadData();
  }, [selectedIds, loadData]);

  const handleFavoriteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await batchToggleFavorite(ids);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedIds(new Set());
    await loadData();
  }, [selectedIds, loadData]);

  const handleMoveToFolder = useCallback(async (targetFolderId: number) => {
    const ids = Array.from(selectedIds);
    await batchAssignToFolder(ids, targetFolderId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedIds(new Set());
    setShowMovePicker(false);
    await loadData();
  }, [selectedIds, loadData]);

  const handleUnorganize = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await unorganizeScreenshots(ids);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedIds(new Set());
    await loadData();
  }, [selectedIds, loadData]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      const colors = ["#5c7cfa", "#748ffc", "#4dabf7", "#66d9e8", "#51cf66", "#94d82d", "#ffd43b", "#ff922b", "#ff6b6b", "#e599f7", "#cc5de8", "#845ef7"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const newId = await createFolder(newFolderName.trim(), randomColor);
      setNewFolderName("");
      setIsCreatingFolder(false);
      // Automatically move to the newly created folder
      await handleMoveToFolder(Number(newId));
    } catch (err) {
      console.error("[FolderDetail] Create folder error:", err);
    }
  }, [newFolderName, handleMoveToFolder]);

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
    ({ item, index }: { item: ScreenshotRow, index: number }) => {
      const isSelected = selectedIds.has(item.id);
      return (
        <Pressable
          onPress={() => {
            if (isSelectMode) {
              toggleSelect(item.id);
            } else {
              router.push({
                pathname: "/viewer",
                params: {
                  ids: screenshots.map((s) => s.id).join(","),
                  index: index.toString(),
                },
              });
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
    [selectedIds, isSelectMode, toggleSelect, screenshots, router]
  );

  // Other folders (excluding current) for move picker
  const otherFolders = allFolders.filter(f => f.id !== folderId);

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
          <Text className="text-surface-600 dark:text-white text-xs mt-0.5">
            {isSelectMode
              ? `${selectedIds.size} selected`
              : `${screenshots.length} screenshot${screenshots.length !== 1 ? "s" : ""}`}
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
              onPress={() => setShowMovePicker(true)}
              className="bg-accent-green/10 dark:bg-accent-green/20"
            >
              <Icon as={FolderInput} className="text-accent-green" size={18} strokeWidth={2} />
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
          <Text className="text-surface-500 dark:text-white text-base">No screenshots in this folder</Text>
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
            <Text className="text-surface-600 dark:text-white text-xs mt-1">
              Applying to {selectedIds.size} screenshots
            </Text>
          </View>
        </View>

        <View className="p-6 pb-12">
          <ScrollView className="max-h-80">
            <View className="flex-row flex-wrap gap-3">
              {tags.length === 0 ? (
                <Text className="text-surface-500 dark:text-white text-sm italic py-4">No tags created yet.</Text>
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

      {/* Move to Folder Modal */}
      <BottomSheetModal open={showMovePicker} onOpenChange={(open) => {
        setShowMovePicker(open);
        if (!open) {
          setIsCreatingFolder(false);
          setNewFolderName("");
        }
      }}>
        <View className="px-6 pt-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
          <View>
            <Text className="text-surface-900 dark:text-white text-xl font-bold">Move to Folder</Text>
            <Text className="text-surface-600 dark:text-white text-xs mt-1">
              Moving {selectedIds.size} screenshot{selectedIds.size !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <View className="px-6 py-6 pb-12">
          {/* Create Folder Option */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsCreatingFolder(!isCreatingFolder);
            }}
            className="flex-row items-center gap-3 py-3 mb-4 border-b border-surface-100 dark:border-surface-700"
          >
            <View className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 items-center justify-center">
              <Icon as={isCreatingFolder ? CloseIcon : Plus} className="text-primary-600" size={20} strokeWidth={2.5} />
            </View>
            <Text className="text-primary-600 font-bold text-base">
              {isCreatingFolder ? "Cancel" : "New Folder"}
            </Text>
          </Pressable>

          {isCreatingFolder && (
            <View className="flex-row gap-2 mb-6">
              <Input
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Folder name..."
                autoFocus
                className="flex-1 h-12 rounded-xl text-base"
              />
              <Button
                onPress={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="w-12 h-12 items-center justify-center rounded-xl p-0"
              >
                <Icon as={Plus} className="text-white" size={24} strokeWidth={2.5} />
              </Button>
            </View>
          )}

          {/* Unorganize option */}
          <Button
            variant="ghost"
            onPress={handleUnorganize}
            className="flex-row items-center justify-start gap-3 mb-4 p-3 bg-surface-100 dark:bg-surface-700/50 rounded-xl h-auto"
          >
            <View className="w-10 h-10 rounded-xl bg-surface-200 dark:bg-surface-600 items-center justify-center">
              <Icon as={Inbox} className="text-muted-foreground" size={20} strokeWidth={2} />
            </View>
            <View className="flex-1 items-start">
              <Text className="text-black dark:text-white font-semibold">Move to Inbox</Text>
              <Text className="text-surface-500 dark:text-white text-xs">Remove from this folder</Text>
            </View>
          </Button>

          {otherFolders.length === 0 && !isCreatingFolder ? (
            <Text className="text-surface-500 dark:text-white text-sm text-center py-6">
              No other folders available. Create one in the Folders tab.
            </Text>
          ) : (
            <ScrollView className="max-h-72">
              <View className="gap-2">
                {otherFolders.map((f) => (
                  <Button
                    key={f.id}
                    variant="ghost"
                    onPress={() => handleMoveToFolder(f.id)}
                    className="flex-row items-center justify-start gap-3 p-3 h-auto"
                  >
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center"
                      style={{ backgroundColor: f.color + "20" }}
                    >
                      <Icon as={FolderInput} color={f.color} size={20} strokeWidth={2} />
                    </View>
                    <View className="flex-1 items-start">
                      <Text className="text-black dark:text-white font-semibold">{f.name}</Text>
                      <Text className="text-surface-500 dark:text-white text-xs">
                        {f.screenshotCount} items
                      </Text>
                    </View>
                  </Button>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </BottomSheetModal>

      <ConfirmationModal
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={confirmDeleteAction}
        title="Move to Trash"
        message={`Are you sure you want to move ${selectedIds.size} screenshots to the trash?`}
        confirmLabel="Move to Trash"
      />
    </SafeAreaView>
  );
}
