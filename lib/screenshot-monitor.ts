import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { getUnprocessedScreenshots, importScreenshot } from "./database";
import { useAppStore } from "./store";

const LAST_SYNC_KEY = "screenvault_last_sync";
const SELECTED_ALBUM_ID_KEY = "screenvault_selected_album_id";
const SELECTED_ALBUM_NAME_KEY = "screenvault_selected_album_name";
const SELECTED_FOLDER_URI_KEY = "screenvault_selected_folder_uri";
const SELECTED_FOLDER_NAME_KEY = "screenvault_selected_folder_name";
const SELECTED_THEME_KEY = "screenvault_selected_theme";

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
    const [albumName, folderUri, folderName, lastSync, theme] = await Promise.all([
      AsyncStorage.getItem(SELECTED_ALBUM_NAME_KEY),
      AsyncStorage.getItem(SELECTED_FOLDER_URI_KEY),
      AsyncStorage.getItem(SELECTED_FOLDER_NAME_KEY),
      AsyncStorage.getItem(LAST_SYNC_KEY),
      AsyncStorage.getItem(SELECTED_THEME_KEY),
    ]);

    if (folderUri && folderName) {
      useAppStore.getState().setSelectedFolderUri(folderUri);
      useAppStore.getState().setSelectedAlbumName(`📁 ${folderName}`);
    } else if (albumName) {
      useAppStore.getState().setSelectedAlbumName(albumName);
    }

    if (lastSync) {
      useAppStore.getState().setLastSyncTimestamp(parseInt(lastSync, 10));
    }

    if (theme === "light" || theme === "dark" || theme === "system") {
      useAppStore.getState().setTheme(theme);
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

export async function setSelectedAlbum(albumId: string | null, albumName: string | null) {
  // Clear any SAF folder selection when switching to album mode
  await AsyncStorage.removeItem(SELECTED_FOLDER_URI_KEY);
  await AsyncStorage.removeItem(SELECTED_FOLDER_NAME_KEY);
  useAppStore.getState().setSelectedFolderUri(null);

  if (albumId && albumName) {
    await AsyncStorage.setItem(SELECTED_ALBUM_ID_KEY, albumId);
    await AsyncStorage.setItem(SELECTED_ALBUM_NAME_KEY, albumName);
    useAppStore.getState().setSelectedAlbumName(albumName);
    //console.log("[ScreenVault] Saved album selection:", albumName);
  } else {
    await AsyncStorage.removeItem(SELECTED_ALBUM_ID_KEY);
    await AsyncStorage.removeItem(SELECTED_ALBUM_NAME_KEY);
    useAppStore.getState().setSelectedAlbumName(null);
    //console.log("[ScreenVault] Cleared album selection");
  }
  // Force a re-scan with the new setting
  await syncScreenshots();
}

/**
 * Open the native SAF folder picker and let the user select any folder on the device.
 * Returns { uri, name } if selected, or null if cancelled.
 */
export async function selectDeviceFolder(): Promise<{ uri: string; name: string } | null> {
  try {
    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      //console.log("[ScreenVault] SAF folder picker cancelled");
      return null;
    }
    const folderUri = permissions.directoryUri;
    // Extract a human-readable name from the SAF URI
    const decodedUri = decodeURIComponent(folderUri);
    // SAF URIs look like: content://com.android.externalstorage.documents/tree/primary%3ADCIM%2FScreenshots
    // After decoding: ...tree/primary:DCIM/Screenshots
    const pathPart = decodedUri.split("/tree/")[1] || decodedUri;
    const colonIndex = pathPart.indexOf(":");
    const displayPath = colonIndex >= 0 ? pathPart.substring(colonIndex + 1) : pathPart;
    const folderName = displayPath || "Selected Folder";

    //console.log("[ScreenVault] SAF folder selected:", folderUri, "display:", folderName);
    return { uri: folderUri, name: folderName };
  } catch (e) {
    console.error("[ScreenVault] SAF folder selection error:", e);
    return null;
  }
}

/**
 * Set the selected SAF folder and trigger a re-scan.
 */
export async function setSelectedFolder(folderUri: string | null, folderName: string | null) {
  // Clear album selection when switching to folder mode
  await AsyncStorage.removeItem(SELECTED_ALBUM_ID_KEY);
  await AsyncStorage.removeItem(SELECTED_ALBUM_NAME_KEY);

  if (folderUri && folderName) {
    await AsyncStorage.setItem(SELECTED_FOLDER_URI_KEY, folderUri);
    await AsyncStorage.setItem(SELECTED_FOLDER_NAME_KEY, folderName);
    useAppStore.getState().setSelectedFolderUri(folderUri);
    useAppStore.getState().setSelectedAlbumName(`📁 ${folderName}`);
    //console.log("[ScreenVault] Saved SAF folder selection:", folderName);
  } else {
    await AsyncStorage.removeItem(SELECTED_FOLDER_URI_KEY);
    await AsyncStorage.removeItem(SELECTED_FOLDER_NAME_KEY);
    useAppStore.getState().setSelectedFolderUri(null);
    useAppStore.getState().setSelectedAlbumName(null);
    //console.log("[ScreenVault] Cleared SAF folder selection");
  }
  // Reset sync state and re-scan
  await resetSyncState();
  await syncScreenshots();
}

export async function getAllAlbumsWithAssets(): Promise<MediaLibrary.Album[]> {
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  return albums.filter(a => a.assetCount > 0).sort((a, b) => b.assetCount - a.assetCount);
}

/**
 * Scan the device's Screenshots album for new images
 * and import references into our local SQLite database.
 */
export async function syncScreenshots(): Promise<number> {
  const hasPermission = await requestMediaPermission();
  if (!hasPermission) {
    //console.log("[ScreenVault] No permission, skipping sync");
    return 0;
  }

  useAppStore.getState().setIsImporting(true);

  try {
    // Check if a SAF folder is selected — if so, use SAF-based scanning
    const safFolderUri = await AsyncStorage.getItem(SELECTED_FOLDER_URI_KEY);
    if (safFolderUri) {
      //console.log("[ScreenVault] Using SAF folder for sync:", safFolderUri);
      const imported = await syncFromSAFFolder(safFolderUri);
      await refreshUnprocessedCount();
      return imported;
    }

    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

    const album = await findScreenshotsAlbum();

    let imported = 0;
    let scannedAssets = 0;
    let hasNextPage = true;
    let endCursor: string | undefined;

    while (hasNextPage) {
      const queryOptions: MediaLibrary.AssetsOptions = {
        first: 100,
        after: endCursor,
        sortBy: [MediaLibrary.SortBy.creationTime],
      };

      // If we found a screenshots album, only scan that
      if (album) {
        queryOptions.album = album;
      }

      // Only use createdAfter for incremental syncs, not first sync
      if (lastSync > 0) {
        queryOptions.createdAfter = lastSync;
      }

      const page = await MediaLibrary.getAssetsAsync(queryOptions);

      // If we got 0 assets on the very first page, try with explicit mediaType as fallback
      if (scannedAssets === 0 && page.assets.length === 0 && page.totalCount === 0 && !album) {
        //console.log("[ScreenVault] No assets found without mediaType filter, trying with photo filter...");
        const photoPage = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.photo,
          first: 5,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        //console.log(`[ScreenVault] Photo filter got ${photoPage.totalCount} total`);

        // Try with mediaType "unknown" or just get everything
        const allPage = await MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video, MediaLibrary.MediaType.audio, MediaLibrary.MediaType.unknown],
          first: 5,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        //console.log(`[ScreenVault] All media types got ${allPage.totalCount} total`);
        if (allPage.assets.length > 0) {
          //console.log("[ScreenVault] === SAMPLE ALL MEDIA ===");
          allPage.assets.forEach((a, i) => {
            //console.log(`[ScreenVault]   [${i}] filename="${a.filename}" mediaType=${a.mediaType} uri="${a.uri}"`);
          });
        }
      }

      // Debug: log the first 5 assets of the first page so we can see filenames
      if (scannedAssets === 0 && page.assets.length > 0) {
        //console.log("[ScreenVault] === SAMPLE ASSETS ===");
        page.assets.slice(0, 5).forEach((a, i) => {
          //console.log(`[ScreenVault]   [${i}] filename="${a.filename}" uri="${a.uri}" id=${a.id}`);
        });
        //console.log("[ScreenVault] === END SAMPLE ===");
      }

      for (const asset of page.assets) {
        scannedAssets++;
        // If scanning a specific album, take everything. Otherwise filter by filename.
        const shouldImport = album !== null || isLikelyScreenshot(asset);

        if (shouldImport && asset.uri && asset.id) {
          try {
            const id = await importScreenshot({
              mediaLibraryId: asset.id,
              uri: asset.uri,
              filename: asset.filename || "unknown_screenshot",
              width: asset.width || 0,
              height: asset.height || 0,
              createdAt: asset.creationTime ? new Date(asset.creationTime).toISOString() : new Date().toISOString(),
            });
            if (id) imported++;
          } catch (err) {
            console.error(`[ScreenVault] Failed to import asset ${asset.id}:`, err);
          }
        }
      }

      // Log progress every page
      //console.log(`[ScreenVault] Scanned ${scannedAssets} assets so far, imported ${imported}`);

      hasNextPage = page.hasNextPage;
      endCursor = page.endCursor;

      // Safety: limit to 5000 assets on first sync to avoid hanging
      if (lastSync === 0 && scannedAssets >= 5000) {
        //console.log("[ScreenVault] First sync limit reached (5000 assets), stopping");
        break;
      }
    }

    // Only update timestamp if we found anything OR if we already have a previous sync
    // to avoid blacklisting valid past screenshots after a failed first-run perm check
    if (imported > 0 || lastSync > 0) {
      const now = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
      useAppStore.getState().setLastSyncTimestamp(now);
      //console.log("[ScreenVault] Updated last sync timestamp to:", now);
    } else {
      //console.log("[ScreenVault] No new screenshots found and no prior sync, NOT updating timestamp");
    }

    await refreshUnprocessedCount();
    return imported;
  } catch (error) {
    console.error("[ScreenVault] Sync error details:", error);
    return 0;
  } finally {
    useAppStore.getState().setIsImporting(false);
  }
}

/**
 * Reset sync state to force a full re-scan
 */
export async function resetSyncState() {
  await AsyncStorage.removeItem(LAST_SYNC_KEY);
  useAppStore.getState().setLastSyncTimestamp(null);
  //console.log("[ScreenVault] Sync state reset");
}

/**
 * Full rescan: reset timestamp + clear album selection + sync
 */
export async function fullRescan(): Promise<number> {
  //console.log("[ScreenVault] === STARTING FULL RESCAN ===");
  await resetSyncState();
  return syncScreenshots();
}

function isLikelyScreenshot(asset: MediaLibrary.Asset): boolean {
  const name = (asset.filename || "").toLowerCase();
  const uri = (asset.uri || "").toLowerCase();

  const matchesName =
    name.includes("screenshot") ||
    name.includes("screen_shot") ||
    name.includes("screen-shot") ||
    name.includes("scrnshot") ||
    name.includes("capture") ||
    name.includes("img_") ||   // Samsung format: IMG_20240101_123456.jpg (could be generic, but URI might help)
    name.includes("screen") || // Generic screen prefix
    name.startsWith("s_") ||   // Xiaomi/POCO: S_20240101_...
    name.startsWith("screenshot_");

  const matchesPath =
    uri.includes("/screenshots/") ||
    uri.includes("/screen_shots/") ||
    uri.includes("/screencaptures/") ||
    uri.includes("/dcim/screenshots/") ||
    uri.includes("/pictures/screenshots/");

  return matchesName || matchesPath;
}

/**
 * Scan a SAF-granted directory for image files and import them.
 */
async function syncFromSAFFolder(folderUri: string): Promise<number> {
  let imported = 0;
  const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
  const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

  try {
    const files = await StorageAccessFramework.readDirectoryAsync(folderUri);
    //console.log(`[ScreenVault] SAF folder contains ${files.length} items`);

    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];

    for (const fileUri of files) {
      try {
        // Filter to image files only
        const decodedUri = decodeURIComponent(fileUri);
        const filename = decodedUri.split("/").pop() || decodedUri.split("%2F").pop() || "unknown";
        const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));

        if (!imageExtensions.includes(ext)) continue;

        // Get file info for modification date
        const info = await LegacyFileSystem.getInfoAsync(fileUri);
        if (!info.exists || info.isDirectory) continue;

        // For incremental sync, skip files older than last sync
        const modTime = (info as any).modificationTime;
        if (lastSync > 0 && modTime && modTime * 1000 < lastSync) continue;

        const id = await importScreenshot({
          mediaLibraryId: fileUri, // Use the SAF URI as the unique ID
          uri: fileUri,
          filename: filename,
          width: 0,  // SAF doesn't provide dimensions directly
          height: 0,
          createdAt: modTime ? new Date(modTime * 1000).toISOString() : new Date().toISOString(),
        });
        if (id) imported++;
      } catch (fileErr) {
        console.error(`[ScreenVault] Error processing SAF file:`, fileErr);
      }
    }

    // Update sync timestamp
    if (imported > 0 || lastSync > 0) {
      const now = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
      useAppStore.getState().setLastSyncTimestamp(now);
      //console.log("[ScreenVault] SAF sync complete. Imported:", imported);
    }
  } catch (e) {
    console.error("[ScreenVault] SAF folder sync error:", e);
  }

  return imported;
}

export async function refreshUnprocessedCount(): Promise<void> {
  const unprocessed = await getUnprocessedScreenshots();
  useAppStore.getState().setUnprocessedCount(unprocessed.length);
  //console.log("[ScreenVault] Unprocessed count:", unprocessed.length);
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
