import * as LegacyFileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import { getScreenshotsByFolder, getFolders, type ScreenshotRow, type FolderRow } from "./database";

/**
 * Export all screenshots from a specific folder to a structured directory on the device.
 * Files are COPIED (not moved) — originals remain in place.
 * 
 * The target structure is: ScreenVault/<FolderName>/<filename>
 */
export async function exportFolderToDevice(
  folderId: number,
  folderName: string,
  onProgress?: (exported: number, total: number) => void
): Promise<{ exported: number; errors: number }> {
  const screenshots = await getScreenshotsByFolder(folderId);
  if (screenshots.length === 0) return { exported: 0, errors: 0 };

  // Ask user for target directory via SAF
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return { exported: 0, errors: 0 };

  const baseUri = permissions.directoryUri;
  let exported = 0;
  let errors = 0;

  // Create folder subdirectory
  let targetDir: string;
  try {
    targetDir = await StorageAccessFramework.makeDirectoryAsync(baseUri, folderName);
  } catch {
    // Directory might already exist — try to use it
    targetDir = `${baseUri}/${encodeURIComponent(folderName)}`;
  }

  for (const screenshot of screenshots) {
    try {
      const sourceUri = screenshot.editedUri || screenshot.uri;
      const filename = screenshot.filename || `screenshot_${screenshot.id}.png`;
      
      // Determine MIME type from extension
      const ext = filename.toLowerCase().split('.').pop() || 'png';
      const mimeType = getMimeType(ext);

      // Create the file in the target directory
      const newFileUri = await StorageAccessFramework.createFileAsync(
        targetDir,
        filename.replace(/\.[^/.]+$/, ''), // Name without extension (SAF adds it based on mime)
        mimeType
      );

      // Read source file and write to target
      const content = await LegacyFileSystem.readAsStringAsync(sourceUri, {
        encoding: LegacyFileSystem.EncodingType.Base64,
      });
      await LegacyFileSystem.writeAsStringAsync(newFileUri, content, {
        encoding: LegacyFileSystem.EncodingType.Base64,
      });

      exported++;
      if (onProgress) onProgress(exported, screenshots.length);
    } catch (err) {
      console.error(`[FileOrganizer] Error exporting ${screenshot.filename}:`, err);
      errors++;
    }
  }

  return { exported, errors };
}

/**
 * Export ALL organized screenshots (those assigned to folders) into a structured directory.
 * Structure: SelectedDir/<FolderName>/<filename>
 */
export async function exportAllToDevice(
  onProgress?: (exported: number, total: number, currentFolder: string) => void
): Promise<{ exported: number; errors: number; folders: number }> {
  const folders = await getFolders();
  if (folders.length === 0) return { exported: 0, errors: 0, folders: 0 };

  // Ask user for target directory via SAF
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return { exported: 0, errors: 0, folders: 0 };

  const baseUri = permissions.directoryUri;
  let totalExported = 0;
  let totalErrors = 0;
  let processedFolders = 0;

  // Count total screenshots for progress
  let totalScreenshots = 0;
  const folderScreenshots: { folder: FolderRow; screenshots: ScreenshotRow[] }[] = [];
  for (const folder of folders) {
    const shots = await getScreenshotsByFolder(folder.id);
    if (shots.length > 0) {
      folderScreenshots.push({ folder, screenshots: shots });
      totalScreenshots += shots.length;
    }
  }

  for (const { folder, screenshots } of folderScreenshots) {
    // Create folder subdirectory
    let targetDir: string;
    try {
      targetDir = await StorageAccessFramework.makeDirectoryAsync(baseUri, folder.name);
    } catch {
      targetDir = `${baseUri}/${encodeURIComponent(folder.name)}`;
    }

    for (const screenshot of screenshots) {
      try {
        const sourceUri = screenshot.editedUri || screenshot.uri;
        const filename = screenshot.filename || `screenshot_${screenshot.id}.png`;
        const ext = filename.toLowerCase().split('.').pop() || 'png';
        const mimeType = getMimeType(ext);

        const newFileUri = await StorageAccessFramework.createFileAsync(
          targetDir,
          filename.replace(/\.[^/.]+$/, ''),
          mimeType
        );

        const content = await LegacyFileSystem.readAsStringAsync(sourceUri, {
          encoding: LegacyFileSystem.EncodingType.Base64,
        });
        await LegacyFileSystem.writeAsStringAsync(newFileUri, content, {
          encoding: LegacyFileSystem.EncodingType.Base64,
        });

        totalExported++;
        if (onProgress) onProgress(totalExported, totalScreenshots, folder.name);
      } catch (err) {
        console.error(`[FileOrganizer] Error exporting ${screenshot.filename}:`, err);
        totalErrors++;
      }
    }
    processedFolders++;
  }

  return { exported: totalExported, errors: totalErrors, folders: processedFolders };
}

function getMimeType(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'image/png';
  }
}
