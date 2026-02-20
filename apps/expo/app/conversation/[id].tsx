import { useCallback, useRef, useState } from 'react';
import { FlatList, type TextInput as RNTextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { YStack, XStack, Input, Button } from 'tamagui';

import { useToolQuery } from '../../src/hooks/use-tools';
import { usePrompt, type PromptOutput } from '../../src/hooks/use-prompt';
import { ChatMessage } from '../../src/components/chat/ChatMessage';
import { ToolCallCard } from '../../src/components/chat/ToolCallCard';
import { ApprovalBanner } from '../../src/components/chat/ApprovalBanner';
import { StreamingIndicator } from '../../src/components/chat/StreamingIndicator';

type HistoryEntry = {
  type: string;
  content?: string;
  role?: string;
  [key: string]: unknown;
};

type Prompt = {
  input: string;
  output: HistoryEntry[];
  [key: string]: unknown;
};

const flattenPrompts = (prompts: unknown[]): HistoryEntry[] => {
  const entries: HistoryEntry[] = [];
  for (const prompt of prompts as Prompt[]) {
    entries.push({ type: 'text', role: 'user', content: prompt.input });
    if (prompt.output) {
      for (const entry of prompt.output) {
        entries.push(entry);
      }
    }
  }
  return entries;
};

const ChatScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [text, setText] = useState('');
  const inputRef = useRef<RNTextInput>(null);
  const { data } = useToolQuery('conversation.get', { id });
  const { send, outputs, pendingApproval, isStreaming, error, approve, reject } = usePrompt();
  const [pendingInput, setPendingInput] = useState<string | null>(null);

  const history = flattenPrompts(data?.result.prompts ?? []);

  const allMessages: (HistoryEntry | PromptOutput)[] = [
    ...history,
    ...(pendingInput ? [{ type: 'text', role: 'user', content: pendingInput }] : []),
    ...outputs,
  ];

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    const input = text.trim();
    setPendingInput(input);
    send(input, { conversationId: id });
    setText('');
    inputRef.current?.blur();
  }, [text, send, id]);

  const renderItem = useCallback(({ item }: { item: HistoryEntry | PromptOutput }) => {
    if (item.type === 'tool') {
      return <ToolCallCard data={item} />;
    }
    return <ChatMessage data={item} />;
  }, []);

  return (
    <YStack flex={1}>
      <FlatList
        data={allMessages}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
      />

      {pendingApproval && (
        <ApprovalBanner
          approval={pendingApproval}
          onApprove={() => approve(pendingApproval.toolCallId)}
          onReject={() => reject(pendingApproval.toolCallId)}
        />
      )}

      {isStreaming && <StreamingIndicator />}

      {error && (
        <YStack padding="$2" backgroundColor="$red2">
          <ChatMessage data={{ type: 'text', content: `Error: ${error.message}` }} />
        </YStack>
      )}

      <XStack padding="$3" gap="$2" borderTopWidth={1} borderTopColor="$borderColor">
        <Input
          ref={inputRef}
          flex={1}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Button theme="active" onPress={handleSend} disabled={!text.trim() || isStreaming}>
          Send
        </Button>
      </XStack>
    </YStack>
  );
};

export default ChatScreen;
