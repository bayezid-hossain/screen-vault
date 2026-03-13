import { clearAllData, getStats } from "@/lib/database";
import {
  fullRescan,
  getAllAlbumsWithAssets,
  resetSyncState,
  saveThemeSetting,
  selectDeviceFolder,
  setSelectedAlbum,
  setSelectedFolder
} from "@/lib/screenshot-monitor";
import { useAppStore } from "@/lib/store";
import Constants from "expo-constants";
import * as MediaLibrary from "expo-media-library";
import { useFocusEffect } from "expo-router";
import {
  ChevronRight,
  Database,
  FolderInput,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Monitor,
  Moon,
  RefreshCw,
  Settings2,
  Sun,
  Trash,
  X,
  Zap
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  View
} from "react-native";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const selectedAlbumName = useAppStore((s) => s.selectedAlbumName);
  const isImporting = useAppStore((s) => s.isImporting);
  const lastSyncTimestamp = useAppStore((s) => s.lastSyncTimestamp);
  const theme = useAppStore((s) => s.theme);

  const [totalScreenshots, setTotalScreenshots] = useState(0);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [deviceAlbums, setDeviceAlbums] = useState<MediaLibrary.Album[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const stats = await getStats();
        setTotalScreenshots(stats.total + stats.deleted);
      })();
    }, [])
  );

  const lastSyncDisplay = lastSyncTimestamp
    ? new Date(lastSyncTimestamp).toLocaleString()
    : "Never";

  const handleOpenAlbumPicker = useCallback(async () => {
    setIsLoadingAlbums(true);
    try {
      const albums = await getAllAlbumsWithAssets();
      setDeviceAlbums(albums);
      setShowAlbumPicker(true);
    } catch (err) {
      console.error("[Settings] Error loading albums:", err);
    } finally {
      setIsLoadingAlbums(false);
    }
  }, []);

  const handleSelectAlbum = useCallback(
    async (albumId: string | null, albumName: string | null) => {
      await setSelectedAlbum(albumId, albumName);
      setShowAlbumPicker(false);
    },
    []
  );

  const handleBrowseDeviceFolder = useCallback(async () => {
    const result = await selectDeviceFolder();
    if (result) {
      setShowAlbumPicker(false);
      await setSelectedFolder(result.uri, result.name);
    }
  }, []);

  const handleForceRescan = () => {
    Alert.alert(
      "Force Re-scan",
      "This will forget your last sync time and scan all photos for screenshots again. No data will be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Proceed",
          onPress: async () => {
            await fullRescan();
          },
        },
      ]
    );
  };

  const handleWipeData = () => {
    Alert.alert(
      "Wipe All Data",
      "This will delete all folders, tags, and organized screenshot references. It cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            await resetSyncState();
          },
        },
      ]
    );
  };

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? "1.0.0";

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
      <ScrollView className="flex-1 px-6 pt-2" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-black dark:text-white text-2xl font-bold mb-1">Settings</Text>
        <Text className="text-surface-500 dark:text-surface-300 text-sm mb-6">
          Configure how ScreenVault works
        </Text>

        {/* ── Screenshot Source ── */}
        <SectionHeader icon={<FolderOpen size={16} color="#5c7cfa" />} title="Screenshot Source" />
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl overflow-hidden mb-6 border border-surface-100 dark:border-transparent">
          <Button
            variant="ghost"
            onPress={handleOpenAlbumPicker}
            className="flex-row items-center justify-between p-4 h-auto rounded-none"
          >
            <View className="flex-1 items-start">
              <Text className="text-black dark:text-white font-semibold">Current Source</Text>
              <Text className="text-surface-500 dark:text-surface-300 text-xs mt-0.5" numberOfLines={1}>
                {selectedAlbumName ?? "Automatic Detection"}
              </Text>
            </View>
            <ChevronRight size={18} color="#868e96" />
          </Button>
          <View className="h-[1px] bg-surface-100 dark:bg-surface-700 mx-4" />
          <View className="p-4">
            <Text className="text-surface-500 dark:text-surface-300 text-xs">
              Last sync: {lastSyncDisplay}
            </Text>
          </View>
        </View>

        {/* ── Theme ── */}
        <SectionHeader icon={<Moon size={16} color="#845ef7" />} title="Theme" />
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl overflow-hidden mb-6 flex-row p-2 gap-2 border border-surface-100 dark:border-transparent">
          <ThemeOption
            active={theme === "light"}
            onPress={() => saveThemeSetting("light")}
            icon={<Sun size={20} color={theme === "light" ? "#fff" : "#868e96"} />}
            label="Light"
          />
          <ThemeOption
            active={theme === "dark"}
            onPress={() => saveThemeSetting("dark")}
            icon={<Moon size={20} color={theme === "dark" ? "#fff" : "#868e96"} />}
            label="Dark"
          />
          <ThemeOption
            active={theme === "system"}
            onPress={() => saveThemeSetting("system")}
            icon={<Monitor size={20} color={theme === "system" ? "#fff" : "#868e96"} />}
            label="Auto"
          />
        </View>

        {/* ── Sync ── */}
        <SectionHeader icon={<Zap size={16} color="#ffd43b" />} title="Sync" />
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl overflow-hidden mb-6 border border-surface-100 dark:border-transparent">
          <Button
            variant="ghost"
            onPress={handleForceRescan}
            disabled={isImporting}
            className="flex-row items-center justify-start gap-3 p-4 h-auto rounded-none"
          >
            <View className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 items-center justify-center">
              <RefreshCw size={20} color="#5c7cfa" strokeWidth={2} />
            </View>
            <View className="flex-1 items-start">
              <Text className="text-black dark:text-white font-semibold">
                {isImporting ? "Scanning..." : "Force Re-scan"}
              </Text>
              <Text className="text-surface-500 dark:text-surface-300 text-xs">
                Reset sync timer and scan all photos
              </Text>
            </View>
          </Button>
        </View>

        {/* ── Data Management ── */}
        <SectionHeader icon={<Database size={16} color="#ff6b6b" />} title="Data Management" />
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl overflow-hidden mb-6 border border-surface-100 dark:border-transparent">
          <View className="flex-row items-center justify-between p-4">
            <View>
              <Text className="text-black dark:text-white font-semibold">Total Imported</Text>
              <Text className="text-surface-500 dark:text-surface-300 text-xs">
                Screenshots tracked by ScreenVault
              </Text>
            </View>
            <Text className="text-primary-700 dark:text-primary-400 font-bold text-lg">
              {totalScreenshots}
            </Text>
          </View>
          <View className="h-[1px] bg-surface-100 dark:bg-surface-700 mx-4" />
          <Button
            variant="ghost"
            onPress={handleWipeData}
            className="flex-row items-center justify-start gap-3 p-4 h-auto rounded-none"
          >
            <View className="w-10 h-10 rounded-xl bg-accent-red/10 dark:bg-accent-red/15 items-center justify-center">
              <Trash size={20} color="#ff6b6b" strokeWidth={2} />
            </View>
            <View className="flex-1 items-start">
              <Text className="text-accent-red font-semibold">Wipe All Data</Text>
              <Text className="text-surface-500 dark:text-surface-300 text-xs text-left">
                Delete all folders, tags, and references
              </Text>
            </View>
          </Button>
        </View>

        {/* ── About ── */}
        <SectionHeader icon={<Info size={16} color="#66d9e8" />} title="About" />
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl overflow-hidden mb-6 border border-surface-100 dark:border-transparent">
          <View className="p-4">
            <Text className="text-black dark:text-white font-bold text-base mb-1">ScreenVault</Text>
            <Text className="text-surface-500 dark:text-white text-xs mb-3">
              Your personal screenshot organizer
            </Text>
            <View className="flex-row items-center justify-between py-1">
              <Text className="text-surface-500 dark:text-white text-sm">Version</Text>
              <Text className="text-black dark:text-white font-medium text-sm">{appVersion}</Text>
            </View>
            <View className="flex-row items-center justify-between py-1">
              <Text className="text-surface-500 dark:text-white text-sm">Platform</Text>
              <Text className="text-black dark:text-white font-medium text-sm">Android</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Album Picker Modal */}
      <AlbumPickerModal
        visible={showAlbumPicker}
        onClose={() => setShowAlbumPicker(false)}
        albums={deviceAlbums}
        onSelect={handleSelectAlbum}
        onBrowseFolder={handleBrowseDeviceFolder}
        currentAlbumName={selectedAlbumName}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ──

function ThemeOption({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      className={`flex-1 items-center justify-center py-3 rounded-xl gap-1.5 h-auto ${active
        ? "bg-primary-600"
        : "bg-surface-100 dark:bg-surface-700/50"
        }`}
    >
      {icon}
      <Text className={`text-[10px] font-bold uppercase tracking-wider ${active ? "text-white" : "text-surface-500 dark:text-white"}`}>
        {label}
      </Text>
    </Button>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      {icon}
      <Text className="text-surface-500 dark:text-surface-300 text-xs font-bold uppercase tracking-widest">
        {title}
      </Text>
    </View>
  );
}

// ── Album Picker Modal (self-contained) ──

function AlbumPickerModal({
  visible,
  onClose,
  albums,
  onSelect,
  onBrowseFolder,
  currentAlbumName,
}: {
  visible: boolean;
  onClose: () => void;
  albums: MediaLibrary.Album[];
  onSelect: (id: string | null, name: string | null) => void;
  onBrowseFolder: () => void;
  currentAlbumName: string | null;
}) {
  return (
    <BottomSheetModal open={visible} onOpenChange={onClose} fullScreen>
      <View className="px-6 pt-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
        <View>
          <Text className="text-black dark:text-white text-xl font-bold">Select Source</Text>
          <Text className="text-surface-500 dark:text-surface-300 text-xs mt-1">
            Choose where your screenshots are saved
          </Text>
        </View>
      </View>

      <ScrollView className="p-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Auto Option */}
        <Button
          variant="outline"
          onPress={() => onSelect(null, null)}
          className={`flex-row items-center justify-start gap-4 p-4 rounded-2xl mb-2 h-auto ${!currentAlbumName
            ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-500/50"
            : "bg-surface-50 dark:bg-surface-700/50 border-surface-100 dark:border-transparent"
            }`}
        >
          <View className="w-12 h-12 rounded-xl bg-primary-600 dark:bg-primary-700 items-center justify-center">
            <Settings2 size={24} color="#fff" strokeWidth={2} />
          </View>
          <View className="flex-1 items-start">
            <Text className="text-black dark:text-white font-bold">Automatic Detection</Text>
            <Text className="text-surface-500 dark:text-surface-300 text-xs">
              Recommended for most devices
            </Text>
          </View>
          {!currentAlbumName && (
            <View className="w-3 h-3 rounded-full bg-primary-500" />
          )}
        </Button>

        {/* Browse Folders */}
        <Text className="text-surface-500 dark:text-white text-[10px] font-bold uppercase tracking-widest px-2 py-3">
          Browse Files
        </Text>
        <Button
          variant="outline"
          onPress={onBrowseFolder}
          className={`flex-row items-center justify-start gap-4 p-4 rounded-2xl mb-2 h-auto ${currentAlbumName?.startsWith("📁")
            ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-500/50"
            : "bg-surface-50 dark:bg-surface-700/50 border-surface-100 dark:border-transparent"
            }`}
        >
          <View className="w-12 h-12 rounded-xl bg-amber-600/10 dark:bg-amber-700/30 items-center justify-center">
            <FolderInput size={24} color="#f59e0b" strokeWidth={2} />
          </View>
          <View className="flex-1 items-start">
            <Text className="text-black dark:text-white font-bold">Browse Device Folders</Text>
            <Text className="text-surface-500 dark:text-surface-300 text-xs text-left">
              Select any folder on your device
            </Text>
          </View>
          <ChevronRight size={18} color="#868e96" />
        </Button>

        {/* Device Albums */}
        <Text className="text-surface-500 dark:text-white text-[10px] font-bold uppercase tracking-widest px-2 py-3">
          Device Albums
        </Text>
        {albums.map((album) => {
          const isSelected = currentAlbumName === album.title;
          return (
            <Button
              key={album.id}
              variant="outline"
              onPress={() => onSelect(album.id, album.title)}
              className={`flex-row items-center justify-start gap-4 p-4 rounded-2xl mb-2 h-auto ${isSelected
                ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-500/50"
                : "bg-surface-50 dark:bg-surface-700/50 border-surface-100 dark:border-transparent"
                }`}
            >
              <View className="w-12 h-12 rounded-xl bg-surface-100 dark:bg-surface-600 items-center justify-center">
                <ImageIcon size={24} color="#868e96" strokeWidth={1.5} />
              </View>
              <View className="flex-1 items-start">
                <Text
                  className={`font-bold ${isSelected ? "text-primary-600 dark:text-primary-400" : "text-black dark:text-white"
                    }`}
                >
                  {album.title}
                </Text>
                <Text className="text-surface-500 dark:text-surface-300 text-xs">
                  {album.assetCount} items
                </Text>
              </View>
              <ChevronRight size={18} color="#868e96" />
            </Button>
          );
        })}
      </ScrollView>
    </BottomSheetModal>
  );
}
