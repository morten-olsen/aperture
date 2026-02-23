import { Pressable } from 'react-native';
import { YStack, XStack, Text } from 'tamagui';
import { ChevronRight, Lock } from '@tamagui/lucide-icons';

import type { ToolOutput } from '../../generated/tools.ts';
import { formatRelativeTime } from '../../utils/format-time.ts';
import { GlassView } from '../glass/glass-view.tsx';

type SecretSummary = ToolOutput<'configuration.secrets.list'>['secrets'][number];

type SecretListItemProps = {
  secret: SecretSummary;
  onPress: () => void;
};

const SecretListItem = ({ secret, onPress }: SecretListItemProps) => (
  <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
    <YStack marginHorizontal={16} marginVertical={4}>
      <GlassView intensity="subtle" borderRadius={9999} padding={12}>
        <XStack alignItems="center" gap={12}>
          <Lock size={18} color="$accent" />

          <YStack flex={1} gap={2}>
            <Text fontSize={16} fontWeight="600" letterSpacing={-0.2} color="$color" numberOfLines={1}>
              {secret.name}
            </Text>

            <XStack alignItems="center" gap={8}>
              {secret.description ? (
                <Text fontSize={12} color="$colorMuted" numberOfLines={1}>
                  {secret.description}
                </Text>
              ) : (
                <Text fontSize={12} color="$colorMuted">
                  updated {formatRelativeTime(secret.updatedAt)}
                </Text>
              )}
            </XStack>
          </YStack>

          <ChevronRight size={18} color="$colorMuted" />
        </XStack>
      </GlassView>
    </YStack>
  </Pressable>
);

export type { SecretListItemProps, SecretSummary };
export { SecretListItem };
