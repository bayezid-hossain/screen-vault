import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FolderTree, Grid3X3, Layers, List } from "lucide-react-native";
import { View } from "react-native";

export type ViewType = "grid" | "list" | "swipe" | "path";

const VIEW_TYPE_KEY = "screenvault_view_type";

const VIEW_OPTIONS: { type: ViewType; Icon: typeof Grid3X3 }[] = [
  { type: "path", Icon: FolderTree },
  { type: "grid", Icon: Grid3X3 },
  { type: "list", Icon: List },
  { type: "swipe", Icon: Layers },
];

export function ViewTypeSwitcher({
  value,
  onChange,
}: {
  value: ViewType;
  onChange: (type: ViewType) => void;
}) {
  const theme = useAppStore((s) => s.theme);
  const isDark = theme === "dark";

  return (
    <View className="flex-row bg-surface-100 dark:bg-surface-800 rounded-xl p-1 gap-0.5">
      {VIEW_OPTIONS.map(({ type, Icon }) => {
        const isActive = value === type;
        return (
          <Button
            key={type}
            variant="ghost"
            size="icon"
            onPress={() => onChange(type)}
            className={`rounded-lg h-8 w-8 ${isActive
                ? "bg-white dark:bg-surface-700"
                : "bg-transparent"
              }`}
          >
            <Icon
              size={16}
              strokeWidth={2}
              color={isActive ? (isDark ? "#fff" : "#1a1b1e") : "#868e96"}
            />
          </Button>
        );
      })}
    </View>
  );
}

// Persistence helpers
export async function loadViewType(): Promise<ViewType> {
  try {
    const stored = await AsyncStorage.getItem(VIEW_TYPE_KEY);
    if (stored === "grid" || stored === "list" || stored === "swipe" || stored === "path") {
      return stored;
    }
  } catch { }
  return "path";
}

export async function saveViewType(type: ViewType): Promise<void> {
  await AsyncStorage.setItem(VIEW_TYPE_KEY, type);
}

