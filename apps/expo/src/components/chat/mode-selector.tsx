import { Pressable } from 'react-native';
import { XStack, Text } from 'tamagui';
import { Code, MessageSquare } from '@tamagui/lucide-icons';

import { GlassView } from '../glass/glass-view.tsx';

type ModeOption = {
  id: string;
  label: string;
  icon: typeof Code;
};

const modes: ModeOption[] = [
  { id: 'classic', label: 'Classic', icon: MessageSquare },
  { id: 'code', label: 'Code', icon: Code },
];

type ModeSelectorProps = {
  value: string;
  onChange: (mode: string) => void;
};

const ModeSelector = ({ value, onChange }: ModeSelectorProps) => {
  return (
    <XStack gap={6} paddingHorizontal={14} paddingBottom={6}>
      {modes.map((mode) => {
        const isActive = mode.id === value;
        const Icon = mode.icon;
        return (
          <Pressable key={mode.id} onPress={() => onChange(mode.id)}>
            <GlassView intensity={isActive ? 'medium' : 'subtle'} borderRadius={9999} padding={0}>
              <XStack paddingHorizontal={12} paddingVertical={6} gap={6} alignItems="center">
                <Icon size={14} color={isActive ? '$accent' : '$colorMuted'} />
                <Text fontSize={13} fontWeight={isActive ? '600' : '400'} color={isActive ? '$accent' : '$colorMuted'}>
                  {mode.label}
                </Text>
              </XStack>
            </GlassView>
          </Pressable>
        );
      })}
    </XStack>
  );
};

export type { ModeSelectorProps };
export { ModeSelector };
