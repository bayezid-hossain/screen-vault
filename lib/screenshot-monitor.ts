import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import {
  batchImportScreenshots,
  deleteScreenshotsBySource,
  deleteSubfolderScreenshots,
  getDatabase,
  getUnprocessedScreenshots,
  importScreenshot,
  type ScreenshotImportData
} from "./database";
import { useAppStore } from "./store";

const LAST_SYNC_KEY = "screenvault_last_sync";
const SELECTED_ALBUM_ID_KEY = "screenvault_selected_album_id";
const SELECTED_ALBUM_NAME_KEY = "screenvault_selected_album_name";
const SELECTED_FOLDER_URI_KEY = "screenvault_selected_folder_uri";
const SELECTED_FOLDER_NAME_KEY = "screenvault_selected_folder_name";
const SELECTED_THEME_KEY = "screenvault_selected_theme";
const MONITOR_SOURCES_KEY = "screenvault_monitor_sources_v2";
const SCAN_HIDDEN_FOLDERS_KEY = "screenvault_scan_hidden_folders";

// Mutex to prevent concurrent sync operations
let isSyncing = false;

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Restore persisted album/folder selection into Zustand store on startup.
 * Call this early so the UI displays the correct source name.
 */
export async function loadPersistedSettings() {
  try {
    const [sourcesStr, lastSync, theme] = await Promise.all([
      AsyncStorage.getItem(MONITOR_SOURCES_KEY),
      AsyncStorage.getItem(LAST_SYNC_KEY),
      AsyncStorage.getItem(SELECTED_THEME_KEY),
    ]);

    if (sourcesStr) {
      useAppStore.getState().setMonitorSources(JSON.parse(sourcesStr));
    } else {
      // Migrate old settings if they exist
      const albumName = await AsyncStorage.getItem(SELECTED_ALBUM_NAME_KEY);
      const folderUri = await AsyncStorage.getItem(SELECTED_FOLDER_URI_KEY);
      const folderName = await AsyncStorage.getItem(SELECTED_FOLDER_NAME_KEY);
      const albumId = await AsyncStorage.getItem(SELECTED_ALBUM_ID_KEY);

      if (folderUri && folderName) {
        useAppStore.getState().addMonitorSource({ id: null, name: folderName, uri: folderUri, type: "folder" });
      } else if (albumName) {
        useAppStore.getState().addMonitorSource({ id: albumId, name: albumName, type: "album" });
      }
    }

    if (lastSync) {
      useAppStore.getState().setLastSyncTimestamp(parseInt(lastSync, 10));
    }

    if (theme === "light" || theme === "dark" || theme === "system") {
      useAppStore.getState().setTheme(theme);
    }

    const scanHidden = await AsyncStorage.getItem(SCAN_HIDDEN_FOLDERS_KEY);
    if (scanHidden !== null) {
      useAppStore.getState().setScanHiddenFolders(scanHidden === "true");
    }

    //console.log("[ScreenVault] Persisted settings loaded:", { albumName, folderUri, folderName, theme });
  } catch (e) {
    console.error("[ScreenVault] Error loading persisted settings:", e);
  }
}

/**
 * Save theme choice to persistent storage.
 */
export async function saveThemeSetting(theme: "light" | "dark" | "system") {
  await AsyncStorage.setItem(SELECTED_THEME_KEY, theme);
  useAppStore.getState().setTheme(theme);
}

/**
 * Save hidden folder scan setting.
 */
export async function setScanHiddenFolders(enabled: boolean) {
  await AsyncStorage.setItem(SCAN_HIDDEN_FOLDERS_KEY, enabled.toString());
  useAppStore.getState().setScanHiddenFolders(enabled);
}

/**
 * Request media library permissions.
 * Returns true if granted.
 */
export async function requestMediaPermission(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  //console.log("[ScreenVault] Media permission status:", status);
  return status === "granted";
}

/**
 * Try to find the Screenshots album. Different OEMs use different names.
 */
async function findScreenshotsAlbum(): Promise<MediaLibrary.Album | null> {
  try {
    // 1. Check if user manually selected an album
    const savedId = await AsyncStorage.getItem(SELECTED_ALBUM_ID_KEY);
    const savedName = await AsyncStorage.getItem(SELECTED_ALBUM_NAME_KEY);

    if (savedId) {
      //console.log("[ScreenVault] Using manually selected album:", savedName || savedId);
      const allAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      const album = allAlbums.find(a => a.id === savedId);
      if (album) {
        useAppStore.getState().setSelectedAlbumName(album.title);
        return album;
      }
      //console.log("[ScreenVault] Saved album not found, falling back to auto-detection");
    }

    // 2. Try direct lookup by known names (case-insensitive)
    const knownNames = ["screenshots", "captures", "screen shots", "screenshot"];
    const allAlbumsForLookup = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    for (const album of allAlbumsForLookup) {
      if (knownNames.includes(album.title.toLowerCase()) && album.assetCount > 0) {
        //console.log(`[ScreenVault] Found album by name "${album.title}": ${album.assetCount} assets`);
        useAppStore.getState().setSelectedAlbumName(`Auto: ${album.title}`);
        return album;
      }
    }

    // 3. Fall back to searching all albums including smart albums
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    const keywords = [
      "screenshot",
      "screenshots",
      "capture",
      "captured",
      "screen shot",
      "screen_shot",
      "screen-shot",
      "scrnshot",
      "s-screenshot",
      "schermate",
      "captures d'écran",
      "screen",
    ];

    const matches = albums.filter(a => {
      const t = a.title.toLowerCase();
      return keywords.some(k => t.includes(k)) || t === "pictures" || t === "dcim";
    });

    if (matches.length > 0) {
      const bestMatch = matches.reduce((prev, current) =>
        (current.assetCount > prev.assetCount) ? current : prev
      );

      if (bestMatch.assetCount > 0) {
        useAppStore.getState().setSelectedAlbumName(`Auto: ${bestMatch.title}`);
        return bestMatch;
      }
    }
  } catch (e) {
    console.error("[ScreenVault] Error fetching albums:", e);
  }
  //console.log("[ScreenVault] No screenshot-specific album with assets found, will scan all photos");
  useAppStore.getState().setSelectedAlbumName("All Photos (Fallback)");
  return null;
}

/**
 * Open the native SAF folder picker and let the user select any folder on the device.
 * Returns { uri, name } if selected, or null if cancelled.
 */
export async function selectDeviceFolder(): Promise<{ uri: string; name: string } | null> {
  try {
    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return null;

    const folderUri = permissions.directoryUri;
    const decodedUri = decodeURIComponent(folderUri);
    const pathPart = decodedUri.split("/tree/")[1] || decodedUri;
    const colonIndex = pathPart.indexOf(":");
    const displayPath = colonIndex >= 0 ? pathPart.substring(colonIndex + 1) : pathPart;
    const folderName = displayPath || "Selected Folder";

    return { uri: folderUri, name: folderName };
  } catch (e) {
    console.error("[ScreenVault] SAF folder selection error:", e);
    return null;
  }
}

/**
 * Add a new source to the monitor.
 */
export async function addMonitorSource(source: import("./store").MonitorSource, skipSync = false) {
  useAppStore.getState().addMonitorSource(source);
  const sources = useAppStore.getState().monitorSources;
  await AsyncStorage.setItem(MONITOR_SOURCES_KEY, JSON.stringify(sources));

  if (!skipSync) {
    await syncScreenshots();
  }
}

/**
 * Remove a source from the monitor.
 */
export async function removeMonitorSource(idOrUri: string) {
  useAppStore.getState().removeMonitorSource(idOrUri);
  const sources = useAppStore.getState().monitorSources;
  await AsyncStorage.setItem(MONITOR_SOURCES_KEY, JSON.stringify(sources));
  await deleteScreenshotsBySource(idOrUri);
  await refreshUnprocessedCount();
}


/**
 * Toggle recursion for a specific monitor source.
 */
export async function toggleMonitorSourceRecursion(idOrUri: string, skipSync = false) {
  const sources = useAppStore.getState().monitorSources;
  const source = sources.find(s => s.id === idOrUri || s.uri === idOrUri);
  const wasRecursive = !!source?.recursive;
  
  useAppStore.getState().toggleSourceRecursion(idOrUri);
  const updatedSources = useAppStore.getState().monitorSources;
  await AsyncStorage.setItem(MONITOR_SOURCES_KEY, JSON.stringify(updatedSources));
  
  const updatedSource = updatedSources.find(s => s.id === idOrUri || s.uri === idOrUri);
  const isNowRecursive = !!updatedSource?.recursive;

  if (wasRecursive && !isNowRecursive) {
    // Disabled recursion: Clean up all images that were imported from subdirectories of this source
    // SMART CLEANUP: Only remove if NOT explicitly added as a separate source
    const otherSources = updatedSources.filter(s => s.uri !== idOrUri);
    const database = await getDatabase();
    
    // Find all screenshots marked as subfolders for this source
    const subs = await database.getAllAsync<{ mediaLibraryId: string }>(
      "SELECT mediaLibraryId FROM screenshots WHERE sourceId = ? AND isSubfolder = 1",
      [idOrUri]
    );

    for (const sub of subs) {
      const uri = sub.mediaLibraryId;
      // Is this URI covered by any other source?
      const isCovered = otherSources.some(os => {
        if (!os.uri) return false;
        if (uri === os.uri) return true; // Exactly the same source
        if (os.recursive && uri.startsWith(os.uri)) return true; // Covered by another recursive parent
        return false;
      });

      if (!isCovered) {
        await database.runAsync("DELETE FROM screenshots WHERE mediaLibraryId = ?", [uri]);
      }
    }

    await refreshUnprocessedCount();
  } else if (!wasRecursive && isNowRecursive) {
    // Enabled recursion: Trigger sync to pick up new images
    if (!skipSync) {
      await syncScreenshots();
    }
  }
}

/**
 * Check if a new folder is already covered by an existing source,
 * or if it would shadow someone else.
 */
export function checkSourceOverlap(newUri: string, recursive: boolean): { status: 'overlap' | 'shadow' | 'ok'; message?: string } {
  const sources = useAppStore.getState().monitorSources;
  
  for (const s of sources) {
    if (!s.uri) continue;
    
    // 1. Is the new folder ALREADY inside an existing recursive folder?
    if (s.recursive && newUri.startsWith(s.uri) && newUri !== s.uri) {
      return { 
        status: 'overlap', 
        message: `This folder is already covered by recursive monitoring of "${s.name}".` 
      };
    }

    // 2. Is the new folder a PARENT of an existing folder?
    if (recursive && s.uri.startsWith(newUri) && newUri !== s.uri) {
      return {
        status: 'shadow',
        message: `Monitoring this folder recursively will overlap with your existing source "${s.name}".`
      };
    }
  }

  return { status: 'ok' };
}

/**
 * Previews how many screenshots are in a folder without importing them.
 */
export async function previewSAFFolder(
  uri: string, 
  recursive: boolean, 
  onProgress?: (count: number) => void
): Promise<import("./database").ScreenshotImportData[]> {
  return await syncFromSAFFolder(uri, new Set<string>(), recursive, true, onProgress);
}

export async function getAllAlbumsWithAssets(): Promise<MediaLibrary.Album[]> {
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  
  // To avoid showing folders with only videos, we need to check if they have at least one photo.
  // This is a bit more expensive than just checking assetCount, so we do it in parallel.
  const albumsWithPhotos = await Promise.all(
    albums.map(async (album) => {
      if (album.assetCount === 0) return null;
      
      const assets = await MediaLibrary.getAssetsAsync({
        album: album,
        mediaType: [MediaLibrary.MediaType.photo],
        first: 1,
      });
      
      return assets.totalCount > 0 ? album : null;
    })
  );

  return (albumsWithPhotos.filter(a => a !== null) as MediaLibrary.Album[])
    .sort((a, b) => b.assetCount - a.assetCount);
}

/**
 * Scan the device's Screenshots album for new images
 * and import references into our local SQLite database.
 */
export async function syncScreenshots(): Promise<number> {
  const hasPermission = await requestMediaPermission();
  if (!hasPermission || isSyncing) return 0;

  isSyncing = true;
  useAppStore.getState().setIsImporting(true);
  let totalImported = 0;

  try {
    const sources = useAppStore.getState().monitorSources;
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

    const effectiveSources = [...sources];
    // Removed autoDetectionEnabled check. We now only scan explicit sources.

    // Use a Set to avoid duplicate syncs if manual selection overlaps with auto
    const seenIds = new Set<string>();
    // Use a Set for this sync run to avoid redundant DB checks within the same batch
    const processedThisRun = new Set<string>();

    for (const source of effectiveSources) {
      const sourceId = source.id || source.uri || "__auto__";
      if (seenIds.has(sourceId)) continue;
      seenIds.add(sourceId);

      if (source.type === "folder" && source.uri) {
        // Real-time discovery and sync for folders
        await syncFromSAFFolder(
          source.uri, 
          processedThisRun, 
          !!source.recursive, 
          false, 
          undefined, 
          async (batch) => {
            const importedIds = await batchImportScreenshots(batch);
            totalImported += importedIds.length;
          }
        );
      } else {
        totalImported += await syncFromAlbum(source.id, lastSync, processedThisRun);
      }
    }

    if (totalImported > 0 || lastSync > 0) {
      const now = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
      useAppStore.getState().setLastSyncTimestamp(now);
    }

    await refreshUnprocessedCount();
    return totalImported;
  } catch (error) {
    console.error("[ScreenVault] Multi-source sync error:", error);
    return 0;
  } finally {
    isSyncing = false;
    useAppStore.getState().setIsImporting(false);
  }
}

/**
 * Directly imports pre-scanned screenshot data.
 * Used to avoid re-scanning after a "Confirm Add" action.
 */
export async function importSourceData(data: ScreenshotImportData[]): Promise<number> {
  if (!data || data.length === 0) return 0;
  
  try {
    useAppStore.getState().setIsImporting(true);
    const importedIds = await batchImportScreenshots(data);
    
    // Update last sync
    const now = Date.now();
    await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
    useAppStore.getState().setLastSyncTimestamp(now);
    
    await refreshUnprocessedCount();
    return importedIds.length;
  } catch (err) {
    console.error("[ScreenVault] Direct import error:", err);
    return 0;
  } finally {
    useAppStore.getState().setIsImporting(false);
  }
}

async function syncFromAlbum(
  albumId: string | null, 
  lastSync: number,
  dedupeCache: Set<string>
): Promise<number> {
  let imported = 0;
  let scannedAssets = 0;
  let hasNextPage = true;
  let endCursor: string | undefined;

  let targetAlbum: MediaLibrary.Album | null = null;
  if (albumId) {
    const all = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    targetAlbum = all.find(a => a.id === albumId) || null;
  }

  const allToImport: ScreenshotImportData[] = [];

  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      first: 200, // Increased for better batching
      after: endCursor,
      sortBy: [MediaLibrary.SortBy.creationTime],
      album: targetAlbum || undefined,
      mediaType: [MediaLibrary.MediaType.photo],
      createdAfter: lastSync > 0 ? lastSync : undefined,
    });

    for (const asset of page.assets) {
      scannedAssets++;
      if (dedupeCache.has(asset.id)) continue;
      
      if (targetAlbum !== null) {
        dedupeCache.add(asset.id);
        allToImport.push({
          mediaLibraryId: asset.id,
          uri: asset.uri,
          filename: asset.filename || "unknown",
          width: asset.width || 0,
          height: asset.height || 0,
          createdAt: asset.creationTime ? new Date(asset.creationTime).toISOString() : new Date().toISOString(),
          sourceId: albumId,
          sourceType: "album",
        });
      }
    }

    hasNextPage = page.hasNextPage;
    endCursor = page.endCursor;
    if (lastSync === 0 && scannedAssets >= 5000) break;
  }

  if (allToImport.length > 0) {
    const importedIds = await batchImportScreenshots(allToImport);
    imported = importedIds.length;
  }

  return imported;
}

/**
 * Scan a SAF-granted directory for image files and import them.
 */
async function syncFromSAFFolder(
  folderUri: string,
  dedupeCache: Set<string>,
  recursive: boolean = false,
  isPreview: boolean = false,
  onProgress?: (count: number) => void,
  onBatchFound?: (batch: ScreenshotImportData[]) => Promise<void>
): Promise<ScreenshotImportData[]> {
  const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
  const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
  const discovered: ScreenshotImportData[] = [];

  try {
    const processFolder = async (currentUri: string, isSub: boolean): Promise<void> => {
      let files: string[];
      try {
        files = await StorageAccessFramework.readDirectoryAsync(currentUri);
      } catch {
        // If readDirectoryAsync fails, this URI is not a readable directory
        return;
      }
      
      // Stop recursion if the source is no longer marked as recursive during the walk
      if (isSub && !isPreview) {
        const sources = useAppStore.getState().monitorSources;
        const currentSource = sources.find(s => s.uri === folderUri);
        if (!currentSource || !currentSource.recursive) return;
      }

      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];

      for (const fileUri of files) {
        try {
          // First, check if this item is a sub-directory by trying to read it
          if (recursive) {
            try {
              const subFiles = await StorageAccessFramework.readDirectoryAsync(fileUri);
              // If readDirectoryAsync succeeds, it's a directory — recurse into it
              if (subFiles) {
                // Respect "Scan Hidden Folders" toggle for directories too
                const decodedDirUri = decodeURIComponent(fileUri);
                const dirName = decodedDirUri.split("/").filter(Boolean).pop() || 
                                decodedDirUri.split("%2F").filter(Boolean).pop() || "unknown";
                
                if (!useAppStore.getState().scanHiddenFolders && dirName.startsWith(".")) {
                  // Skip hidden directory
                } else {
                  await processFolder(fileUri, true);
                }
                continue;
              }
            } catch {
              // Not a directory, continue as a file
            }
          }

          // Filter to image files only
          const decodedUri = decodeURIComponent(fileUri);
          const filename = decodedUri.split("/").pop() || decodedUri.split("%2F").pop() || "unknown";
          
          // Respect "Scan Hidden Folders" toggle
          if (!useAppStore.getState().scanHiddenFolders && filename.startsWith(".")) {
            continue;
          }

          const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));

          if (!imageExtensions.includes(ext)) continue;
          if (dedupeCache.has(fileUri)) continue;

          // Get file info for modification date
          const info = await LegacyFileSystem.getInfoAsync(fileUri);
          if (!info.exists) continue;

          // For incremental sync, skip files older than last sync
          const modTime = (info as any).modificationTime;
          if (!isPreview && lastSync > 0 && modTime && modTime * 1000 < lastSync) continue;

          dedupeCache.add(fileUri);
          const item: ScreenshotImportData = {
            mediaLibraryId: fileUri,
            uri: fileUri,
            filename: filename,
            width: 0,
            height: 0,
            createdAt: modTime ? new Date(modTime * 1000).toISOString() : new Date().toISOString(),
            sourceId: folderUri,
            sourceType: "folder",
            isSubfolder: isSub
          };
          discovered.push(item);
          
          if (onProgress) {
            onProgress(discovered.length);
          }
        } catch (fileErr) {
          console.error(`[ScreenVault] Error processing SAF file:`, fileErr);
        }
      }
    };

    await processFolder(folderUri, false);

    // Import all discovered files in one shot (not 50-at-a-time)
    if (!isPreview && onBatchFound && discovered.length > 0) {
      await onBatchFound(discovered);
    }
    
    // Update sync timestamp if we found anything (or even if we didn't, to mark the run)
    if (!isPreview && (discovered.length > 0 || lastSync > 0)) {
      const now = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
      useAppStore.getState().setLastSyncTimestamp(now);
    }
  } catch (e) {
    console.error("[ScreenVault] SAF folder sync error:", e);
  }

  return discovered;
}

export async function refreshUnprocessedCount(): Promise<void> {
  const unprocessed = await getUnprocessedScreenshots();
  useAppStore.getState().setUnprocessedCount(unprocessed.length);
  // Trigger a store refresh for components listening to revision
  useAppStore.getState().notifyDatabaseChange();
}

export async function scheduleDailyNudge() {
  const unprocessedCount = useAppStore.getState().unprocessedCount;
  if (unprocessedCount === 0) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Clean Up Your Gallery 🧹",
        body: `You have ${unprocessedCount} screenshots waiting to be organized.`,
        data: { type: "NUDGE" },
      },
      trigger: {
        type: "daily",
        hour: 18,
        minute: 0,
      } as any,
    });
  } catch {
    // Notifications might fail on some devices
  }
}
