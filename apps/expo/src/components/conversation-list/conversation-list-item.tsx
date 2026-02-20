import { Pressable } from 'react-native';
import { YStack, XStack, Text } from 'tamagui';

import { formatRelativeTime } from '../../utils/format-time.ts';

type ConversationListItemProps = {
  id: string;
  updatedAt: string;
  onPress: () => void;
};

const ConversationListItem = ({ id, updatedAt, onPress }: ConversationListItemProps) => {
  const initials = id.slice(0, 2).toUpperCase();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack paddingHorizontal="$5" paddingVertical="$3.5" alignItems="center" gap="$4">
        <XStack
          width={52}
          height={52}
          borderRadius="$full"
          backgroundColor="$accentSurface"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={18} fontWeight="600" color="$accent">
            {initials}
          </Text>
        </XStack>

        <YStack flex={1} gap={3}>
          <XStack justifyContent="space-between" alignItems="center" gap="$2">
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
    </Pressable>
  );
};

export type { ConversationListItemProps };
export { ConversationListItem };
