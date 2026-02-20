import { YStack, Text } from 'tamagui';

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
        paddingHorizontal={14}
        paddingVertical={10}
        borderRadius="$bubble"
        borderBottomRightRadius="$badge"
        backgroundColor="$chatUser"
        alignSelf="flex-end"
        maxWidth="75%"
      >
        <Text fontSize={16} lineHeight={21} letterSpacing={-0.1} color="$chatUserText">
          {content}
        </Text>
      </YStack>
    );
  }

  return (
    <YStack
      paddingHorizontal={14}
      paddingVertical={10}
      borderRadius="$bubble"
      borderBottomLeftRadius="$badge"
      backgroundColor="$chatAssistant"
      borderWidth={1}
      borderColor="$chatAssistantBorder"
      alignSelf="flex-start"
      maxWidth="88%"
    >
      <MarkdownView content={content} />
    </YStack>
  );
};

export { ChatMessage };
