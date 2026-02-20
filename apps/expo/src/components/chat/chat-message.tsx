import { LinearGradient } from 'expo-linear-gradient';
import { YStack, Text } from 'tamagui';

import { GlassView } from '../glass/glass-view.tsx';
import { MarkdownView } from '../markdown/markdown-view.tsx';

type ChatMessageProps = {
  data: {
    type: string;
    content?: string;
    role?: string;
    [key: string]: unknown;
  };
};

const ChatMessage = ({ data }: ChatMessageProps) => {
  const isUser = data.role === 'user';
  const content = data.content ?? '';

  if (isUser) {
    return (
      <YStack
        borderRadius={20}
        borderBottomRightRadius={8}
        alignSelf="flex-end"
        maxWidth="75%"
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
    );
  }

  return (
    <GlassView
      intensity="medium"
      borderRadius={20}
      padding={0}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '88%',
        borderBottomLeftRadius: 8,
      }}
    >
      <YStack paddingHorizontal={14} paddingVertical={10}>
        <MarkdownView content={content} />
      </YStack>
    </GlassView>
  );
};

export { ChatMessage };
