import { View, Dimensions, Pressable } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Crop, EyeOff, Save, RotateCcw } from "lucide-react-native";
import { useState, useCallback } from "react";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function EditorScreen() {
  const { uri, screenshotId } = useLocalSearchParams<{
    uri: string;
    screenshotId: string;
  }>();
  const router = useRouter();
  const [editedUri, setEditedUri] = useState(uri);
  const [isSaving, setIsSaving] = useState(false);

  const handleCrop = useCallback(async () => {
    if (!editedUri) return;
    try {
      // Basic center crop (removes 10% from each edge)
      const result = await ImageManipulator.manipulateAsync(
        editedUri,
        [
          {
            crop: {
              originX: 50,
              originY: 100,
              width: SCREEN_WIDTH * 2 - 100,
              height: SCREEN_WIDTH * 3 - 200,
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.PNG }
      );
      setEditedUri(result.uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Crop failed:", error);
    }
  }, [editedUri]);

  const handleBlur = useCallback(async () => {
    if (!editedUri) return;
    try {
      // Downscale then upscale to create a blur effect on the top area (status bar)
      const result = await ImageManipulator.manipulateAsync(
        editedUri,
        [
          { resize: { width: 50 } },
          { resize: { width: SCREEN_WIDTH * 2 } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.PNG }
      );
      setEditedUri(result.uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Blur failed:", error);
    }
  }, [editedUri]);

  const handleReset = useCallback(() => {
    setEditedUri(uri);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [uri]);

  const handleSave = useCallback(async () => {
    if (!editedUri || !screenshotId) return;
    setIsSaving(true);
    try {
      const { updateScreenshotUri } = await import("@/lib/database");
      await updateScreenshotUri(parseInt(screenshotId, 10), editedUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSaving(false);
    }
  }, [editedUri, screenshotId, router]);

  return (
    <SafeAreaView className="flex-1 bg-surface-950">
      {/* Header */}
      <View className="px-4 pt-2 pb-3 flex-row items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => router.back()}
          className="rounded-full"
        >
          <ArrowLeft size={22} color="#fff" strokeWidth={2} />
        </Button>
        <Text className="text-white text-lg font-bold">Editor</Text>
        <Button
          onPress={handleSave}
          disabled={isSaving || editedUri === uri}
          className="bg-primary-600 px-4 h-10 rounded-xl flex-row items-center gap-1.5"
          style={{ opacity: editedUri === uri ? 0.5 : 1 }}
        >
          <Save size={16} color="#fff" strokeWidth={2} />
          <Text className="text-white font-semibold text-sm">
            {isSaving ? "Saving..." : "Save"}
          </Text>
        </Button>
      </View>

      {/* Image Preview */}
      <View className="flex-1 mx-4 my-2 rounded-2xl overflow-hidden bg-surface-800">
        {editedUri ? (
          <Image
            source={{ uri: editedUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            transition={150}
          />
        ) : null}
      </View>

      {/* Tools */}
      <View className="px-6 py-4 flex-row items-center justify-around">
        <ToolButton icon={<Crop size={22} color="#fff" />} label="Crop" onPress={handleCrop} />
        <ToolButton icon={<EyeOff size={22} color="#fff" />} label="Blur" onPress={handleBlur} />
        <ToolButton
          icon={<RotateCcw size={22} color="#fff" />}
          label="Reset"
          onPress={handleReset}
        />
      </View>
    </SafeAreaView>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      className="items-center gap-1.5 h-auto p-0"
    >
      <View className="w-14 h-14 rounded-2xl bg-surface-700 items-center justify-center">
        {icon}
      </View>
      <Text className="text-surface-300 text-xs">{label}</Text>
    </Button>
  );
}
