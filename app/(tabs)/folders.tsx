import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import {
  FolderPlus,
  FolderOpen,
  ChevronRight,
  Palette,
  X,
  Tags,
  Plus,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  getFolders,
  createFolder,
  deleteFolder,
  getScreenshotsByFolder,
  getTags,
  createTag,
  deleteTag,
  type FolderRow,
  type TagRow,
} from "@/lib/database";

const FOLDER_COLORS = [
  "#5c7cfa", "#748ffc", "#4dabf7", "#66d9e8",
  "#51cf66", "#94d82d", "#ffd43b", "#ff922b",
  "#ff6b6b", "#e599f7", "#cc5de8", "#845ef7",
];

export default function FoldersScreen() {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);
  const [folderPreviews, setFolderPreviews] = useState<Record<number, string | null>>({});
  const router = useRouter();

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
    }, [loadData])
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createFolder(newName.trim(), selectedColor);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewName("");
    setSelectedColor(FOLDER_COLORS[0]);
    setShowCreate(false);
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

  const handleDelete = useCallback(
    async (id: number, name: string) => {
      await deleteFolder(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await loadData();
    },
    [loadData]
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-950">
      {/* Header */}
      <View className="px-6 pt-2 pb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-white text-2xl font-bold">Folders</Text>
          <Text className="text-surface-300 text-sm mt-1">
            {folders.length} folder{folders.length !== 1 ? "s" : ""} • {tags.length} tag{tags.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setShowManageTags(true)}
            className="bg-surface-800 p-2.5 rounded-xl"
          >
            <Tags size={20} color="#868e96" strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => setShowCreate(true)}
            className="bg-primary-700 p-2.5 rounded-xl"
          >
            <FolderPlus size={20} color="#fff" strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Folder Grid */}
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {folders.length === 0 ? (
          <View className="items-center justify-center py-20">
            <View className="w-20 h-20 rounded-3xl bg-surface-800 items-center justify-center mb-4">
              <FolderOpen size={36} color="#868e96" strokeWidth={1.5} />
            </View>
            <Text className="text-surface-300 text-base text-center">
              No folders yet.{"\n"}Create one to start organizing!
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() => router.push(`/folder/${folder.id}`)}
                onLongPress={() => handleDelete(folder.id, folder.name)}
                className="bg-surface-800 rounded-2xl overflow-hidden active:opacity-80"
                style={{ width: "47.5%" }}
              >
                {/* Preview */}
                <View className="h-32 bg-surface-700">
                  {folderPreviews[folder.id] ? (
                    <Image
                      source={{ uri: folderPreviews[folder.id]! }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center">
                      <FolderOpen size={32} color={folder.color} strokeWidth={1.5} />
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
                    <Text className="text-white font-semibold text-sm flex-1" numberOfLines={1}>
                      {folder.name}
                    </Text>
                  </View>
                  <Text className="text-surface-300 text-xs mt-1">
                    {folder.screenshotCount} item{folder.screenshotCount !== 1 ? "s" : ""}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Create Folder Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <Pressable
          onPress={() => setShowCreate(false)}
          className="flex-1 bg-black/60 justify-end"
        >
          <Pressable onPress={(e) => e.stopPropagation()} className="bg-surface-800 rounded-t-3xl px-6 pt-6 pb-10">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-xl font-bold">New Folder</Text>
              <Pressable onPress={() => setShowCreate(false)} className="p-1">
                <X size={22} color="#868e96" strokeWidth={2} />
              </Pressable>
            </View>

            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Folder name..."
              placeholderTextColor="#495057"
              autoFocus
              className="bg-surface-700 text-white px-4 py-3 rounded-xl text-base mb-4"
            />

            <Text className="text-surface-300 text-sm mb-3">
              <Palette size={14} color="#868e96" /> Color
            </Text>
            <View className="flex-row flex-wrap gap-3 mb-6">
              {FOLDER_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setSelectedColor(color)}
                  className="rounded-full items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    backgroundColor: color,
                    borderWidth: selectedColor === color ? 3 : 0,
                    borderColor: "#fff",
                  }}
                />
              ))}
            </View>

            <Pressable
              onPress={handleCreate}
              className="bg-primary-600 py-3.5 rounded-xl items-center"
            >
              <Text className="text-white font-bold text-base">Create Folder</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manage Tags Modal */}
      <Modal visible={showManageTags} transparent animationType="slide">
        <Pressable
          onPress={() => setShowManageTags(false)}
          className="flex-1 bg-black/60 justify-end"
        >
          <Pressable onPress={(e) => e.stopPropagation()} className="bg-surface-800 rounded-t-3xl px-6 pt-6 pb-10">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white text-xl font-bold">Manage Tags</Text>
              <Pressable onPress={() => setShowManageTags(false)} className="p-1">
                <X size={22} color="#868e96" strokeWidth={2} />
              </Pressable>
            </View>

            <View className="flex-row gap-2 mb-6">
              <TextInput
                value={newTagName}
                onChangeText={setNewTagName}
                placeholder="New tag name..."
                placeholderTextColor="#495057"
                className="flex-1 bg-surface-700 text-white px-4 py-3 rounded-xl text-base"
              />
              <Pressable
                onPress={handleCreateTag}
                className="bg-primary-600 w-12 items-center justify-center rounded-xl"
              >
                <Plus size={24} color="#fff" strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView className="max-h-64">
              <View className="flex-row flex-wrap gap-2">
                {tags.length === 0 ? (
                  <Text className="text-surface-500 text-sm italic py-4">No tags created yet.</Text>
                ) : (
                  tags.map((tag) => (
                    <View
                      key={tag.id}
                      className="bg-surface-700 rounded-full pl-4 pr-2 py-1.5 flex-row items-center gap-2"
                    >
                      <Text className="text-white text-sm font-medium">{tag.name}</Text>
                      <Pressable
                        onPress={() => handleDeleteTag(tag.id)}
                        className="bg-surface-600 rounded-full p-1"
                      >
                        <X size={12} color="#adb5bd" strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
