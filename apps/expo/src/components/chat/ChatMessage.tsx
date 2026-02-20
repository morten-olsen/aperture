import { YStack, Text } from 'tamagui';

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

  return (
    <YStack
      padding="$3"
      marginVertical="$1"
      borderRadius="$3"
      backgroundColor={isUser ? '$blue3' : '$gray3'}
      alignSelf={isUser ? 'flex-end' : 'flex-start'}
      maxWidth="85%"
    >
      <Text>{content}</Text>
    </YStack>
  );
};

export { ChatMessage };
