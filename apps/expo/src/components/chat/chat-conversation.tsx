import { useCallback, useRef, useState } from 'react';
import { FlatList, TextInput, Pressable, type TextInput as RNTextInput } from 'react-native';
import { YStack, XStack, Text, useTheme } from 'tamagui';

import type { ApprovalRequest } from '../../hooks/use-prompt.ts';

import { ApprovalBanner } from './approval-banner.tsx';
import { ChatMessage } from './chat-message.tsx';
import { StreamingIndicator } from './streaming-indicator.tsx';
import { ToolCallGroup } from './tool-call-card.tsx';

type ChatEntry = {
  type: string;
  content?: string;
  role?: string;
  function?: string;
  input?: unknown;
  result?: unknown;
  [key: string]: unknown;
};

type DisplayItem = { kind: 'message'; entry: ChatEntry } | { kind: 'tools'; entries: ChatEntry[] };

const groupMessages = (messages: ChatEntry[]): DisplayItem[] => {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < messages.length) {
    if (messages[i].type === 'tool') {
      const tools: ChatEntry[] = [];
      while (i < messages.length && messages[i].type === 'tool') {
        tools.push(messages[i]);
        i++;
      }
      items.push({ kind: 'tools', entries: tools });
    } else {
      items.push({ kind: 'message', entry: messages[i] });
      i++;
    }
  }
  return items;
};

type ChatConversationProps = {
  messages: ChatEntry[];
  isStreaming?: boolean;
  error?: string | null;
  pendingApproval?: ApprovalRequest | null;
  onSend?: (text: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
};

const ChatConversation = ({
  messages,
  isStreaming = false,
  error = null,
  pendingApproval = null,
  onSend,
  onApprove,
  onReject,
}: ChatConversationProps) => {
  const [text, setText] = useState('');
  const inputRef = useRef<RNTextInput>(null);
  const canSend = text.trim().length > 0 && !isStreaming;
  const theme = useTheme();

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    onSend?.(text.trim());
    setText('');
    inputRef.current?.blur();
  }, [text, onSend]);

  const displayItems = groupMessages(messages);

  const renderItem = useCallback(
    ({ item, index }: { item: DisplayItem; index: number }) => {
      const prev = index > 0 ? displayItems[index - 1] : null;
      const sameSender = prev?.kind === 'message' && item.kind === 'message' && prev.entry.role === item.entry.role;

      return (
        <YStack marginTop={sameSender ? 3 : 12}>
          {item.kind === 'tools' ? <ToolCallGroup tools={item.entries} /> : <ChatMessage data={item.entry} />}
        </YStack>
      );
    },
    [displayItems],
  );

  return (
    <YStack flex={1}>
      <FlatList
        data={displayItems}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}
      />

      {pendingApproval && onApprove && onReject && (
        <ApprovalBanner approval={pendingApproval} onApprove={onApprove} onReject={onReject} />
      )}

      {isStreaming && (
        <XStack paddingHorizontal="$4">
          <StreamingIndicator />
        </XStack>
      )}

      {error && (
        <XStack paddingHorizontal="$4" paddingVertical="$2">
          <YStack
            flex={1}
            paddingHorizontal="$3"
            paddingVertical="$2"
            backgroundColor="$dangerSurface"
            borderRadius={14}
          >
            <Text fontSize={14} color="$danger">
              {error}
            </Text>
          </YStack>
        </XStack>
      )}

      <XStack paddingHorizontal={12} paddingVertical={10} gap={8} alignItems="flex-end">
        <XStack
          flex={1}
          backgroundColor="$surfaceHover"
          borderRadius="$input"
          paddingHorizontal={16}
          alignItems="center"
          minHeight={44}
        >
          <TextInput
            ref={inputRef}
            style={{
              flex: 1,
              fontSize: 16,
              letterSpacing: -0.1,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              color: theme.color?.val,
              paddingVertical: 11,
            }}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={theme.colorMuted?.val}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
        </XStack>
        <Pressable onPress={canSend ? handleSend : undefined}>
          <XStack
            width={44}
            height={44}
            borderRadius="$full"
            backgroundColor={canSend ? '$accent' : '$surfaceHover'}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={22} fontWeight="500" color={canSend ? '$accentText' : '$colorMuted'} marginTop={-2}>
              ↑
            </Text>
          </XStack>
        </Pressable>
      </XStack>
    </YStack>
  );
};

export type { ChatEntry, ChatConversationProps };
export { ChatConversation };
