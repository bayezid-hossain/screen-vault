import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { FolderInput, Heart, Trash2, X } from "lucide-react-native";
import { View } from "react-native";
import Animated, {
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";

type SelectionToolbarProps = {
  count: number;
  onDelete: () => void;
  onFavorite: () => void;
  onOrganize: () => void;
  onCancel: () => void;
};

export function SelectionToolbar({
  count,
  onDelete,
  onFavorite,
  onOrganize,
  onCancel,
}: SelectionToolbarProps) {
  return (
    <Animated.View
      entering={SlideInDown.duration(250).springify()}
      exiting={SlideOutDown.duration(200)}
      className="absolute bottom-0 left-0 right-0 pb-8 px-4"
    >
      <View className="bg-surface-900 dark:bg-surface-800 rounded-2xl flex-row items-center justify-between px-4 py-3 border border-surface-700/50 shadow-lg">
        {/* Count + Cancel */}
        <View className="flex-row items-center gap-2">
          <View className="bg-primary-600 rounded-full px-2.5 py-0.5 min-w-[28px] items-center">
            <Text className="text-white text-xs font-bold">{count}</Text>
          </View>
          <Button
            variant="ghost"
            size="icon"
            onPress={onCancel}
            className="h-9 w-9 rounded-full"
          >
            <Icon as={X} className="text-white" size={18} strokeWidth={2} />
          </Button>
        </View>

        {/* Actions */}
        <View className="flex-row items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onPress={onDelete}
            className="h-10 w-10 rounded-xl bg-accent-red/10"
          >
            <Icon as={Trash2} className="text-destructive" size={18} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onPress={onFavorite}
            className="h-10 w-10 rounded-xl bg-accent-amber/10"
          >
            <Icon as={Heart} className="text-accent-amber" size={18} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onPress={onOrganize}
            className="h-10 w-10 rounded-xl bg-accent-green/10"
          >
            <Icon as={FolderInput} className="text-accent-green" size={18} strokeWidth={2} />
          </Button>
        </View>
      </View>
    </Animated.View>
  );
}
