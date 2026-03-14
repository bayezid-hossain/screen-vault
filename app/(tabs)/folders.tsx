import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  createFolder,
  createTag,
  deleteFolder,
  deleteTag,
  getFolders,
  getScreenshotsByFolder,
  getTags,
  updateFolder,
  type FolderRow,
  type TagRow,
} from "@/lib/database";
import { exportAllToDevice, exportFolderToDevice } from "@/lib/file-organizer";
import { useAppStore } from "@/lib/store";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Download,
  FolderOpen,
  FolderPlus,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FOLDER_COLORS = [
  "#5c7cfa", "#748ffc", "#4dabf7", "#66d9e8",
  "#51cf66", "#94d82d", "#ffd43b", "#ff922b",
  "#ff6b6b", "#e599f7", "#cc5de8", "#845ef7",
];

export default function FoldersScreen() {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderRow | null>(null);
  const [newName, setNewName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);
  const [folderPreviews, setFolderPreviews] = useState<Record<number, string | null>>({});
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<number | null>(null);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();
  const theme = useAppStore((s) => s.theme);
  const dbRevision = useAppStore((s) => s.databaseRevision);

  const loadData = useCallback(async () => {
    const [fData, tData] = await Promise.all([getFolders(), getTags()]);
    setFolders(fData);
    setTags(tData);

    const previews: Record<number, string | null> = {};
    for (const folder of fData) {
      const shots = await getScreenshotsByFolder(folder.id);
      previews[folder.id] = shots.length > 0 ? shots[0].uri : null;
    }
    setFolderPreviews(previews);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData, dbRevision])
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createFolder(newName.trim(), selectedColor);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewName("");
    setSelectedColor(FOLDER_COLORS[0]);
    setShowFolderModal(false);
    await loadData();
  }, [newName, selectedColor, loadData]);


  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim()) return;
    await createTag(newTagName.trim());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewTagName("");
    await loadData();
  }, [newTagName, loadData]);

  const handleDeleteTag = useCallback(async (id: number) => {
    await deleteTag(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await loadData();
  }, [loadData]);

  const handleUpdate = useCallback(async () => {
    if (!editingFolder || !newName.trim()) return;
    await updateFolder(editingFolder.id, {
      name: newName.trim(),
      color: selectedColor,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingFolder(null);
    setShowFolderModal(false);
    setNewName("");
    await loadData();
  }, [editingFolder, newName, selectedColor, loadData]);

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteFolder(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setEditingFolder(null);
      setShowFolderModal(false);
      await loadData();
    },
    [loadData]
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
      {/* Header */}
      <View className="px-6 pt-2 pb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-black dark:text-white text-2xl font-bold">Folders</Text>
          <Text className="text-surface-500 dark:text-white text-sm mt-1">
            {folders.length} folder{folders.length !== 1 ? "s" : ""} • {tags.length} tag{tags.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onPress={async () => {
              if (folders.length === 0) {
                Alert.alert("No Folders", "Create folders and organize screenshots first.");
                return;
              }
              setIsExporting(true);
              try {
                const result = await exportAllToDevice((exported, total, folder) => {
                  // Progress callback - could update UI
                });
                if (result.exported > 0) {
                  Alert.alert(
                    "Export Complete",
                    `Exported ${result.exported} screenshots across ${result.folders} folders.${result.errors > 0 ? ` (${result.errors} failed)` : ''}`
                  );
                }
              } catch (err) {
                Alert.alert("Export Error", "Failed to export files.");
              } finally {
                setIsExporting(false);
              }
            }}
            disabled={isExporting}
            className="rounded-xl border-surface-200 dark:border-surface-700 h-11 w-11"
          >
            <Icon as={Download} className="text-muted-foreground" size={20} strokeWidth={2} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onPress={() => setShowManageTags(true)}
            className="rounded-xl border-surface-200 dark:border-surface-700 h-11 w-11"
          >
            <Icon as={Tags} className="text-muted-foreground" size={20} strokeWidth={2} />
          </Button>
          <Button
            size="icon"
            onPress={() => {
              setEditingFolder(null);
              setNewName("");
              setSelectedColor(FOLDER_COLORS[0]);
              setShowFolderModal(true);
            }}
            className="rounded-xl h-11 w-11"
          >
            <Icon as={FolderPlus} className="dark:text-white text-black" size={20} strokeWidth={2} />
          </Button>
        </View>
      </View>

      {/* Folder Grid */}
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {folders.length === 0 ? (
          <View className="items-center justify-center py-20">
            <View className="w-20 h-20 rounded-3xl bg-surface-100 dark:bg-surface-800 items-center justify-center mb-4">
              <Icon as={FolderOpen} className="text-muted-foreground" size={36} strokeWidth={1.5} />
            </View>
            <Text className="text-surface-500 dark:text-white text-base text-center">
              No folders yet.{"\n"}Create one to start organizing!
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() => router.push(`/folder/${folder.id}`)}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setEditingFolder(folder);
                  setNewName(folder.name);
                  setSelectedColor(folder.color);
                  setShowFolderModal(true);
                }}
                className="bg-surface-50 dark:bg-surface-800 rounded-2xl overflow-hidden active:opacity-80 border border-surface-100 dark:border-transparent"
                style={{ width: "47.5%" }}
              >
                {/* Preview */}
                <View className="h-32 bg-surface-100 dark:bg-surface-700">
                  {folderPreviews[folder.id] ? (
                    <Image
                      source={{ uri: folderPreviews[folder.id]! }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center">
                      <Icon as={FolderOpen} color={folder.color} size={32} strokeWidth={1.5} />
                    </View>
                  )}
                </View>
                {/* Info */}
                <View className="p-3">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: folder.color }}
                    />
                    <Text className="text-black dark:text-white font-semibold text-sm flex-1" numberOfLines={1}>
                      {folder.name}
                    </Text>
                  </View>
                  <Text className="text-surface-500 dark:text-white text-xs mt-1">
                    {folder.screenshotCount} item{folder.screenshotCount !== 1 ? "s" : ""}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Create / Edit Folder Modal */}
      <BottomSheetModal open={showFolderModal} onOpenChange={setShowFolderModal}>
        <View className="px-6 pt-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
          <Text className="text-black dark:text-white text-xl font-bold">
            {editingFolder ? "Edit Folder" : "New Folder"}
          </Text>
        </View>

        <View className="px-6 py-6 pb-10">
          <Input
            value={newName}
            onChangeText={setNewName}
            placeholder="Folder name..."
            autoFocus
            className="mb-4 h-12 rounded-xl text-base"
          />

          <Text className="text-surface-500 dark:text-white text-sm mb-3 font-semibold">
            Color
          </Text>
          <View className="flex-row flex-wrap gap-3 mb-8">
            {FOLDER_COLORS.map((color) => (
              <Button
                key={color}
                variant="ghost"
                onPress={() => setSelectedColor(color)}
                className="rounded-full h-9 w-9 p-0"
                style={{
                  backgroundColor: color,
                  borderWidth: selectedColor === color ? 3 : 0,
                  borderColor: theme === "light" ? "#000" : "#fff",
                }}
              />
            ))}
          </View>

          <View className="gap-3">
            <Button
              onPress={editingFolder ? handleUpdate : handleCreate}
              size="lg"
              className="rounded-xl py-3.5 h-auto"
            >
              <Text className="dark:text-black text-white font-bold text-base">
                {editingFolder ? "Update Folder" : "Create Folder"}
              </Text>
            </Button>

            {editingFolder && (
              <Button
                variant="outline"
                size="lg"
                onPress={async () => {
                  if (!editingFolder) return;
                  setIsExporting(true);
                  try {
                    const result = await exportFolderToDevice(
                      editingFolder.id,
                      editingFolder.name
                    );
                    if (result.exported > 0) {
                      Alert.alert(
                        "Export Complete",
                        `Exported ${result.exported} screenshots.${result.errors > 0 ? ` (${result.errors} failed)` : ''}`
                      );
                    }
                  } catch (err) {
                    Alert.alert("Export Error", "Failed to export files.");
                  } finally {
                    setIsExporting(false);
                  }
                }}
                disabled={isExporting}
                className="rounded-xl py-3.5 h-auto border-primary-200 dark:border-primary-700 flex-row gap-2"
              >
                <Icon as={Download} className="text-primary-600" size={18} strokeWidth={2} />
                <Text className="text-primary-600 dark:text-primary-400 font-bold text-base">
                  {isExporting ? "Exporting..." : "Export to Device"}
                </Text>
              </Button>
            )}

            {editingFolder && (
              <Button
                variant="outline"
                size="lg"
                onPress={() => setConfirmDeleteFolder(editingFolder.id)}
                className="rounded-xl py-3.5 h-auto border-accent-red/20 flex-row gap-2"
              >
                <Icon as={Trash2} className="text-destructive" size={18} strokeWidth={2} />
                <Text className="text-destructive font-bold text-base">Delete Folder</Text>
              </Button>
            )}
          </View>
        </View>
      </BottomSheetModal>

      {/* Manage Tags Modal */}
      <BottomSheetModal open={showManageTags} onOpenChange={setShowManageTags}>
        <View className="px-6 pt-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
          <Text className="text-black dark:text-white text-xl font-bold">Manage Tags</Text>
        </View>

        <View className="px-6 py-6 pb-10">
          <View className="flex-row gap-2 mb-6">
            <Input
              value={newTagName}
              onChangeText={setNewTagName}
              placeholder="New tag name..."
              className="flex-1 h-12 rounded-xl text-base"
            />
            <Button
              onPress={handleCreateTag}
              className="w-12 h-12 items-center justify-center rounded-xl p-0"
            >
              <Icon as={Plus} className="text-white dark:text-black" size={24} strokeWidth={2.5} />
            </Button>
          </View>

          <ScrollView className="max-h-64">
            <View className="flex-row flex-wrap gap-2">
              {tags.length === 0 ? (
                <Text className="text-surface-500 dark:text-white text-sm italic py-4">No tags created yet.</Text>
              ) : (
                tags.map((tag) => (
                  <View
                    key={tag.id}
                    className="bg-surface-100 dark:bg-surface-700 rounded-full pl-4 pr-1 py-1 flex-row items-center gap-2"
                  >
                    <Text className="text-black dark:text-white text-sm font-medium">{tag.name}</Text>
                    <Button
                      variant="ghost"
                      size="icon"
                      onPress={() => setConfirmDeleteTag(tag.id)}
                      className="h-7 w-7 rounded-full p-0"
                    >
                      <Icon as={X} className="text-muted-foreground" size={12} strokeWidth={2.5} />
                    </Button>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </BottomSheetModal>

      {/* Confirmation Modals */}
      <ConfirmationModal
        visible={confirmDeleteFolder !== null}
        onClose={() => setConfirmDeleteFolder(null)}
        onConfirm={() => confirmDeleteFolder && handleDelete(confirmDeleteFolder)}
        title="Delete Folder"
        message={`Are you sure you want to delete "${editingFolder?.name}"? Screenshots will be moved back to Inbox.`}
        confirmLabel="Delete"
      />

      <ConfirmationModal
        visible={confirmDeleteTag !== null}
        onClose={() => setConfirmDeleteTag(null)}
        onConfirm={() => confirmDeleteTag && handleDeleteTag(confirmDeleteTag)}
        title="Delete Tag"
        message="Are you sure you want to delete this tag? It will be removed from all screenshots."
        confirmLabel="Delete"
      />
    </SafeAreaView>
  );
}
