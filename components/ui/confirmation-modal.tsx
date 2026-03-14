import { AlertTriangle, LucideIcon, Trash2 } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { BottomSheetModal } from "./bottom-sheet-modal";
import { Button } from "./button";
import { Icon } from "./icon";
import { Text } from "./text";

type ConfirmationModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  confirmIcon?: LucideIcon;
  icon?: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
};

export function ConfirmationModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "destructive",
  confirmIcon = Trash2,
  icon = AlertTriangle,
  iconColor = "#fa5252", // destructive red
  iconBgColor = "rgba(250, 82, 82, 0.1)", // light red bg
}: ConfirmationModalProps) {
  return (
    <BottomSheetModal open={visible} onOpenChange={onClose}>
      <View className="px-6 py-8 items-center">
        <View
          className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
          style={{ backgroundColor: iconBgColor }}
        >
          <Icon as={icon} color={iconColor} size={32} strokeWidth={2} />
        </View>

        <Text className="text-black dark:text-white text-xl font-bold text-center mb-2">
          {title}
        </Text>

        <Text className="text-surface-500 dark:text-white text-sm text-center mb-8 px-4">
          {message}
        </Text>

        <View className="flex-row gap-3 w-full">
          <Button
            variant="outline"
            onPress={onClose}
            className="flex-1 rounded-xl py-3.5 h-auto"
          >
            <Text className="text-surface-600 dark:text-white font-bold">Cancel</Text>
          </Button>

          <Button
            variant={confirmVariant}
            onPress={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 rounded-xl py-3.5 h-auto flex-row gap-2"
          >
            {confirmIcon && <Icon as={confirmIcon} className={confirmVariant === 'destructive' ? 'text-white' : ''} size={18} strokeWidth={2} />}
            <Text className={`${confirmVariant === 'destructive' ? 'text-white' : 'text-black dark:text-white'} font-bold`}>
              {confirmLabel}
            </Text>
          </Button>
        </View>
      </View>
    </BottomSheetModal>
  );
}
