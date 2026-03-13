import { create } from "zustand";
import { addDatabaseChangeListener } from "./database";

type AppState = {
  unprocessedCount: number;
  totalDeleted: number;
  lastSyncTimestamp: number | null;
  selectedAlbumName: string | null;
  selectedFolderUri: string | null;
  isImporting: boolean;
  theme: "light" | "dark" | "system";

  setUnprocessedCount: (count: number) => void;
  incrementDeleted: () => void;
  setLastSyncTimestamp: (ts: number | null) => void;
  setSelectedAlbumName: (name: string | null) => void;
  setSelectedFolderUri: (uri: string | null) => void;
  setIsImporting: (v: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  databaseRevision: number;
  notifyDatabaseChange: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  unprocessedCount: 0,
  totalDeleted: 0,
  lastSyncTimestamp: null,
  selectedAlbumName: null,
  selectedFolderUri: null,
  isImporting: false,
  theme: "dark",

  setUnprocessedCount: (count) => set({ unprocessedCount: count }),
  incrementDeleted: () => set((s) => ({ totalDeleted: s.totalDeleted + 1 })),
  setLastSyncTimestamp: (ts) => set({ lastSyncTimestamp: ts }),
  setSelectedAlbumName: (name) => set({ selectedAlbumName: name }),
  setSelectedFolderUri: (uri) => set({ selectedFolderUri: uri }),
  setIsImporting: (v) => set({ isImporting: v }),
  setTheme: (theme) => set({ theme }),
  databaseRevision: 0,
  notifyDatabaseChange: () => set((s) => ({ databaseRevision: s.databaseRevision + 1 })),
}));

// Initialize database listener
addDatabaseChangeListener(() => {
  useAppStore.getState().notifyDatabaseChange();
});
