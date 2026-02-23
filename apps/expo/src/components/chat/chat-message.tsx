import { LinearGradient } from 'expo-linear-gradient';
import { YStack, XStack, Text } from 'tamagui';

import { formatRelativeTime } from '../../utils/format-time.ts';
import { GlassView } from '../glass/glass-view.tsx';
import { MarkdownView } from '../markdown/markdown-view.tsx';

type ChatMessageProps = {
  data: {
    type: string;
    content?: string;
    role?: string;
    start?: string;
    [key: string]: unknown;
  };
};

const ChatMessage = ({ data }: ChatMessageProps) => {
  const isUser = data.role === 'user';
  const content = data.content ?? '';
  const timestamp = data.start ? formatRelativeTime(data.start) : null;

  if (isUser) {
    return (
      <YStack alignSelf="flex-end" maxWidth="75%" gap={3}>
        <YStack
          borderRadius={20}
          borderBottomRightRadius={8}
          overflow="hidden"
          shadowColor="#4F6DF5"
          shadowOpacity={0.25}
          shadowRadius={12}
          shadowOffset={{ width: 0, height: 4 }}
        >
          <LinearGradient
            colors={['#4F6DF5', '#9B5DE5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 14, paddingVertical: 10 }}
          >
            <Text fontSize={16} lineHeight={21} letterSpacing={-0.1} color="white">
              {content}
            </Text>
          </LinearGradient>
        </YStack>
        {timestamp && (
          <XStack justifyContent="flex-end" paddingHorizontal={4}>
            <Text fontSize={11} color="$colorMuted">
              {timestamp}
            </Text>
          </XStack>
        )}
      </YStack>
    );
  }

  return (
    <YStack alignSelf="flex-start" maxWidth="88%" gap={3}>
      <GlassView
        intensity="medium"
        borderRadius={20}
        padding={0}
        style={{
          borderBottomLeftRadius: 8,
        }}
      >
        <YStack paddingHorizontal={14} paddingVertical={10}>
          <MarkdownView content={content} />
        </YStack>
      </GlassView>
      {timestamp && (
        <XStack paddingHorizontal={4}>
          <Text fontSize={11} color="$colorMuted">
            {timestamp}
          </Text>
        </XStack>
      )}
    </YStack>
  );
};

export { ChatMessage };
