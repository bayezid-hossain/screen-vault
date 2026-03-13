import { useState, useCallback } from "react";
import { View, ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  FolderCheck,
  Trash2,
  Heart,
  TrendingUp,
  CalendarDays,
  Sparkles,
} from "lucide-react-native";
import { getStats, getScreenshotsByDate, type ScreenshotRow } from "@/lib/database";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useFocusEffect } from "expo-router";
import { useAppStore } from "@/lib/store";

type Stats = {
  total: number;
  unprocessed: number;
  organized: number;
  deleted: number;
  favorited: number;
  folderCount: number;
};


export default function StatsScreen() {
  const { theme } = useAppStore();
  const isDark = theme === "dark";

  const [stats, setStats] = useState<Stats | null>(null);
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number }[]>([]);
  const [dateScreenshots, setDateScreenshots] = useState<Record<string, ScreenshotRow[]>>({});
  const dbRevision = useAppStore((s) => s.databaseRevision);

  const loadData = useCallback(async () => {
    const [s, h] = await Promise.all([getStats(), getScreenshotsByDate()]);
    setStats(s);
    setHeatmapData(h);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData, dbRevision])
  );

  if (!stats) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-surface-950 items-center justify-center">
        <Icon as={Sparkles} className="text-primary-500" size={32} />
        <Text className="text-surface-600 dark:text-surface-300 mt-4">Loading stats...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-surface-950">
      <ScrollView className="flex-1 px-6 pt-2" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-black dark:text-white text-2xl font-bold mb-1">Statistics</Text>
        <Text className="text-surface-500 dark:text-surface-300 text-sm mb-6">Your screenshot habits at a glance</Text>

        {/* Summary Cards */}
        <View className="flex-row gap-3 mb-4">
          <StatCard
            icon={<Icon as={Camera} className="text-primary-500" size={20} strokeWidth={2} />}
            label="Total"
            value={stats.total}
            bgColor="bg-primary/10"
          />
          <StatCard
            icon={<Icon as={FolderCheck} className="text-accent-green" size={20} strokeWidth={2} />}
            label="Organized"
            value={stats.organized}
            bgColor="bg-accent-green/10"
          />
        </View>
        <View className="flex-row gap-3 mb-6">
          <StatCard
            icon={<Icon as={Trash2} className="text-destructive" size={20} strokeWidth={2} />}
            label="Deleted"
            value={stats.deleted}
            bgColor="bg-destructive/10"
          />
          <StatCard
            icon={<Icon as={Heart} className="text-accent-amber" size={20} strokeWidth={2} />}
            label="Favorites"
            value={stats.favorited}
            bgColor="bg-accent-amber/10"
          />
        </View>

        {/* Efficiency Score */}
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl p-5 mb-6 border border-surface-100 dark:border-transparent">
          <View className="flex-row items-center gap-2 mb-3">
            <Icon as={TrendingUp} className="text-accent-green" size={18} strokeWidth={2} />
            <Text className="text-black dark:text-white font-semibold text-base">Efficiency</Text>
          </View>
          {stats.total > 0 ? (
            <>
              <Text className="text-4xl font-bold text-black dark:text-white">
                {Math.round((stats.organized / stats.total) * 100)}%
              </Text>
              <Text className="text-surface-500 dark:text-surface-300 text-sm mt-1">
                of screenshots organized into folders
              </Text>
              {/* Progress bar */}
              <View className="h-2 bg-surface-200 dark:bg-surface-700 rounded-full mt-3 overflow-hidden">
                <View
                  className="h-full bg-accent-green rounded-full"
                  style={{
                    width: `${Math.round((stats.organized / stats.total) * 100)}%`,
                  }}
                />
              </View>
            </>
          ) : (
            <Text className="text-surface-500 dark:text-surface-300 text-sm">
              Take some screenshots to see your stats!
            </Text>
          )}
        </View>

        {/* Screenshot Heatmap */}
        <View className="bg-surface-50 dark:bg-surface-800 rounded-2xl p-5 mb-6 border border-surface-100 dark:border-transparent">
          <View className="flex-row items-center gap-2 mb-4">
            <Icon as={CalendarDays} className="text-primary-400" size={18} strokeWidth={2} />
            <Text className="text-black dark:text-white font-semibold text-base">
              Activity Heatmap
            </Text>
          </View>
          {heatmapData.length > 0 ? (
            <HeatmapCalendar data={heatmapData} isDark={isDark} />
          ) : (
            <Text className="text-surface-500 dark:text-surface-300 text-sm text-center py-4">
              No activity data yet
            </Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ──

function StatCard({
  icon,
  label,
  value,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bgColor: string;
}) {
  return (
    <View className="flex-1 bg-surface-50 dark:bg-surface-800 rounded-2xl p-4 border border-surface-100 dark:border-transparent">
      <View
        className={cn("w-10 h-10 rounded-xl items-center justify-center mb-3", bgColor)}
      >
        {icon}
      </View>
      <Text className="text-surface-900 dark:text-white text-2xl font-bold">{formatNumber(value)}</Text>
      <Text className="text-surface-600 dark:text-surface-300 text-xs mt-1">{label}</Text>
    </View>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-700 last:border-b-0">
      <Text className="text-surface-600 dark:text-surface-300 text-sm">{label}</Text>
      <Text className="text-surface-900 dark:text-white font-semibold">{value}</Text>
    </View>
  );
}

// ── Heatmap Calendar ──

function HeatmapCalendar({ data, isDark }: { data: { date: string; count: number }[], isDark: boolean }) {
  // Build a map of date → count
  const countMap = new Map<string, number>();
  let maxCount = 1;
  for (const item of data) {
    countMap.set(item.date, item.count);
    if (item.count > maxCount) maxCount = item.count;
  }

  // Generate last 12 weeks (84 days)
  const cells: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    cells.push({ date: key, count: countMap.get(key) ?? 0 });
  }

  // Group into weeks (columns)
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <View className="flex-row gap-1 justify-center">
      {weeks.map((week, wi) => (
        <View key={wi} className="gap-1">
          {week.map((cell) => {
            const intensity = cell.count / maxCount;
            let bg = isDark ? "#1a1b1e" : "#f1f3f5";
            if (intensity > 0 && intensity <= 0.25) bg = isDark ? "#2b3a67" : "#dbe4ff";
            else if (intensity > 0.25 && intensity <= 0.5) bg = isDark ? "#3b5bdb" : "#91a7ff";
            else if (intensity > 0.5 && intensity <= 0.75) bg = isDark ? "#4c6ef5" : "#748ffc";
            else if (intensity > 0.75) bg = "#5c7cfa";

            return (
              <View
                key={cell.date}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  backgroundColor: bg,
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
