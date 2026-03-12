import { useState, useCallback } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  FolderCheck,
  Trash2,
  Heart,
  TrendingUp,
  CalendarDays,
} from "lucide-react-native";
import { getStats, getScreenshotsByDate } from "@/lib/database";
import { formatNumber } from "@/lib/utils";
import { useFocusEffect } from "expo-router";

type Stats = {
  total: number;
  unprocessed: number;
  organized: number;
  deleted: number;
  favorited: number;
  folderCount: number;
};

export default function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number }[]>([]);

  const loadStats = useCallback(async () => {
    const [s, h] = await Promise.all([getStats(), getScreenshotsByDate()]);
    setStats(s);
    setHeatmapData(h);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  if (!stats) {
    return (
      <SafeAreaView className="flex-1 bg-surface-950 items-center justify-center">
        <Text className="text-surface-300">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-950">
      <ScrollView className="flex-1 px-6 pt-2" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-white text-2xl font-bold mb-1">Statistics</Text>
        <Text className="text-surface-300 text-sm mb-6">Your screenshot habits at a glance</Text>

        {/* Summary Cards */}
        <View className="flex-row gap-3 mb-4">
          <StatCard
            icon={<Camera size={20} color="#5c7cfa" strokeWidth={2} />}
            label="Total"
            value={stats.total}
            bgColor="#5c7cfa15"
          />
          <StatCard
            icon={<FolderCheck size={20} color="#51cf66" strokeWidth={2} />}
            label="Organized"
            value={stats.organized}
            bgColor="#51cf6615"
          />
        </View>
        <View className="flex-row gap-3 mb-6">
          <StatCard
            icon={<Trash2 size={20} color="#ff6b6b" strokeWidth={2} />}
            label="Deleted"
            value={stats.deleted}
            bgColor="#ff6b6b15"
          />
          <StatCard
            icon={<Heart size={20} color="#ffd43b" strokeWidth={2} />}
            label="Favorites"
            value={stats.favorited}
            bgColor="#ffd43b15"
          />
        </View>

        {/* Efficiency Score */}
        <View className="bg-surface-800 rounded-2xl p-5 mb-6">
          <View className="flex-row items-center gap-2 mb-3">
            <TrendingUp size={18} color="#51cf66" strokeWidth={2} />
            <Text className="text-white font-semibold text-base">Efficiency</Text>
          </View>
          {stats.total > 0 ? (
            <>
              <Text className="text-4xl font-bold text-white">
                {Math.round((stats.organized / stats.total) * 100)}%
              </Text>
              <Text className="text-surface-300 text-sm mt-1">
                of screenshots organized into folders
              </Text>
              {/* Progress bar */}
              <View className="h-2 bg-surface-700 rounded-full mt-3 overflow-hidden">
                <View
                  className="h-full bg-accent-green rounded-full"
                  style={{
                    width: `${Math.round((stats.organized / stats.total) * 100)}%`,
                  }}
                />
              </View>
            </>
          ) : (
            <Text className="text-surface-300 text-sm">
              Take some screenshots to see your stats!
            </Text>
          )}
        </View>

        {/* Screenshot Heatmap */}
        <View className="bg-surface-800 rounded-2xl p-5 mb-6">
          <View className="flex-row items-center gap-2 mb-4">
            <CalendarDays size={18} color="#748ffc" strokeWidth={2} />
            <Text className="text-white font-semibold text-base">
              Activity Heatmap
            </Text>
          </View>
          {heatmapData.length > 0 ? (
            <HeatmapCalendar data={heatmapData} />
          ) : (
            <Text className="text-surface-300 text-sm text-center py-4">
              No activity data yet
            </Text>
          )}
        </View>

        {/* Quick Stats Row */}
        <View className="bg-surface-800 rounded-2xl p-5">
          <Text className="text-white font-semibold text-base mb-3">Overview</Text>
          <QuickStat label="Active Folders" value={formatNumber(stats.folderCount)} />
          <QuickStat label="Awaiting Triage" value={formatNumber(stats.unprocessed)} />
          <QuickStat
            label="Organization Rate"
            value={
              stats.total > 0
                ? `${formatNumber(stats.organized)}/${formatNumber(stats.total)}`
                : "—"
            }
          />
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
    <View className="flex-1 bg-surface-800 rounded-2xl p-4">
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mb-3"
        style={{ backgroundColor: bgColor }}
      >
        {icon}
      </View>
      <Text className="text-white text-2xl font-bold">{formatNumber(value)}</Text>
      <Text className="text-surface-300 text-xs mt-1">{label}</Text>
    </View>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-surface-700 last:border-b-0">
      <Text className="text-surface-300 text-sm">{label}</Text>
      <Text className="text-white font-semibold">{value}</Text>
    </View>
  );
}

// ── Heatmap Calendar ──

function HeatmapCalendar({ data }: { data: { date: string; count: number }[] }) {
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
            let bg = "#1a1b1e";
            if (intensity > 0 && intensity <= 0.25) bg = "#2b3a67";
            else if (intensity > 0.25 && intensity <= 0.5) bg = "#3b5bdb";
            else if (intensity > 0.5 && intensity <= 0.75) bg = "#4c6ef5";
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
