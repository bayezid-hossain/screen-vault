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
  // 1. Basic schema initialization
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
      notes TEXT,
      sourceId TEXT,
      sourceType TEXT,
      isSubfolder INTEGER NOT NULL DEFAULT 0
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
  `);

  // 2. Migration for existing installations (must happen before creating indexes on these columns)
  try {
    await database.execAsync("ALTER TABLE screenshots ADD COLUMN sourceId TEXT;");
  } catch (e) {}
  try {
    await database.execAsync("ALTER TABLE screenshots ADD COLUMN sourceType TEXT;");
  } catch (e) {}
  try {
    await database.execAsync("ALTER TABLE screenshots ADD COLUMN isSubfolder INTEGER NOT NULL DEFAULT 0;");
  } catch (e) {}

  // 3. Create indexes (ensuring columns exist)
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_screenshots_folder ON screenshots(folderId);
    CREATE INDEX IF NOT EXISTS idx_screenshots_processed ON screenshots(isProcessed);
    CREATE INDEX IF NOT EXISTS idx_screenshots_deleted ON screenshots(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(createdAt);
    CREATE INDEX IF NOT EXISTS idx_screenshots_media_id ON screenshots(mediaLibraryId);
    CREATE INDEX IF NOT EXISTS idx_screenshots_source ON screenshots(sourceId);
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

export async function importScreenshot(data: ScreenshotImportData): Promise<number | null> {
  const results = await batchImportScreenshots([data]);
  return results.length > 0 ? results[0] : null;
}

export type ScreenshotImportData = {
  mediaLibraryId: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  createdAt: string;
  sourceId?: string | null;
  sourceType?: 'album' | 'folder' | null;
  isSubfolder?: boolean;
};

export async function batchImportScreenshots(batch: ScreenshotImportData[]): Promise<number[]> {
  if (batch.length === 0) return [];
  
  const database = await getDatabase();
  const importedIds: number[] = [];
  
  try {
    // Pre-fetch existing records in bulk to avoid per-row SELECT inside the transaction
    const validBatch = batch.filter(d => d.mediaLibraryId && d.uri && d.filename);
    if (validBatch.length === 0) return [];

    // Query existing mediaLibraryIds in chunks of 500 (SQLite variable limit)
    const existingMap = new Map<string, { id: number; sourceId: string | null }>();
    const CHUNK_SIZE = 500;
    for (let i = 0; i < validBatch.length; i += CHUNK_SIZE) {
      const chunk = validBatch.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = await database.getAllAsync<{ id: number; mediaLibraryId: string; sourceId: string | null }>(
        `SELECT id, mediaLibraryId, sourceId FROM screenshots WHERE mediaLibraryId IN (${placeholders})`,
        chunk.map(d => d.mediaLibraryId)
      );
      for (const row of rows) {
        existingMap.set(row.mediaLibraryId, { id: row.id, sourceId: row.sourceId });
      }
    }

    // Separate into updates (existing without sourceId) and inserts (new)
    const toInsert: ScreenshotImportData[] = [];
    const toUpdate: { id: number; sourceId: string; sourceType: string | null }[] = [];

    for (const data of validBatch) {
      const existing = existingMap.get(data.mediaLibraryId);
      if (existing) {
        if (data.sourceId && !existing.sourceId) {
          toUpdate.push({ id: existing.id, sourceId: data.sourceId, sourceType: data.sourceType || null });
        }
        // Already exists — skip
      } else {
        toInsert.push(data);
      }
    }

    await database.withTransactionAsync(async () => {
      // Batch update existing rows that need sourceId
      for (const upd of toUpdate) {
        await database.runAsync(
          "UPDATE screenshots SET sourceId = ?, sourceType = ? WHERE id = ?",
          [upd.sourceId, upd.sourceType, upd.id]
        );
      }

      // Batch insert new rows
      for (const data of toInsert) {
        const result = await database.runAsync(
          "INSERT OR IGNORE INTO screenshots (mediaLibraryId, uri, filename, width, height, createdAt, sourceId, sourceType, isSubfolder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            data.mediaLibraryId,
            data.uri,
            data.filename,
            data.width || 0,
            data.height || 0,
            data.createdAt || new Date().toISOString(),
            data.sourceId || null,
            data.sourceType || null,
            data.isSubfolder ? 1 : 0
          ]
        );

        if (result.changes > 0) {
          importedIds.push(result.lastInsertRowId);
        }
      }
    });

    if (importedIds.length > 0 || toUpdate.length > 0) {
      emitChange();
    }
    return importedIds;
  } catch (error) {
    console.error("[Database] Error batch importing screenshots:", error);
    return [];
  }
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

export async function getScreenshotsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const database = await getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  // Use CASE to maintain the order of IDs provided
  const ordinals = ids.map((id, index) => `WHEN id = ? THEN ${index}`).join(" ");
  return database.getAllAsync<ScreenshotRow>(
    `SELECT * FROM screenshots WHERE id IN (${placeholders}) ORDER BY CASE ${ordinals} END`,
    [...ids, ...ids]
  );
}

export type SearchFilter = "all" | "inbox" | "organized" | "favorited" | "deleted";
export type SortOption = "newest" | "oldest" | "name_az" | "name_za";

export async function searchScreenshots(options: {
  query?: string;
  filter?: SearchFilter;
  sort?: SortOption;
  tagId?: number;
  limit?: number;
  offset?: number;
}) {
  const { query, filter = "all", sort = "newest", tagId, limit = 100, offset = 0 } = options;
  const database = await getDatabase();
  
  let sql = "SELECT s.* FROM screenshots s";
  const params: any[] = [];

  if (tagId) {
    sql += " JOIN screenshot_tags st ON st.screenshotId = s.id AND st.tagId = ?";
    params.push(tagId);
  }

  sql += " WHERE 1=1";
  
  // Apply filter
  if (filter === "inbox") {
    sql += " AND s.isProcessed = 0 AND s.isDeleted = 0";
  } else if (filter === "organized") {
    sql += " AND s.isProcessed = 1 AND s.isDeleted = 0";
  } else if (filter === "favorited") {
    sql += " AND s.isFavorite = 1 AND s.isDeleted = 0";
  } else if (filter === "deleted") {
    sql += " AND s.isDeleted = 1";
  } else {
    // default "all" - shows non-deleted
    sql += " AND s.isDeleted = 0";
  }
  
  // Apply text search
  if (query && query.trim()) {
    sql += " AND (s.filename LIKE ? OR s.notes LIKE ?)";
    const wildcard = `%${query.trim()}%`;
    params.push(wildcard, wildcard);
  }
  
  // Apply sorting
  switch (sort) {
    case "oldest":
      sql += " ORDER BY s.createdAt ASC";
      break;
    case "name_az":
      sql += " ORDER BY s.filename ASC";
      break;
    case "name_za":
      sql += " ORDER BY s.filename DESC";
      break;
    case "newest":
    default:
      sql += " ORDER BY s.createdAt DESC";
      break;
  }

  sql += " LIMIT ? OFFSET ?";
  params.push(limit, offset);
  
  return database.getAllAsync<ScreenshotRow>(sql, params);
}

export async function getScreenshotCount(options: {
  query?: string;
  filter?: SearchFilter;
  tagId?: number;
}): Promise<number> {
  const { query, filter = "all", tagId } = options;
  const database = await getDatabase();
  
  let sql = "SELECT COUNT(*) as count FROM screenshots s";
  const params: any[] = [];

  if (tagId) {
    sql += " JOIN screenshot_tags st ON st.screenshotId = s.id AND st.tagId = ?";
    params.push(tagId);
  }

  sql += " WHERE 1=1";
  
  // Apply filter
  if (filter === "inbox") {
    sql += " AND s.isProcessed = 0 AND s.isDeleted = 0";
  } else if (filter === "organized") {
    sql += " AND s.isProcessed = 1 AND s.isDeleted = 0";
  } else if (filter === "favorited") {
    sql += " AND s.isFavorite = 1 AND s.isDeleted = 0";
  } else if (filter === "deleted") {
    sql += " AND s.isDeleted = 1";
  } else {
    sql += " AND s.isDeleted = 0";
  }
  
  // Apply text search
  if (query && query.trim()) {
    sql += " AND (s.filename LIKE ? OR s.notes LIKE ?)";
    const wildcard = `%${query.trim()}%`;
    params.push(wildcard, wildcard);
  }
  
  const result = await database.getFirstAsync<{ count: number }>(sql, params);
  return result?.count ?? 0;
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

export async function deleteScreenshotsBySource(sourceId: string) {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM screenshots WHERE sourceId = ?", [sourceId]);
  emitChange();
}

export async function deleteSubfolderScreenshots(sourceId: string) {
  const database = await getDatabase();
  await database.runAsync(
    "DELETE FROM screenshots WHERE sourceId = ? AND isSubfolder = 1",
    [sourceId]
  );
  emitChange();
}

// ── Batch Operations ──

export async function batchAssignToFolder(ids: number[], folderId: number) {
  if (ids.length === 0) return;
  const database = await getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  await database.runAsync(
    `UPDATE screenshots SET folderId = ?, isProcessed = 1 WHERE id IN (${placeholders})`,
    [folderId, ...ids]
  );
  emitChange();
}

export async function batchMarkAsDeleted(ids: number[]) {
  if (ids.length === 0) return;
  const database = await getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  await database.runAsync(
    `UPDATE screenshots SET isDeleted = 1 WHERE id IN (${placeholders})`,
    ids
  );
  emitChange();
}

export async function batchToggleFavorite(ids: number[]) {
  if (ids.length === 0) return;
  const database = await getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  await database.runAsync(
    `UPDATE screenshots SET isFavorite = CASE WHEN isFavorite = 1 THEN 0 ELSE 1 END WHERE id IN (${placeholders})`,
    ids
  );
  emitChange();
}

export async function unorganizeScreenshots(ids: number[]) {
  if (ids.length === 0) return;
  const database = await getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  await database.runAsync(
    `UPDATE screenshots SET folderId = NULL, isProcessed = 0 WHERE id IN (${placeholders})`,
    ids
  );
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

export async function getScreenshotCountBySource(sourceId: string): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM screenshots WHERE sourceId = ?",
    [sourceId]
  );
  return result?.count ?? 0;
}

export async function getScreenshotsByDate() {
  const database = await getDatabase();
  return database.getAllAsync<{ date: string; count: number }>(
    "SELECT DATE(createdAt) as date, COUNT(*) as count FROM screenshots WHERE isDeleted = 0 GROUP BY DATE(createdAt) ORDER BY date DESC"
  );
}

export type SourceGroup = {
  sourceId: string;
  screenshots: ScreenshotRow[];
};

export async function getScreenshotsGroupedBySource(filter: SearchFilter = 'all', sort: SortOption = 'newest'): Promise<SourceGroup[]> {
  const database = await getDatabase();
  
  let filterSql = 'AND s.isDeleted = 0';
  if (filter === 'inbox') filterSql = 'AND s.isProcessed = 0 AND s.isDeleted = 0';
  else if (filter === 'organized') filterSql = 'AND s.isProcessed = 1 AND s.isDeleted = 0';
  else if (filter === 'favorited') filterSql = 'AND s.isFavorite = 1 AND s.isDeleted = 0';
  else if (filter === 'deleted') filterSql = 'AND s.isDeleted = 1';

  let orderSql = 'ORDER BY s.createdAt DESC';
  if (sort === 'oldest') orderSql = 'ORDER BY s.createdAt ASC';
  else if (sort === 'name_az') orderSql = 'ORDER BY s.filename ASC';
  else if (sort === 'name_za') orderSql = 'ORDER BY s.filename DESC';

  const rows = await database.getAllAsync<ScreenshotRow>(
    `SELECT s.* FROM screenshots s WHERE 1=1 ${filterSql} ${orderSql}`
  );

  const groupMap = new Map<string, ScreenshotRow[]>();
  for (const row of rows) {
    const key = row.sourceId || '__unsorted__';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(row);
  }

  return Array.from(groupMap.entries()).map(([sourceId, screenshots]) => ({
    sourceId,
    screenshots,
  }));
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
  sourceId: string | null;
};

export type TagRow = {
  id: number;
  name: string;
  color: string;
};
