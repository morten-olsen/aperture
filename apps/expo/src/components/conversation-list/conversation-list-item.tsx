import { Pressable } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';

import { formatRelativeTime } from '../../utils/format-time.ts';
import { GlassView } from '../glass/glass-view.tsx';

type ConversationListItemProps = {
  id: string;
  updatedAt: string;
  onPress: () => void;
};

const ConversationListItem = ({ id, updatedAt, onPress }: ConversationListItemProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const initials = id.slice(0, 2).toUpperCase();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <YStack marginHorizontal={16} marginVertical={4}>
        <GlassView intensity="subtle" borderRadius={9999} padding={14}>
          <XStack alignItems="center" gap={16}>
            <XStack
              width={52}
              height={52}
              borderRadius="$full"
              backgroundColor={isDark ? 'rgba(79,109,245,0.2)' : '$accentSurface'}
              borderWidth={isDark ? 1 : 0}
              borderColor="rgba(79,109,245,0.15)"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize={18} fontWeight="600" color="$accent">
                {initials}
              </Text>
            </XStack>

            <YStack flex={1} gap={3}>
              <XStack justifyContent="space-between" alignItems="center" gap={8}>
                <Text flex={1} fontSize={16} fontWeight="600" letterSpacing={-0.2} color="$color" numberOfLines={1}>
                  {id}
                </Text>
                <Text fontSize={13} color="$colorMuted" flexShrink={0}>
                  {formatRelativeTime(updatedAt)}
                </Text>
              </XStack>
              <Text fontSize={14} color="$colorSubtle" numberOfLines={1}>
                Tap to continue conversation...
              </Text>
            </YStack>
          </XStack>
        </GlassView>
      </YStack>
    </Pressable>
  );
};

export type { ConversationListItemProps };
export { ConversationListItem };
