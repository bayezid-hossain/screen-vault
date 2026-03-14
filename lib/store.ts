import { create } from "zustand";
import { addDatabaseChangeListener } from "./database";

export type MonitorSource = {
  id: string | null;
  name: string;
  uri?: string;
  type: "album" | "folder";
  recursive?: boolean;
};

export type SourceSyncProgress = {
  scanned: number;
  total: number;
  phase: 'scanning' | 'importing' | 'idle';
};

type AppState = {
  unprocessedCount: number;
  totalDeleted: number;
  lastSyncTimestamp: number | null;
  selectedAlbumName: string | null;
  selectedFolderUri: string | null;
  isImporting: boolean;
  theme: "light" | "dark" | "system";
  scanHiddenFolders: boolean;

  setUnprocessedCount: (count: number) => void;
  incrementDeleted: () => void;
  setLastSyncTimestamp: (ts: number | null) => void;
  setSelectedAlbumName: (name: string | null) => void;
  setSelectedFolderUri: (uri: string | null) => void;
  setIsImporting: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  databaseRevision: number;
  notifyDatabaseChange: () => void;
  monitorSources: MonitorSource[];
  addMonitorSource: (source: MonitorSource) => void;
  removeMonitorSource: (sourceIdOrUri: string) => void;
  setMonitorSources: (sources: MonitorSource[]) => void;
  setScanHiddenFolders: (enabled: boolean) => void;
  toggleSourceRecursion: (idOrUri: string) => void;

  // Per-source sync progress
  sourceSyncProgress: Record<string, SourceSyncProgress>;
  setSourceSyncProgress: (sourceId: string, progress: Partial<SourceSyncProgress>) => void;
  clearSourceSyncProgress: (sourceId: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  unprocessedCount: 0,
  totalDeleted: 0,
  lastSyncTimestamp: null,
  selectedAlbumName: null,
  selectedFolderUri: null,
  isImporting: false,
  theme: "dark",
  scanHiddenFolders: false,

  setUnprocessedCount: (count) => set({ unprocessedCount: count }),
  incrementDeleted: () => set((s) => ({ totalDeleted: s.totalDeleted + 1 })),
  setLastSyncTimestamp: (ts) => set({ lastSyncTimestamp: ts }),
  setSelectedAlbumName: (name) => set({ selectedAlbumName: name }),
  setSelectedFolderUri: (uri) => set({ selectedFolderUri: uri }),
  setIsImporting: (v) => set({ isImporting: v }),
  setTheme: (theme) => set({ theme }),
  databaseRevision: 0,
  notifyDatabaseChange: () => set((s) => ({ databaseRevision: s.databaseRevision + 1 })),
  monitorSources: [],
  addMonitorSource: (source) => set((s) => {
    // Avoid duplicates
    const exists = s.monitorSources.find(
      ms => (source.id && ms.id === source.id) || (source.uri && ms.uri === source.uri)
    );
    if (exists) return s;
    return { monitorSources: [...s.monitorSources, source] };
  }),
  removeMonitorSource: (idOrUri) => set((s) => ({
    monitorSources: s.monitorSources.filter(ms => ms.id !== idOrUri && ms.uri !== idOrUri)
  })),
  setMonitorSources: (sources) => set({ monitorSources: sources }),
  setScanHiddenFolders: (v) => set({ scanHiddenFolders: v }),
  toggleSourceRecursion: (idOrUri) => set((s) => ({
    monitorSources: s.monitorSources.map((ms) =>
      ms.id === idOrUri || ms.uri === idOrUri
        ? { ...ms, recursive: !ms.recursive }
        : ms
    ),
  })),

  // Per-source sync progress
  sourceSyncProgress: {},
  setSourceSyncProgress: (sourceId, progress) => set((s) => ({
    sourceSyncProgress: {
      ...s.sourceSyncProgress,
      [sourceId]: { ...(s.sourceSyncProgress[sourceId] || { scanned: 0, total: 0, phase: 'idle' }), ...progress },
    },
  })),
  clearSourceSyncProgress: (sourceId) => set((s) => {
    const next = { ...s.sourceSyncProgress };
    delete next[sourceId];
    return { sourceSyncProgress: next };
  }),
}));

// Initialize database listener
addDatabaseChangeListener(() => {
  useAppStore.getState().notifyDatabaseChange();
});

