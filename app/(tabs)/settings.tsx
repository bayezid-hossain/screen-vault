import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Text } from "@/components/ui/text";
import {
  getScreenshotCountBySource,
  getStats,
  type ScreenshotImportData
} from "@/lib/database";
import {
  addMonitorSource,
  checkSourceOverlap,
  getAllAlbumsWithAssets,
  importSourceData,
  previewSAFFolder,
  removeMonitorSource,
  saveThemeSetting,
  selectDeviceFolder,
  syncScreenshots,
  toggleMonitorSourceRecursion,
  setScanHiddenFolders,
} from "@/lib/screenshot-monitor";
import { useAppStore, type MonitorSource } from "@/lib/store";
import Constants from "expo-constants";
import * as MediaLibrary from "expo-media-library";
import { useFocusEffect } from "expo-router";
import {
  Check,
  ChevronRight,
  FolderInput,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Layers,
  Monitor,
  Moon,
  RefreshCcw,
  Settings2,
  Sun,
  Trash2,
  Zap
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

export default function SettingsScreen() {
  const monitorSources = useAppStore((s) => s.monitorSources);
  const isImporting = useAppStore((s) => s.isImporting);
  const lastSyncTimestamp = useAppStore((s) => s.lastSyncTimestamp);
  const theme = useAppStore((s) => s.theme);
  const scanHiddenFolders = useAppStore((s) => s.scanHiddenFolders);

  const [totalScreenshots, setTotalScreenshots] = useState(0);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [deviceAlbums, setDeviceAlbums] = useState<MediaLibrary.Album[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
  const [confirmRemoveSource, setConfirmRemoveSource] = useState<string | null>(null);
  const [removeSourceCount, setRemoveSourceCount] = useState(0);

  // New folder selection state
  // New folder selection state
  const [scanningSources, setScanningSources] = useState<Record<string, boolean>>({});
  const [importingSources, setImportingSources] = useState<Record<string, boolean>>({});
  const [sourceCounts, setSourceCounts] = useState<Record<string, number | null>>({});
  const [pendingScanData, setPendingScanData] = useState<Record<string, ScreenshotImportData[]>>({});
  const [confirmRecursionToggle, setConfirmRecursionToggle] = useState<{ idOrUri: string; currentRecursive: boolean } | null>(null);
  const [confirmedSources, setConfirmedSources] = useState<Set<string>>(new Set());

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
      if (albumId && albumName) {
        const newSource: import("@/lib/store").MonitorSource = { id: albumId, name: albumName, type: "album" };
        await addMonitorSource(newSource, true);
        handleScanSource(newSource);
      }
      setShowAlbumPicker(false);
    },
    []
  );

  const handleBrowseDeviceFolder = useCallback(async () => {
    const result = await selectDeviceFolder();
    if (result) {
      const overlap = checkSourceOverlap(result.uri, false);
      if (overlap.status === 'overlap') {
        Alert.alert("Folder Already Covered", overlap.message);
        return;
      }

      const newSource: import("@/lib/store").MonitorSource = {
        id: null,
        name: result.name,
        uri: result.uri,
        type: "folder",
        recursive: false
      };
      await addMonitorSource(newSource, true);
      handleScanSource(newSource);
      setShowAlbumPicker(false);
    }
  }, []);

  const handleScanSource = useCallback(async (source: import("@/lib/store").MonitorSource) => {
    const sourceId = (source.id || source.uri)!;
    setScanningSources(prev => ({ ...prev, [sourceId]: true }));
    try {
      let results: import("@/lib/database").ScreenshotImportData[] = [];
      if (source.type === "folder" && source.uri) {
        results = await previewSAFFolder(source.uri, !!source.recursive, (progCount) => {
          setSourceCounts(prev => ({ ...prev, [sourceId]: progCount }));
        });
      } else {
        // For albums we can still just get the count for preview, 
        // but we'll import them during confirmation if we want it instant.
        // Actually, let's keep albums simple for now as MediaLibrary is already fast.
        const assets = await MediaLibrary.getAssetsAsync({
          album: source.id || undefined,
          mediaType: [MediaLibrary.MediaType.photo],
          first: 1,
        });
        setSourceCounts(prev => ({ ...prev, [sourceId]: assets.totalCount }));
        return;
      }

      const count = results.length;
      setSourceCounts(prev => ({ ...prev, [sourceId]: count }));
      setPendingScanData(prev => ({ ...prev, [sourceId]: results }));

      // Reset confirmation if results are found so the user can re-confirm the new files
      setConfirmedSources(prev => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
    } catch (err) {
      console.error("[Settings] Scan error:", err);
    } finally {
      setScanningSources(prev => ({ ...prev, [sourceId]: false }));
    }
  }, []);

  const handleConfirmImport = useCallback(async (idOrUri: string) => {
    setImportingSources(prev => ({ ...prev, [idOrUri]: true }));
    try {
      // Use pending data for instant import if available
      const pendingData = pendingScanData[idOrUri];
      if (pendingData && pendingData.length > 0) {
        await importSourceData(pendingData);
      } else {
        await syncScreenshots();
      }

      setConfirmedSources(prev => new Set(prev).add(idOrUri));
      Alert.alert("Success", "Images added to your vault!");
    } catch (err) {
      console.error("[Settings] Import error:", err);
      Alert.alert("Error", "Failed to import images.");
    } finally {
      setImportingSources(prev => ({ ...prev, [idOrUri]: false }));
    }
  }, [pendingScanData]);

  const handleRemoveSource = useCallback(async (idOrUri: string) => {
    const count = await getScreenshotCountBySource(idOrUri);
    setRemoveSourceCount(count);
    setConfirmRemoveSource(idOrUri);
  }, []);

  const handleToggleRecursion = useCallback((idOrUri: string, currentRecursive: boolean) => {
    setConfirmRecursionToggle({ idOrUri, currentRecursive });
  }, []);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? "1.0.0";

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
      <ScrollView className="flex-1 px-6 pt-2" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-black dark:text-white text-2xl font-bold mb-1">Settings</Text>
        <Text className="text-surface-500 dark:text-white text-sm mb-6">
          Configure how ScreenVault works
        </Text>

        {/* ── Screenshot Sources ── */}
        <SectionHeader icon={<FolderOpen size={16} color="#5c7cfa" />} title="Screenshot Sources" />
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl overflow-hidden mb-6 border border-surface-100 dark:border-transparent p-2">

          <View className="h-[1px] bg-surface-100 dark:bg-surface-700 mx-3 my-1" />

          {/* Scan Hidden Folders Toggle */}
          <View className="p-1">
            <Pressable
              onPress={() => setScanHiddenFolders(!scanHiddenFolders)}
              className={`flex-row items-center justify-between p-3 rounded-xl ${scanHiddenFolders ? "bg-primary-500/10 dark:bg-primary-500/20" : ""}`}
            >
              <View className="flex-row items-center gap-3 flex-1">
                <View className="w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-700 items-center justify-center">
                  <Layers size={16} color="#868e96" />
                </View>
                <View className="flex-1">
                  <Text className="text-black dark:text-white font-semibold text-sm">Scan Hidden Folders</Text>
                  <Text className="text-surface-500 dark:text-white text-[10px]">
                    {scanHiddenFolders ? "Including folders starting with '.'" : "Skipping hidden system/app folders"}
                  </Text>
                </View>
              </View>
              <View className={`w-4 h-4 rounded-full ${scanHiddenFolders ? "bg-primary-500" : "border-2 border-surface-300 dark:border-surface-600"}`} />
            </Pressable>
          </View>

          {monitorSources.length > 0 && <View className="h-[1px] bg-surface-100 dark:bg-surface-700 mx-3 my-1" />}

          <View className="gap-3">
            {monitorSources.map((source) => {
              const sourceId = (source.id || source.uri)!;
              return (
                <SourceCard
                  key={sourceId}
                  source={source}
                  sourceId={sourceId}
                  isScanning={!!scanningSources[sourceId]}
                  isImporting={!!importingSources[sourceId]}
                  count={sourceCounts[sourceId] ?? null}
                  isConfirmed={confirmedSources.has(sourceId)}
                  onRemove={() => handleRemoveSource(sourceId)}
                  onToggleRecursion={() => handleToggleRecursion(sourceId, !!source.recursive)}
                  onConfirmImport={() => handleConfirmImport(sourceId)}
                  onRescan={() => handleScanSource(source)}
                />
              );
            })}
          </View>

          <Button
            variant="ghost"
            onPress={handleOpenAlbumPicker}
            className="flex-row items-center justify-center gap-2 mt-2 p-3 bg-primary-500/10 rounded-xl h-auto"
          >
            <FolderInput size={18} color="#5c7cfa" />
            <Text className="text-primary-600 dark:text-primary-400 font-bold text-sm">
              Add Another Source
            </Text>
          </Button>

          <View className="h-[1px] bg-surface-100 dark:bg-surface-700 mx-2 mt-2" />
          <View className="p-4 pt-3 flex-row items-center justify-between">
            <Text className="text-surface-500 dark:text-white text-[10px] uppercase tracking-wider">
              Last sync: {lastSyncDisplay}
            </Text>
            {isImporting && (
              <Text className="text-primary-500 text-[10px] font-bold animate-pulse">
                SYNCING...
              </Text>
            )}
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

        {/* About */}
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
        onClose={() => {
          setShowAlbumPicker(false);
        }}
        onBrowseFolder={handleBrowseDeviceFolder}
      />


      <ConfirmationModal
        visible={confirmRemoveSource !== null}
        onClose={() => setConfirmRemoveSource(null)}
        onConfirm={async () => {
          if (confirmRemoveSource) {
            await removeMonitorSource(confirmRemoveSource);
          }
        }}
        title="Remove Source"
        message={`Are you sure you want to stop monitoring this source? ${removeSourceCount > 0 ? `This will remove ${removeSourceCount} screenshot references from your vault.` : "Existing screenshot references will remain."}`}
        confirmLabel="Remove"
      />

      <ConfirmationModal
        visible={confirmRecursionToggle !== null}
        onClose={() => setConfirmRecursionToggle(null)}
        onConfirm={async () => {
          if (confirmRecursionToggle) {
            const idOrUri = confirmRecursionToggle.idOrUri;
            const isEnabling = !confirmRecursionToggle.currentRecursive;
            await toggleMonitorSourceRecursion(idOrUri, true);
            setConfirmRecursionToggle(null);

            if (isEnabling) {
              const updatedSource = useAppStore.getState().monitorSources.find(s => s.id === idOrUri || s.uri === idOrUri);
              if (updatedSource) handleScanSource(updatedSource);
            }
          }
        }}
        title={confirmRecursionToggle?.currentRecursive ? "Disable Recursion" : "Enable Recursion"}
        message={confirmRecursionToggle?.currentRecursive
          ? "This will stop scanning subdirectories and remove all images imported from them. The folder's main images will remain."
          : "This will scan all subdirectories for screenshots. This may take some time depending on the folder size."
        }
        confirmLabel={confirmRecursionToggle?.currentRecursive ? "Disable" : "Enable"}
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
      <Text className="text-surface-500 dark:text-white text-xs font-bold uppercase tracking-widest">
        {title}
      </Text>
    </View>
  );
}

// ── Album Picker Modal (self-contained) ──

function AlbumPickerModal({
  visible,
  onClose,
  onBrowseFolder,
}: {
  visible: boolean;
  onClose: () => void;
  onBrowseFolder: () => void;
}) {
  return (
    <BottomSheetModal open={visible} onOpenChange={onClose}>
      <View className="px-6 pt-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
        <View>
          <Text className="text-black dark:text-white text-xl font-bold">Select Source</Text>
          <Text className="text-surface-500 dark:text-white text-xs mt-1">
            Choose where your screenshots are saved
          </Text>
        </View>
      </View>

      <ScrollView className="p-4" contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Step 1: Browse Folders */}
        <Text className="text-surface-500 dark:text-white text-[10px] font-bold uppercase tracking-widest px-2 py-3">
          Action
        </Text>
        <Button
          variant="outline"
          onPress={onBrowseFolder}
          className={`flex-row items-center justify-start gap-4 p-4 rounded-2xl mb-6 h-auto bg-surface-50 dark:bg-surface-700/50 border-surface-100 dark:border-transparent`}
        >
          <View className="w-12 h-12 rounded-xl bg-amber-600/10 dark:bg-amber-700/30 items-center justify-center">
            <FolderInput size={24} color="#f59e0b" strokeWidth={2} />
          </View>
          <View className="flex-1 items-start">
            <Text className="text-black dark:text-white font-bold">Select Device Folder</Text>
            <Text className="text-surface-500 dark:text-white text-xs text-left">
              Choose a physical folder to monitor
            </Text>
          </View>
          <ChevronRight size={18} color="#868e96" />
        </Button>

        {/* Step 2: Info / Recursion Notice */}
        <View className="bg-primary-500/5 dark:bg-primary-500/10 p-5 rounded-2xl border border-primary-500/10">
          <View className="flex-row items-center gap-2 mb-2">
            <Info size={16} color="#5c7cfa" />
            <Text className="text-primary-700 dark:text-primary-300 font-bold text-xs uppercase tracking-wider">
              Helpful Information
            </Text>
          </View>
          <Text className="text-surface-600 dark:text-white text-xs leading-relaxed mb-3">
            By default, ScreenVault only scans the exact folder you choose.
          </Text>
          <View className="bg-white/50 dark:bg-black/20 p-3 rounded-xl">
            <Text className="text-surface-500 dark:text-white text-[11px] leading-relaxed">
              If your screenshots are in nested subdirectories, remember to enable <Text className="font-bold text-primary-600">"Recursive"</Text> on the source card after adding it.
            </Text>
          </View>
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}

// ── Circular Progress Indicator ──

function CircularProgress({
  size = 48,
  strokeWidth = 3,
  progress,
  color,
  isIndeterminate = false,
}: {
  size?: number;
  strokeWidth?: number;
  progress?: number; // 0–1
  color: string;
  isIndeterminate?: boolean;
}) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isIndeterminate) {
      const loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [isIndeterminate, spinAnim]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isIndeterminate
    ? circumference * 0.7
    : circumference * (1 - (progress ?? 0));

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: isIndeterminate ? spin : '0deg' }] }}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={0.15}
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    </Animated.View>
  );
}

// ── Professional Source Card ──

function SourceCard({
  source,
  sourceId,
  isScanning,
  isImporting,
  count,
  isConfirmed,
  onRemove,
  onToggleRecursion,
  onConfirmImport,
  onRescan,
}: {
  source: MonitorSource;
  sourceId: string;
  isScanning: boolean;
  isImporting: boolean;
  count: number | null;
  isConfirmed: boolean;
  onRemove: () => void;
  onToggleRecursion: () => void;
  onConfirmImport: () => void;
  onRescan: () => void;
}) {
  const isActive = isScanning || isImporting;
  const iconColor = source.type === 'folder' ? '#3b82f6' : '#8b5cf6';
  const iconBg = source.type === 'folder' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-purple-50 dark:bg-purple-900/20';

  const getStatusText = () => {
    if (isScanning) return `Scanning... ${count ?? 0} found`;
    if (isImporting) return `Importing ${count ?? 0} images...`;
    if (isConfirmed) return `${count ?? 0} images synced`;
    if (count !== null) return `${count} images found`;
    return 'Ready to scan';
  };

  const getStatusColor = () => {
    if (isScanning) return 'text-primary-600 dark:text-primary-400';
    if (isImporting) return 'text-green-600 dark:text-green-400';
    if (isConfirmed) return 'text-green-600 dark:text-green-400';
    return 'text-surface-500 dark:text-white';
  };

  return (
    <View
      className="bg-white dark:bg-surface-800 rounded-2xl overflow-hidden border border-surface-100 dark:border-surface-700/50"
      style={{ elevation: 2 }}
    >
      {/* Main content */}
      <View className="p-4">
        <View className="flex-row items-center gap-3">
          {/* Icon / Progress ring */}
          <View className="items-center justify-center" style={{ width: 48, height: 48 }}>
            {isActive ? (
              <View className="items-center justify-center" style={{ width: 48, height: 48 }}>
                <CircularProgress
                  size={48}
                  strokeWidth={3}
                  color={isImporting ? '#10b981' : '#5c7cfa'}
                  isIndeterminate={isScanning}
                  progress={isImporting ? 0.85 : undefined}
                />
                <View className="absolute items-center justify-center">
                  {isImporting ? (
                    <Check size={18} color="#10b981" />
                  ) : (
                    <Text className="text-primary-600 dark:text-primary-400 text-[10px] font-bold">{count ?? 0}</Text>
                  )}
                </View>
              </View>
            ) : (
              <View className={`w-12 h-12 rounded-2xl items-center justify-center ${iconBg}`}>
                {source.type === 'folder' ? (
                  <FolderOpen size={22} color={iconColor} />
                ) : (
                  <ImageIcon size={22} color={iconColor} />
                )}
              </View>
            )}
          </View>

          {/* Info */}
          <View className="flex-1 min-w-0">
            <Text className="text-black dark:text-white font-bold text-[15px]" numberOfLines={1}>
              {source.name}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              <View className={`px-1.5 py-0.5 rounded ${source.type === 'folder' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-purple-50 dark:bg-purple-900/20'}`}>
                <Text style={{ color: iconColor }} className="text-[9px] font-bold uppercase tracking-wider">
                  {source.type}
                </Text>
              </View>
              {source.type === 'folder' && (
                <View className={`px-1.5 py-0.5 rounded ${source.recursive ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-surface-100 dark:bg-surface-700'}`}>
                  <Text className={`text-[9px] font-bold uppercase tracking-wider ${source.recursive ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400 dark:text-white'}`}>
                    {source.recursive ? '● Deep Scan' : 'Direct'}
                  </Text>
                </View>
              )}
            </View>
            <Text className={`text-xs mt-1 font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </Text>
          </View>

          {/* Remove button */}
          <Pressable
            onPress={onRemove}
            className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/10 items-center justify-center"
            style={{ opacity: isActive ? 0.4 : 1 }}
            disabled={isActive}
          >
            <Trash2 size={14} color="#ef4444" />
          </Pressable>
        </View>
      </View>

      {/* Action bar */}
      <View className="flex-row items-center gap-2 px-4 pb-3 pt-0">
        {source.type === 'folder' && (
          <Pressable
            onPress={onToggleRecursion}
            disabled={isActive}
            className={`h-8 px-3 rounded-lg flex-row items-center gap-1.5 border ${source.recursive
              ? 'bg-primary-500 border-primary-500'
              : 'bg-transparent border-surface-200 dark:border-surface-600'
              }`}
            style={{ opacity: isActive ? 0.5 : 1 }}
          >
            <Layers size={12} color={source.recursive ? '#fff' : '#868e96'} />
            <Text className={`text-[11px] font-bold ${source.recursive ? 'text-white' : 'text-surface-500 dark:text-white'}`}>
              Recursive
            </Text>
          </Pressable>
        )}

        {!isActive && !isConfirmed && count === null && (
          <Pressable
            onPress={onRescan}
            className="h-8 px-3 rounded-lg flex-row items-center gap-1.5 border border-surface-200 dark:border-surface-600"
          >
            <RefreshCcw size={12} color="#868e96" />
            <Text className="text-surface-500 dark:text-white text-[11px] font-bold">Scan</Text>
          </Pressable>
        )}

        <View className="flex-1" />

        {!isConfirmed && count !== null && count > 0 && !isActive && (
          <Pressable
            onPress={onConfirmImport}
            className="h-8 px-4 rounded-lg bg-primary-500 flex-row items-center gap-1.5"
            style={{ elevation: 2 }}
          >
            <Check size={12} color="#fff" />
            <Text className="text-white text-[11px] font-bold">Add {count}</Text>
          </Pressable>
        )}

        {isConfirmed && !isActive && (
          <View className="h-8 px-3 rounded-lg bg-green-500/10 flex-row items-center gap-1.5">
            <Check size={12} color="#10b981" />
            <Text className="text-green-600 dark:text-green-400 text-[11px] font-bold">Synced</Text>
          </View>
        )}
      </View>
    </View>
  );
}
