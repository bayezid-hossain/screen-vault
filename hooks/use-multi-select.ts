import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";

export function useMultiSelect() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const isSelectMode = selectedIds.size > 0;

  const toggleSelect = useCallback((id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: number[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedIds(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds]
  );

  return {
    selectedIds,
    isSelectMode,
    toggleSelect,
    selectAll,
    deselectAll,
    isSelected,
    selectedCount: selectedIds.size,
  };
}
