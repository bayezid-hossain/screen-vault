import { create } from "zustand";

type AppState = {
  unprocessedCount: number;
  totalDeleted: number;
  lastSyncTimestamp: number | null;
  isImporting: boolean;

  setUnprocessedCount: (count: number) => void;
  incrementDeleted: () => void;
  setLastSyncTimestamp: (ts: number) => void;
  setIsImporting: (v: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  unprocessedCount: 0,
  totalDeleted: 0,
  lastSyncTimestamp: null,
  isImporting: false,

  setUnprocessedCount: (count) => set({ unprocessedCount: count }),
  incrementDeleted: () => set((s) => ({ totalDeleted: s.totalDeleted + 1 })),
  setLastSyncTimestamp: (ts) => set({ lastSyncTimestamp: ts }),
  setIsImporting: (v) => set({ isImporting: v }),
}));
