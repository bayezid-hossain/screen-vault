import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { getUnprocessedScreenshots, importScreenshot } from "./database";
import { useAppStore } from "./store";

const LAST_SYNC_KEY = "screenvault_last_sync";

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
 * Request media library permissions.
 * Returns true if granted.
 */
export async function requestMediaPermission(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  console.log("[ScreenVault] Media permission status:", status);
  return status === "granted";
}

/**
 * Try to find the Screenshots album. Different OEMs use different names.
 */
async function findScreenshotsAlbum(): Promise<MediaLibrary.Album | null> {
  const albumNames = [
    "Screenshots",
    "screenshots",
    "Screen captures",
    "Screen recordings",
    "DCIM/Screenshots",
    "Pictures/Screenshots",
  ];
  for (const name of albumNames) {
    const album = await MediaLibrary.getAlbumAsync(name);
    if (album) {
      console.log("[ScreenVault] Found album:", name, "id:", album.id);
      return album;
    }
  }
  console.log("[ScreenVault] No screenshot-specific album found, will scan all photos");
  return null;
}

/**
 * Scan the device's Screenshots album for new images
 * and import references into our local SQLite database.
 */
export async function syncScreenshots(): Promise<number> {
  const hasPermission = await requestMediaPermission();
  if (!hasPermission) {
    console.log("[ScreenVault] No permission, skipping sync");
    return 0;
  }

  useAppStore.getState().setIsImporting(true);

  try {
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    console.log("[ScreenVault] Last sync timestamp:", lastSync, lastSync > 0 ? new Date(lastSync).toISOString() : "(never)");

    const album = await findScreenshotsAlbum();

    let imported = 0;
    let scannedAssets = 0;
    let hasNextPage = true;
    let endCursor: string | undefined;

    while (hasNextPage) {
      const queryOptions: MediaLibrary.AssetsOptions = {
        mediaType: MediaLibrary.MediaType.photo,
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
      console.log(
        `[ScreenVault] Fetched page: ${page.assets.length} assets,`,
        `hasNextPage: ${page.hasNextPage},`,
        `total: ${page.totalCount}`
      );

      for (const asset of page.assets) {
        scannedAssets++;
        // If we're scanning a specific album, include all. Otherwise filter.
        const shouldImport = album !== null || isLikelyScreenshot(asset);

        if (shouldImport) {
          try {
            const id = await importScreenshot({
              mediaLibraryId: asset.id,
              uri: asset.uri,
              filename: asset.filename,
              width: asset.width,
              height: asset.height,
              createdAt: new Date(asset.creationTime).toISOString(),
            });
            if (id) imported++;
          } catch (err) {
            // Duplicate or DB error - that's ok
          }
        }
      }

      hasNextPage = page.hasNextPage;
      endCursor = page.endCursor;

      // Safety: limit to 2000 assets on first sync to avoid hanging
      if (lastSync === 0 && scannedAssets >= 2000) {
        console.log("[ScreenVault] First sync limit reached (2000 assets), stopping");
        break;
      }
    }

    const now = Date.now();
    await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
    useAppStore.getState().setLastSyncTimestamp(now);

    await refreshUnprocessedCount();

    console.log(
      `[ScreenVault] Sync complete: scanned ${scannedAssets}, imported ${imported} new screenshots`
    );

    if (imported > 0) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "New Screenshots Detected! 📸",
            body: `You have ${imported} new screenshot${imported > 1 ? "s" : ""} to organize.`,
            data: { type: "NEW_SCREENSHOTS" },
          },
          trigger: null,
        });
      } catch {
        // Notifications might not be available, that's ok
      }
    }

    return imported;
  } catch (error) {
    console.error("[ScreenVault] Sync error:", error);
    return 0;
  } finally {
    useAppStore.getState().setIsImporting(false);
  }
}

function isLikelyScreenshot(asset: MediaLibrary.Asset): boolean {
  const name = asset.filename.toLowerCase();
  const uri = asset.uri.toLowerCase();
  return (
    name.includes("screenshot") ||
    name.includes("screen_shot") ||
    name.includes("screen-shot") ||
    name.includes("scrnshot") ||
    name.includes("capture") ||
    uri.includes("screenshot") ||
    uri.includes("screen_shot")
  );
}

export async function refreshUnprocessedCount(): Promise<void> {
  const unprocessed = await getUnprocessedScreenshots();
  useAppStore.getState().setUnprocessedCount(unprocessed.length);
  console.log("[ScreenVault] Unprocessed count:", unprocessed.length);
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
