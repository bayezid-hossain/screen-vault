import * as SQLite from "expo-sqlite";

type DatabaseChangeListener = () => void;
const listeners = new Set<DatabaseChangeListener>();

export function addDatabaseChangeListener(listener: DatabaseChangeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChange() {
  listeners.forEach(l => l());
}

const DB_NAME = "screenvault.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await initializeDatabase(database);
      return database;
    } catch (error) {
      dbPromise = null; // Reset on failure
      throw error;
    }
  })();

  return dbPromise;
}

async function initializeDatabase(database: SQLite.SQLiteDatabase) {
  //console.log("[Database] Initializing schema...");
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#5c7cfa',
      icon TEXT NOT NULL DEFAULT 'folder',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mediaLibraryId TEXT UNIQUE,
      uri TEXT NOT NULL,
      filename TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      importedAt TEXT NOT NULL DEFAULT (datetime('now')),
      folderId INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      isProcessed INTEGER NOT NULL DEFAULT 0,
      isFavorite INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      editedUri TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#748ffc'
    );

    CREATE TABLE IF NOT EXISTS screenshot_tags (
      screenshotId INTEGER NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
      tagId INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (screenshotId, tagId)
    );

    CREATE INDEX IF NOT EXISTS idx_screenshots_folder ON screenshots(folderId);
    CREATE INDEX IF NOT EXISTS idx_screenshots_processed ON screenshots(isProcessed);
    CREATE INDEX IF NOT EXISTS idx_screenshots_deleted ON screenshots(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(createdAt);
    CREATE INDEX IF NOT EXISTS idx_screenshots_media_id ON screenshots(mediaLibraryId);
  `);
}

// ── Folder Operations ──

export async function createFolder(name: string, color?: string, icon?: string) {
  const database = await getDatabase();
  const maxOrder = await database.getFirstAsync<{ max: number | null }>(
    "SELECT MAX(sortOrder) as max FROM folders"
  );
  const sortOrder = (maxOrder?.max ?? -1) + 1;
  const result = await database.runAsync(
    "INSERT INTO folders (name, color, icon, sortOrder) VALUES (?, ?, ?, ?)",
    [name, color ?? "#5c7cfa", icon ?? "folder", sortOrder]
  );
  emitChange();
  return result.lastInsertRowId;
}

export async function getFolders() {
  const database = await getDatabase();
  return database.getAllAsync<FolderRow>(
    "SELECT f.*, COUNT(s.id) as screenshotCount FROM folders f LEFT JOIN screenshots s ON s.folderId = f.id AND s.isDeleted = 0 GROUP BY f.id ORDER BY f.sortOrder ASC"
  );
}

export async function updateFolder(id: number, data: { name?: string; color?: string; icon?: string }) {
  const database = await getDatabase();
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (data.name !== undefined) { sets.push("name = ?"); values.push(data.name); }
  if (data.color !== undefined) { sets.push("color = ?"); values.push(data.color); }
  if (data.icon !== undefined) { sets.push("icon = ?"); values.push(data.icon); }
  if (sets.length === 0) return;
  values.push(id);
  await database.runAsync(`UPDATE folders SET ${sets.join(", ")} WHERE id = ?`, values);
  emitChange();
}

export async function deleteFolder(id: number) {
  const database = await getDatabase();
  await database.runAsync("UPDATE screenshots SET folderId = NULL, isProcessed = 0 WHERE folderId = ?", [id]);
  await database.runAsync("DELETE FROM folders WHERE id = ?", [id]);
  emitChange();
}

// ── Screenshot Operations ──

export async function importScreenshot(data: {
  mediaLibraryId: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
}): Promise<number | null> {
  // Guard against nulls from Native bridge
  if (!data.mediaLibraryId || !data.uri || !data.filename) {
    console.warn("[Database] Skipping import: Missing critical asset data", data);
    return null;
  }

  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ id: number }>(
    "SELECT id FROM screenshots WHERE mediaLibraryId = ?",
    [data.mediaLibraryId]
  );
  if (existing) return null; // Already imported, skip

  const result = await database.runAsync(
    "INSERT INTO screenshots (mediaLibraryId, uri, filename, width, height, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    [
      data.mediaLibraryId,
      data.uri,
      data.filename,
      data.width || 0,
      data.height || 0,
      data.createdAt || new Date().toISOString()
    ]
  );
  emitChange();
  return result.lastInsertRowId;
}

export async function getUnprocessedScreenshots() {
  const database = await getDatabase();
  return database.getAllAsync<ScreenshotRow>(
    "SELECT * FROM screenshots WHERE isProcessed = 0 AND isDeleted = 0 ORDER BY createdAt DESC"
  );
}

export async function getScreenshotsByFolder(folderId: number) {
  const database = await getDatabase();
  return database.getAllAsync<ScreenshotRow>(
    "SELECT * FROM screenshots WHERE folderId = ? AND isDeleted = 0 ORDER BY createdAt DESC",
    [folderId]
  );
}

export async function getFavoriteScreenshots() {
  const database = await getDatabase();
  return database.getAllAsync<ScreenshotRow>(
    "SELECT * FROM screenshots WHERE isFavorite = 1 AND isDeleted = 0 ORDER BY createdAt DESC"
  );
}

export async function assignToFolder(screenshotId: number, folderId: number) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE screenshots SET folderId = ?, isProcessed = 1 WHERE id = ?",
    [folderId, screenshotId]
  );
  emitChange();
}

export async function toggleFavorite(screenshotId: number) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE screenshots SET isFavorite = CASE WHEN isFavorite = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [screenshotId]
  );
  emitChange();
}

export async function markAsDeleted(screenshotId: number) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE screenshots SET isDeleted = 1 WHERE id = ?",
    [screenshotId]
  );
  emitChange();
}

export async function restoreScreenshot(screenshotId: number) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE screenshots SET isDeleted = 0 WHERE id = ?",
    [screenshotId]
  );
  emitChange();
}

export async function permanentlyDelete(screenshotId: number) {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM screenshots WHERE id = ?", [screenshotId]);
  emitChange();
}

export async function updateScreenshotUri(screenshotId: number, editedUri: string) {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE screenshots SET editedUri = ? WHERE id = ?",
    [editedUri, screenshotId]
  );
  emitChange();
}

// ── Tag Operations ──

export async function createTag(name: string, color: string = "#748ffc") {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)",
    [name, color]
  );
  emitChange();
  return result.lastInsertRowId;
}

export async function getTags() {
  const database = await getDatabase();
  return database.getAllAsync<TagRow>("SELECT * FROM tags ORDER BY name ASC");
}

export async function deleteTag(id: number) {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM tags WHERE id = ?", [id]);
  emitChange();
}

export async function addTagToScreenshot(screenshotId: number, tagId: number) {
  const database = await getDatabase();
  await database.runAsync(
    "INSERT OR IGNORE INTO screenshot_tags (screenshotId, tagId) VALUES (?, ?)",
    [screenshotId, tagId]
  );
  emitChange();
}

export async function removeTagFromScreenshot(screenshotId: number, tagId: number) {
  const database = await getDatabase();
  await database.runAsync(
    "DELETE FROM screenshot_tags WHERE screenshotId = ? AND tagId = ?",
    [screenshotId, tagId]
  );
  emitChange();
}

export async function getScreenshotTags(screenshotId: number) {
  const database = await getDatabase();
  return database.getAllAsync<TagRow>(
    "SELECT t.* FROM tags t JOIN screenshot_tags st ON st.tagId = t.id WHERE st.screenshotId = ?",
    [screenshotId]
  );
}

// ── Stats ──

export async function getStats() {
  const database = await getDatabase();
  const total = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM screenshots WHERE isDeleted = 0"
  );
  const unprocessed = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM screenshots WHERE isProcessed = 0 AND isDeleted = 0"
  );
  const organized = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM screenshots WHERE isProcessed = 1 AND isDeleted = 0"
  );
  const deleted = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM screenshots WHERE isDeleted = 1"
  );
  const favorited = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM screenshots WHERE isFavorite = 1 AND isDeleted = 0"
  );
  const folderCount = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM folders"
  );

  return {
    total: total?.count ?? 0,
    unprocessed: unprocessed?.count ?? 0,
    organized: organized?.count ?? 0,
    deleted: deleted?.count ?? 0,
    favorited: favorited?.count ?? 0,
    folderCount: folderCount?.count ?? 0,
  };
}

export async function getScreenshotsByDate() {
  const database = await getDatabase();
  return database.getAllAsync<{ date: string; count: number }>(
    "SELECT DATE(createdAt) as date, COUNT(*) as count FROM screenshots WHERE isDeleted = 0 GROUP BY DATE(createdAt) ORDER BY date DESC"
  );
}

/**
 * Wipe all data (for debugging)
 */
export async function clearAllData() {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM screenshot_tags;
    DELETE FROM tags;
    DELETE FROM screenshots;
    DELETE FROM folders;
  `);
  //console.log("[Database] All data cleared");
}

// ── Types ──

export type FolderRow = {
  id: number;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt: string;
  screenshotCount: number;
};

export type ScreenshotRow = {
  id: number;
  mediaLibraryId: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
  importedAt: string;
  folderId: number | null;
  isProcessed: number;
  isFavorite: number;
  isDeleted: number;
  editedUri: string | null;
  notes: string | null;
};

export type TagRow = {
  id: number;
  name: string;
  color: string;
};
