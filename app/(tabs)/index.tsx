import { SearchBar } from "@/components/search-bar";
import { SelectionToolbar } from "@/components/selection-toolbar";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  ViewTypeSwitcher,
  loadViewType,
  saveViewType,
  type ViewType,
} from "@/components/view-type-switcher";
import { useMultiSelect } from "@/hooks/use-multi-select";
import {
  assignToFolder,
  createFolder,
  getFolders,
  getScreenshotCount,
  getTags,
  markAsDeleted,
  restoreScreenshot,
  searchScreenshots,
  toggleFavorite,
  type FolderRow,
  type ScreenshotRow,
  type SearchFilter,
  type SortOption,
  type TagRow
} from "@/lib/database";
import {
  refreshUnprocessedCount,
  syncScreenshots,
} from "@/lib/screenshot-monitor";
import { useAppStore } from "@/lib/store";
import { getRelativeTime } from "@/lib/utils";
import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  CheckSquare,
  ChevronDown,
  X as CloseIcon,
  FolderInput as FolderIcon,
  FolderTree,
  Heart,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  View,
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

// Grid config
const GRID_COLUMNS = 3;
const GRID_GAP = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS + 1)) / GRID_COLUMNS;

const PAGE_SIZE = 100;

export default function InboxScreen() {
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<ScreenshotRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewType, setViewType] = useState<ViewType>("grid");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Remove sourceGroups, it's now derived from screenshots in PathView
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalScreenshots, setTotalScreenshots] = useState(0);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<SearchFilter>("inbox");
  const [activeSort, setActiveSort] = useState<SortOption>("newest");
  const [tags, setTags] = useState<TagRow[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const router = useRouter();

  const isImporting = useAppStore((s) => s.isImporting);
  const dbRevision = useAppStore((s) => s.databaseRevision);
  const selectedAlbumName = useAppStore((s) => s.selectedAlbumName);
  const monitorSources = useAppStore((s) => s.monitorSources);

  const {
    selectedIds,
    isSelectMode,
    toggleSelect,
    selectAll,
    deselectAll,
    isSelected,
    selectedCount,
  } = useMultiSelect();

  // Load persisted view type
  useEffect(() => {
    loadViewType().then(setViewType);
  }, []);

  const handleViewTypeChange = useCallback((type: ViewType) => {
    setViewType(type);
    saveViewType(type);
    deselectAll();
  }, [deselectAll]);



  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fData, sData, tData, count] = await Promise.all([
        getFolders(),
        searchScreenshots({
          query: searchQuery,
          filter: activeFilter,
          sort: activeSort,
          tagId: selectedTagId || undefined,
          limit: PAGE_SIZE,
          offset: 0,
        }),
        getTags(),
        getScreenshotCount({
          query: searchQuery,
          filter: activeFilter,
          tagId: selectedTagId || undefined,
        }),
      ]);
      setFolders(fData);
      setScreenshots(sData);
      setTags(tData);
      setTotalScreenshots(count);
      setHasMore(sData.length >= PAGE_SIZE && sData.length < count);

    } catch (err) {
      console.error("[Inbox] Load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, activeFilter, activeSort, selectedTagId, monitorSources, viewType]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return;
    setIsLoadingMore(true);
    try {
      const moreData = await searchScreenshots({
        query: searchQuery,
        filter: activeFilter,
        sort: activeSort,
        tagId: selectedTagId || undefined,
        limit: PAGE_SIZE,
        offset: screenshots.length,
      });
      if (moreData.length < PAGE_SIZE) {
        setHasMore(false);
      }
      if (moreData.length > 0) {
        setScreenshots((prev) => [...prev, ...moreData]);
      }
      setHasMore(screenshots.length + moreData.length < totalScreenshots);
    } catch (err) {
      console.error("[Inbox] Load more error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, isLoading, searchQuery, activeFilter, activeSort, selectedTagId, screenshots.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [dbRevision, isImporting]);

  const currentScreenshot = screenshots[currentIndex];

  // ── Single-item actions (for swipe view) ──

  const handleAssignToFolder = useCallback(
    async (folderId: number) => {
      if (isSelectMode) {
        // Batch assign
        for (const id of selectedIds) {
          await assignToFolder(id, folderId);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        deselectAll();
      } else if (currentScreenshot) {
        await assignToFolder(currentScreenshot.id, folderId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setShowFolderPicker(false);
      const remaining = isSelectMode
        ? screenshots.filter((s) => !selectedIds.has(s.id))
        : screenshots.filter((s) => s.id !== currentScreenshot?.id);
      setScreenshots(remaining);
      setCurrentIndex(0);
      await refreshUnprocessedCount();
    },
    [currentScreenshot, screenshots, isSelectMode, selectedIds, deselectAll]
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      const colors = ["#5c7cfa", "#748ffc", "#4dabf7", "#66d9e8", "#51cf66", "#94d82d", "#ffd43b", "#ff922b", "#ff6b6b", "#e599f7", "#cc5de8", "#845ef7"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const newId = await createFolder(newFolderName.trim(), randomColor);
      setNewFolderName("");
      setIsCreatingFolder(false);
      // Automatically assign to the newly created folder
      await handleAssignToFolder(Number(newId));
    } catch (err) {
      console.error("[Inbox] Create folder error:", err);
    }
  }, [newFolderName, handleAssignToFolder]);

  const handleDelete = useCallback(async () => {
    if (isSelectMode || currentScreenshot) {
      setConfirmDelete(true);
    }
  }, [isSelectMode, currentScreenshot]);

  const confirmDeleteAction = useCallback(async () => {
    if (isSelectMode) {
      for (const id of Array.from(selectedIds)) {
        await markAsDeleted(id);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const remaining = screenshots.filter((s) => !selectedIds.has(s.id));
      setScreenshots(remaining);
      deselectAll();
    } else if (currentScreenshot) {
      await markAsDeleted(currentScreenshot.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setLastDeleted(currentScreenshot);
      const remaining = screenshots.filter((s) => s.id !== currentScreenshot.id);
      setScreenshots(remaining);
    }
    setCurrentIndex(0);
    useAppStore.getState().incrementDeleted();
    await refreshUnprocessedCount();
    setConfirmDelete(false);
  }, [isSelectMode, selectedIds, currentScreenshot, screenshots, deselectAll]);

  const handleFavorite = useCallback(async () => {
    if (isSelectMode) {
      for (const id of selectedIds) {
        await toggleFavorite(id);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deselectAll();
      await loadData();
    } else if (currentScreenshot) {
      await toggleFavorite(currentScreenshot.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (currentIndex < screenshots.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else if (screenshots.length > 1) {
        setCurrentIndex(0);
      }
    }
  }, [currentScreenshot, currentIndex, screenshots.length, isSelectMode, selectedIds, deselectAll, loadData]);

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

  const handleSelectAll = useCallback(() => {
    selectAll(screenshots.map((s) => s.id));
  }, [screenshots, selectAll]);

  // ── Loading state ──
  if (isLoading && screenshots.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-surface-500 dark:text-white text-lg">
            {isImporting ? "Scanning for screenshots..." : "Loading..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty state ──
  if (screenshots.length === 0) {
    const hasAnySource = monitorSources.length > 0;

    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-3xl bg-primary-100 dark:bg-primary-900/30 items-center justify-center mb-6">
            <Icon as={hasAnySource ? Sparkles : FolderIcon} className="text-primary-500" size={40} />
          </View>
          <Text className="text-black dark:text-white text-2xl font-bold text-center mb-2">
            {hasAnySource ? "Inbox Zero! 🎉" : "Welcome to ScreenVault"}
          </Text>
          <Text className="text-surface-500 dark:text-white text-base text-center mb-8">
            {hasAnySource
              ? (selectedAlbumName ? `Source: ${selectedAlbumName}` : "All screenshots have been organized.")
              : "To get started, select a folder or album for ScreenVault to monitor."
            }
          </Text>

          {hasAnySource ? (
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
          ) : (
            <Button
              onPress={() => router.push("/settings")}
              size="lg"
              className="rounded-2xl flex-row items-center justify-center gap-2 w-full max-w-xs"
            >
              <Icon as={Plus} className="text-white" size={18} strokeWidth={2} />
              <Text className="text-white font-bold text-base">
                Select a Source
              </Text>
            </Button>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
      {/* Header */}
      <View className="px-6 pt-2 pb-3 flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-black dark:text-white text-2xl font-bold">Inbox</Text>
          <Text className="text-surface-500 dark:text-white text-sm mt-0.5">
            {isSelectMode
              ? `${selectedCount} selected`
              : `${screenshots.length} of ${totalScreenshots} loaded`}
            {!isSelectMode && hasMore && (
              <Text className="text-primary-500 font-bold ml-1"> • Scroll for more</Text>
            )}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {!isSelectMode && (
            <Button
              variant="ghost"
              size="icon"
              onPress={() => setIsSearchOpen(true)}
              className="h-10 w-10 rounded-full"
            >
              <Icon as={Search} className="text-foreground" size={20} />
            </Button>
          )}

          {/* Select All (only in grid/list) */}
          {viewType !== "swipe" && !isSelectMode && (
            <Button
              variant="ghost"
              size="icon"
              onPress={handleSelectAll}
              className="rounded-full bg-surface-100 dark:bg-surface-800 h-9 w-9"
            >
              <Icon as={CheckSquare} className="text-muted-foreground" size={18} strokeWidth={2} />
            </Button>
          )}

          {/* View Toggle */}
          <ViewTypeSwitcher value={viewType} onChange={handleViewTypeChange} />

          {/* Sync */}
          <Button
            variant="ghost"
            size="icon"
            onPress={handleSync}
            className="rounded-full bg-surface-100 dark:bg-surface-800 h-9 w-9"
          >
            <Icon as={RefreshCcw} className="text-muted-foreground" size={16} strokeWidth={2} />
          </Button>
        </View>
      </View>

      {/* Search Bar Overlay */}
      {isSearchOpen && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          filter={activeFilter}
          onFilterChange={setActiveFilter}
          sort={activeSort}
          onSortChange={setActiveSort}
          onClose={() => {
            setIsSearchOpen(false);
            setSearchQuery("");
            setActiveFilter("inbox");
            setSelectedTagId(null);
          }}
          tags={tags}
          selectedTagId={selectedTagId}
          onTagChange={setSelectedTagId}
        />
      )}
      {/* ── View Content ── */}
      {viewType === "grid" && (
        <GridView
          screenshots={screenshots}
          isSelectMode={isSelectMode}
          isSelected={isSelected}
          toggleSelect={toggleSelect}
          onLoadMore={loadMore}
          isLoadingMore={isLoadingMore}
        />
      )}

      {viewType === "path" && (
        <PathView
          screenshots={screenshots}
          monitorSources={monitorSources}
          isSelectMode={isSelectMode}
          isSelected={isSelected}
          toggleSelect={toggleSelect}
          onLoadMore={loadMore}
          isLoadingMore={isLoadingMore}
        />
      )}

      {viewType === "list" && (
        <ListView
          screenshots={screenshots}
          isSelectMode={isSelectMode}
          isSelected={isSelected}
          toggleSelect={toggleSelect}
          onLoadMore={loadMore}
          isLoadingMore={isLoadingMore}
          onDelete={async (id) => {
            await markAsDeleted(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setScreenshots((prev) => prev.filter((s) => s.id !== id));
            await refreshUnprocessedCount();
          }}
          onFavorite={async (id) => {
            await toggleFavorite(id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await loadData();
          }}
          onOrganize={(id) => {
            if (!isSelectMode) {
              toggleSelect(id);
            }
            setShowFolderPicker(true);
          }}
        />
      )}

      {viewType === "swipe" && (
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

          {/* Swipe action buttons */}
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
      )}

      {/* ── Selection Toolbar (Grid/List modes) ── */}
      {isSelectMode && viewType !== "swipe" && (
        <SelectionToolbar
          count={selectedCount}
          onDelete={handleDelete}
          onFavorite={handleFavorite}
          onOrganize={() => setShowFolderPicker(true)}
          onCancel={deselectAll}
        />
      )}

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
      <BottomSheetModal open={showFolderPicker} onOpenChange={(open) => {
        setShowFolderPicker(open);
        if (!open) {
          setIsCreatingFolder(false);
          setNewFolderName("");
        }
        if (!open && isSelectMode && viewType !== "swipe") {
          // Don't deselect when closing — user might want to pick another action
        }
      }}>
        <View className="p-6 pb-4 flex-row items-center justify-between border-b border-surface-100 dark:border-surface-700">
          <Text className="text-black dark:text-white text-xl font-bold">
            {isSelectMode ? `Assign ${selectedCount} to Folder` : "Assign to Folder"}
          </Text>
        </View>
        <View className="p-6 pb-12">
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

          {folders.length === 0 && !isCreatingFolder ? (
            <Text className="text-surface-500 dark:text-white text-center py-10 text-base">
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

      <ConfirmationModal
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={confirmDeleteAction}
        title="Move to Trash"
        message={isSelectMode
          ? `Are you sure you want to move ${selectedIds.size} screenshots to the trash?`
          : "Are you sure you want to move this screenshot to the trash?"
        }
        confirmLabel="Move to Trash"
      />
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════
// ── Grid View ──
// ══════════════════════════════════════════════════

function GridView({
  screenshots,
  isSelectMode,
  isSelected,
  toggleSelect,
  onLoadMore,
  isLoadingMore,
}: {
  screenshots: ScreenshotRow[];
  isSelectMode: boolean;
  isSelected: (id: number) => boolean;
  toggleSelect: (id: number) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}) {
  const router = useRouter();
  const renderItem = useCallback(
    ({ item, index }: { item: ScreenshotRow; index: number }) => {
      const selected = isSelected(item.id);
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
          onLongPress={() => toggleSelect(item.id)}
          style={{
            width: GRID_ITEM_SIZE,
            height: GRID_ITEM_SIZE,
            margin: GRID_GAP / 2,
          }}
        >
          <Image
            source={{ uri: item.editedUri ?? item.uri }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 4,
              borderWidth: selected ? 3 : 0,
              borderColor: "#5c7cfa",
            }}
            contentFit="cover"
          />
          {selected && (
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
          )}
          {item.isFavorite ? (
            <View style={{ position: "absolute", bottom: 4, right: 4 }}>
              <Icon as={Heart} className="text-accent-amber" size={14} fill="#ffd43b" strokeWidth={0} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [isSelectMode, isSelected, toggleSelect, screenshots, router]
  );

  return (
    <FlashList
      data={screenshots}
      renderItem={renderItem}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id.toString()}
      contentContainerStyle={{ padding: GRID_GAP / 2 }}
      // @ts-ignore
      estimatedItemSize={GRID_ITEM_SIZE}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={() => (
        isLoadingMore ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color="#5c7cfa" />
          </View>
        ) : <View className="h-20" />
      )}
    />
  );
}
// ══════════════════════════════════════════════════
// ── Path View (Grouped by Source) ──
// ══════════════════════════════════════════════════

function PathView({
  screenshots,
  monitorSources,
  isSelectMode,
  isSelected,
  toggleSelect,
  onLoadMore,
  isLoadingMore,
}: {
  screenshots: ScreenshotRow[];
  monitorSources: import("@/lib/store").MonitorSource[];
  isSelectMode: boolean;
  isSelected: (id: number) => boolean;
  toggleSelect: (id: number) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}) {
  const router = useRouter();
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());

  // Extract directory path from URI
  const getDirectoryPath = useCallback((item: ScreenshotRow) => {
    const sType = (item as any).sourceType;
    if (sType === 'album') return item.sourceId || 'Unknown Album';

    // For SAF folders, extract the parent path from the URI
    try {
      const uri = item.uri;
      if (!uri) return item.sourceId || '__unsorted__';
      const decoded = decodeURIComponent(uri);
      const parts = decoded.split('/');
      parts.pop(); // Remove filename
      const parentPath = parts.join('/');

      return parentPath || item.sourceId || '__unsorted__';
    } catch {
      return (item as any).sourceId || '__unsorted__';
    }
  }, []);

  const sourceGroups = useMemo(() => {
    const groups: Map<string, ScreenshotRow[]> = new Map();
    screenshots.forEach(s => {
      const dir = getDirectoryPath(s);
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir)!.push(s);
    });
    return Array.from(groups.entries()).map(([sourceId, screenshots]) => ({
      sourceId,
      screenshots
    }));
  }, [screenshots, getDirectoryPath]);

  const toggleCollapse = useCallback((sourceId: string) => {
    setCollapsedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }, []);

  const getSourceDisplayName = (sourceId: string | null): string => {
    if (!sourceId || sourceId === '__unsorted__') return 'Unsorted';
    // Try to find the source in monitor sources
    const source = monitorSources.find(s => s.id === sourceId || s.uri === sourceId);
    if (source) return source.name;
    // Fall back to decoding the URI
    try {
      const decoded = decodeURIComponent(sourceId);
      const pathPart = decoded.split("/tree/")[1] || decoded;
      const colonIndex = pathPart.indexOf(":");
      return colonIndex >= 0 ? pathPart.substring(colonIndex + 1) : pathPart;
    } catch {
      return sourceId;
    }
  };

  const getSourceType = (sourceId: string | null): 'folder' | 'album' | 'unknown' => {
    if (!sourceId || sourceId === '__unsorted__') return 'unknown';
    const source = monitorSources.find(s => s.id === sourceId || s.uri === sourceId);
    return (source?.type as any) || 'unknown';
  };

  // Flatten all screenshots across groups for viewer navigation
  const allScreenshots = useMemo(() => sourceGroups.flatMap(g => g.screenshots), [sourceGroups]);

  // Flatten for FlashList: [ {type: 'header', ...}, {type: 'row', screenshots: [...]}, ... ]
  const flatData = useMemo(() => {
    const data: any[] = [];
    sourceGroups.forEach(group => {
      data.push({ type: 'header', ...group });
      if (!collapsedSources.has(group.sourceId)) {
        for (let i = 0; i < group.screenshots.length; i += GRID_COLUMNS) {
          data.push({
            type: 'row',
            screenshots: group.screenshots.slice(i, i + GRID_COLUMNS),
            groupId: group.sourceId
          });
        }
      }
    });
    return data;
  }, [sourceGroups, collapsedSources]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (item.type === 'header') {
      const sourceType = getSourceType(item.sourceId);
      const iconColor = sourceType === 'folder' ? '#3b82f6' : sourceType === 'album' ? '#8b5cf6' : '#868e96';
      const isCollapsed = collapsedSources.has(item.sourceId);

      return (
        <Pressable
          onPress={() => toggleCollapse(item.sourceId)}
          className="flex-row items-center px-4 py-3 bg-surface-50 dark:bg-surface-800/50"
        >
          <View
            className="w-8 h-8 rounded-lg items-center justify-center mr-3"
            style={{ backgroundColor: iconColor + '18' }}
          >
            <FolderTree size={16} color={iconColor} />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-black dark:text-white font-bold text-sm" numberOfLines={1}>
              {getSourceDisplayName(item.sourceId)}
            </Text>
            <Text className="text-surface-400 dark:text-white text-[11px]">
              {item.screenshots.length} image{item.screenshots.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={{ transform: [{ rotate: isCollapsed ? '-90deg' : '0deg' }] }}>
            <ChevronDown size={18} color="#868e96" />
          </View>
        </Pressable>
      );
    }

    // Row of images
    return (
      <View className="flex-row" style={{ paddingHorizontal: GRID_GAP / 2 }}>
        {item.screenshots.map((img: ScreenshotRow) => {
          const selected = isSelected(img.id);
          const globalIndex = allScreenshots.findIndex(s => s.id === img.id);
          return (
            <Pressable
              key={img.id}
              onPress={() => {
                if (isSelectMode) {
                  toggleSelect(img.id);
                } else {
                  router.push({
                    pathname: "/viewer",
                    params: {
                      ids: allScreenshots.map(s => s.id).join(","),
                      index: globalIndex.toString(),
                    },
                  });
                }
              }}
              onLongPress={() => toggleSelect(img.id)}
              style={{
                width: GRID_ITEM_SIZE,
                height: GRID_ITEM_SIZE,
                margin: GRID_GAP / 2,
              }}
            >
              <Image
                source={{ uri: img.editedUri ?? img.uri }}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 4,
                  borderWidth: selected ? 3 : 0,
                  borderColor: "#5c7cfa",
                }}
                contentFit="cover"
              />
              {selected && (
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
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }, [collapsedSources, isSelectMode, isSelected, toggleSelect, allScreenshots, router, getSourceDisplayName, getSourceType, toggleCollapse]);

  return (
    <FlashList
      data={flatData}
      renderItem={renderItem}
      keyExtractor={(item, index) => item.type === 'header' ? `h-${item.sourceId}` : `r-${item.groupId}-${index}`}
      // @ts-ignore
      estimatedItemSize={GRID_ITEM_SIZE}
      contentContainerStyle={{ paddingBottom: 100 }}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={() => (
        isLoadingMore ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color="#5c7cfa" />
          </View>
        ) : <View className="h-20" />
      )}
    />
  );
}

// ══════════════════════════════════════════════════
// ── List View ──
// ══════════════════════════════════════════════════

function ListView({
  screenshots,
  isSelectMode,
  isSelected,
  toggleSelect,
  onLoadMore,
  isLoadingMore,
  onDelete,
  onFavorite,
  onOrganize,
}: {
  screenshots: ScreenshotRow[];
  isSelectMode: boolean;
  isSelected: (id: number) => boolean;
  toggleSelect: (id: number) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onDelete: (id: number) => void;
  onFavorite: (id: number) => void;
  onOrganize: (id: number) => void;
}) {
  const router = useRouter();
  const renderItem = useCallback(
    ({ item, index }: { item: ScreenshotRow; index: number }) => {
      const selected = isSelected(item.id);
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
          onLongPress={() => toggleSelect(item.id)}
          className={`flex-row items-center px-4 py-2.5 gap-3 ${selected ? "bg-primary-500/10" : ""
            }`}
        >
          {/* Selection indicator */}
          {isSelectMode && (
            <View
              className={`w-5 h-5 rounded-full border-2 items-center justify-center ${selected
                ? "bg-primary-500 border-primary-500"
                : "border-surface-300 dark:border-surface-600"
                }`}
            >
              {selected && (
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>✓</Text>
              )}
            </View>
          )}

          {/* Thumbnail */}
          <Image
            source={{ uri: item.editedUri ?? item.uri }}
            style={{
              width: 52,
              height: 52,
              borderRadius: 10,
            }}
            contentFit="cover"
          />

          {/* Info */}
          <View className="flex-1 min-w-0">
            <Text
              className="text-black dark:text-white font-semibold text-sm"
              numberOfLines={1}
            >
              {item.filename}
            </Text>
            <Text className="text-surface-500 dark:text-white text-xs mt-0.5">
              {getRelativeTime(new Date(item.createdAt))}
              {item.isFavorite ? "  ★" : ""}
            </Text>
          </View>

          {/* Quick actions (only when NOT in select mode) */}
          {!isSelectMode && (
            <View className="flex-row items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onPress={() => onOrganize(item.id)}
                className="h-8 w-8 rounded-lg"
              >
                <Icon as={FolderIcon} className="text-accent-green" size={16} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => onFavorite(item.id)}
                className="h-8 w-8 rounded-lg"
              >
                <Icon as={Heart} className="text-accent-amber" size={16} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => onDelete(item.id)}
                className="h-8 w-8 rounded-lg"
              >
                <Icon as={Trash2} className="text-destructive" size={16} strokeWidth={2} />
              </Button>
            </View>
          )}
        </Pressable>
      );
    },
    [isSelectMode, isSelected, toggleSelect, onDelete, onFavorite, onOrganize, screenshots, router]
  );

  return (
    <FlashList
      data={screenshots}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      // @ts-ignore
      estimatedItemSize={100}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={() => (
        isLoadingMore ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color="#5c7cfa" />
          </View>
        ) : <View className="h-20" />
      )}
      ItemSeparatorComponent={() => (
        <View className="h-[1px] bg-surface-100 dark:bg-surface-800 mx-4" />
      )}
    />
  );
}

// ══════════════════════════════════════════════════
// ── Swipe Card Component ──
// ══════════════════════════════════════════════════

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
      translateY.value = Math.min(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH * 1.5, { duration: 300 });
        scale.value = withTiming(0.8, { duration: 300 });
        runOnJS(onSwipeLeft)();
        return;
      }
      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        runOnJS(onSwipeRight)();
        return;
      }
      if (event.translationY < -SWIPE_THRESHOLD) {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        runOnJS(onSwipeUp)();
        return;
      }
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
