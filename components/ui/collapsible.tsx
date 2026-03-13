import { PropsWithChildren, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(isOpen ? '90deg' : '0deg') }],
  }));

  return (
    <View>
      <Pressable
        className="flex-row items-center gap-2 py-2"
        onPress={() => setIsOpen((value) => !value)}
      >
        <Animated.View style={iconStyle}>
          <Icon as={ChevronRight} className="text-muted-foreground" size={18} />
        </Animated.View>
        <Text className="font-semibold">{title}</Text>
      </Pressable>
      {isOpen && <View className="mt-1.5 ml-6">{children}</View>}
    </View>
  );
}
