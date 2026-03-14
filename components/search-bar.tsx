import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { SearchFilter, SortOption, TagRow } from "@/lib/database";
import { Search, SlidersHorizontal, Tag as TagIcon, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  filter: SearchFilter;
  onFilterChange: (f: SearchFilter) => void;
  tags: TagRow[];
  selectedTagId: number | null;
  onTagChange: (id: number | null) => void;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  onClose: () => void;
}

const FILTERS: { label: string; value: SearchFilter }[] = [
  { label: "All", value: "all" },
  { label: "Inbox", value: "inbox" },
  { label: "Organized", value: "organized" },
  { label: "Favorited", value: "favorited" },
  { label: "Trash", value: "deleted" },
];

const SORTS: { label: string; value: SortOption }[] = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "A-Z", value: "name_az" },
  { label: "Z-A", value: "name_za" },
];

export function SearchBar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  tags,
  selectedTagId,
  onTagChange,
  sort,
  onSortChange,
  onClose,
}: SearchBarProps) {
  const [showSort, setShowSort] = useState(false);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      layout={Layout.springify()}
      className="bg-white dark:bg-surface-950 px-4 pb-4 border-b border-surface-100 dark:border-surface-800"
    >
      {/* Search Input */}
      <View className="flex-row items-center gap-2 mb-4">
        <View className="flex-1 flex-row items-center bg-surface-100 dark:bg-surface-800 rounded-2xl px-4 h-11">
          <Icon as={Search} size={16} className="text-surface-400" />
          <Input
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search filenames or notes..."
            className="flex-1 border-0 bg-transparent h-11 text-sm ml-1"
            autoFocus
          />
          {query.length > 0 && (
            <Pressable onPress={() => onQueryChange("")}>
              <Icon as={X} size={16} className="text-surface-400" />
            </Pressable>
          )}
        </View>
        <Button
          variant="ghost"
          onPress={onClose}
          className="h-11 px-3 rounded-2xl"
        >
          <Text className="text-primary-600 dark:text-primary-400 font-bold text-sm">Cancel</Text>
        </Button>
      </View>

      {/* Main Filters & Sort */}
      <View className="flex-row items-center mb-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-1"
        >
          <View className="flex-row gap-2 pr-4">
            {FILTERS.map((f) => {
              const isActive = filter === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => onFilterChange(f.value)}
                  className={`px-3.5 py-1.5 rounded-full border ${isActive
                      ? "bg-primary-500 border-primary-500"
                      : "bg-transparent border-surface-200 dark:border-surface-700"
                    }`}
                >
                  <Text
                    className={`text-xs font-semibold ${isActive ? "text-white" : "text-surface-600 dark:text-white"
                      }`}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View className="h-6 w-[1px] bg-surface-200 dark:bg-surface-700 mx-2" />

        <Button
          variant="ghost"
          onPress={() => setShowSort(!showSort)}
          className={`flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl h-auto ${showSort ? "bg-surface-100 dark:bg-surface-800" : ""
            }`}
        >
          <Icon as={SlidersHorizontal} size={14} className="text-surface-500" />
          <Text className="text-surface-600 dark:text-white text-xs font-semibold capitalize">
            {sort.replace("_", " ")}
          </Text>
        </Button>
      </View>

      {/* Tags Filter */}
      {tags.length > 0 && (
        <View className="mt-1">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => onTagChange(null)}
                className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border ${selectedTagId === null
                    ? "bg-surface-200 dark:bg-surface-700 border-surface-300 dark:border-surface-600"
                    : "bg-transparent border-surface-200 dark:border-surface-700"
                  }`}
              >
                <Icon as={TagIcon} size={12} className="text-surface-400" />
                <Text className="text-[11px] font-bold text-surface-600 dark:text-white">All Tags</Text>
              </Pressable>
              {tags.map((t) => {
                const isActive = selectedTagId === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => onTagChange(isActive ? null : t.id)}
                    className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border ${isActive
                        ? "bg-primary-500/10 border-primary-500"
                        : "bg-transparent border-surface-200 dark:border-surface-700"
                      }`}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.color || "#748ffc" }} />
                    <Text
                      className={`text-[11px] font-bold ${isActive ? "text-primary-600 dark:text-primary-400" : "text-surface-600 dark:text-white"
                        }`}
                    >
                      {t.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Sort Options Expandable */}
      {showSort && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          className="flex-row flex-wrap gap-2 mt-3 pt-3 border-t border-surface-100 dark:border-surface-800"
        >
          {SORTS.map((s) => {
            const isActive = sort === s.value;
            return (
              <Pressable
                key={s.value}
                onPress={() => {
                  onSortChange(s.value);
                  setShowSort(false);
                }}
                className={`px-3 py-1.5 rounded-lg ${isActive
                    ? "bg-primary-500"
                    : "bg-surface-100 dark:bg-surface-800"
                  }`}
              >
                <Text
                  className={`text-[11px] font-bold ${isActive ? "text-white" : "text-surface-600 dark:text-white"
                    }`}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </Animated.View>
  );
}
