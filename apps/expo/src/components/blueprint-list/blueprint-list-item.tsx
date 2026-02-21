import { Pressable } from 'react-native';
import { YStack, XStack, Text } from 'tamagui';
import { ChevronRight } from '@tamagui/lucide-icons';

import type { ToolOutput } from '../../generated/tools.ts';
import { GlassView } from '../glass/glass-view.tsx';

type BlueprintSummary = ToolOutput<'blueprint.list'>['blueprints'][number];

type BlueprintListItemProps = {
  blueprint: BlueprintSummary;
  onPress: () => void;
};

const BlueprintListItem = ({ blueprint, onPress }: BlueprintListItemProps) => (
  <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
    <YStack marginHorizontal={16} marginVertical={4}>
      <GlassView intensity="subtle" borderRadius={9999} padding={12}>
        <XStack alignItems="center" gap={12}>
          <YStack flex={1} gap={2}>
            <Text fontSize={16} fontWeight="600" letterSpacing={-0.2} color="$color" numberOfLines={1}>
              {blueprint.title}
            </Text>
            <Text fontSize={13} color="$colorMuted" numberOfLines={1}>
              {blueprint.use_case}
            </Text>
          </YStack>
          <ChevronRight size={18} color="$colorMuted" />
        </XStack>
      </GlassView>
    </YStack>
  </Pressable>
);

export type { BlueprintListItemProps, BlueprintSummary };
export { BlueprintListItem };
