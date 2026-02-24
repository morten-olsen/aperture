import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, TextInput, Pressable, type TextInput as RNTextInput } from 'react-native';
import { YStack, XStack, Text, useTheme } from 'tamagui';
import Animated, { SlideInDown } from 'react-native-reanimated';

import type { ApprovalRequest } from '../../hooks/use-prompt.ts';

import { AnimatedChatItem } from '../animation/animated-chat-item.tsx';
import { GlassView } from '../glass/glass-view.tsx';

import { MarkdownView } from '../markdown/markdown-view.tsx';

import { ApprovalBanner } from './approval-banner.tsx';
import { ChatMessage } from './chat-message.tsx';
import { ModeSelector } from './mode-selector.tsx';
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
  streamingText?: string;
  error?: string | null;
  pendingApproval?: ApprovalRequest | null;
  mode?: string;
  onModeChange?: (mode: string) => void;
  onSend?: (text: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
  contentTopInset?: number;
};

const ChatConversation = ({
  messages,
  isStreaming = false,
  streamingText = '',
  error = null,
  pendingApproval = null,
  mode = 'classic',
  onModeChange,
  onSend,
  onApprove,
  onReject,
  contentTopInset = 0,
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
  const reversedItems = useMemo(() => [...displayItems].reverse(), [displayItems]);

  const renderItem = useCallback(
    ({ item, index }: { item: DisplayItem; index: number }) => {
      const prev = index < reversedItems.length - 1 ? reversedItems[index + 1] : null;
      const sameSender = prev?.kind === 'message' && item.kind === 'message' && prev.entry.role === item.entry.role;

      return (
        <YStack marginBottom={sameSender ? 3 : 12}>
          <AnimatedChatItem kind={item.kind} role={item.kind === 'message' ? item.entry.role : undefined}>
            {item.kind === 'tools' ? <ToolCallGroup tools={item.entries} /> : <ChatMessage data={item.entry} />}
          </AnimatedChatItem>
        </YStack>
      );
    },
    [reversedItems],
  );

  return (
    <YStack flex={1}>
      <FlatList
        inverted
        data={reversedItems}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: contentTopInset + 16, paddingTop: 8 }}
      />

      {pendingApproval && onApprove && onReject && (
        <Animated.View entering={SlideInDown.springify().damping(18).stiffness(200)}>
          <ApprovalBanner approval={pendingApproval} onApprove={onApprove} onReject={onReject} />
        </Animated.View>
      )}

      {isStreaming && (
        <XStack paddingHorizontal="$4">
          {streamingText ? (
            <YStack alignSelf="flex-start" maxWidth="88%">
              <GlassView intensity="medium" borderRadius={20} padding={0} style={{ borderBottomLeftRadius: 8 }}>
                <YStack paddingHorizontal={14} paddingVertical={10}>
                  <MarkdownView content={streamingText} />
                </YStack>
              </GlassView>
            </YStack>
          ) : (
            <StreamingIndicator />
          )}
        </XStack>
      )}

      {error && (
        <XStack paddingHorizontal="$4" paddingVertical="$2">
          <GlassView
            intensity="medium"
            borderRadius={14}
            padding={0}
            style={{ flex: 1, borderColor: 'rgba(239,68,68,0.3)' }}
          >
            <YStack paddingHorizontal={12} paddingVertical={8}>
              <Text fontSize={14} color="$danger">
                {error}
              </Text>
            </YStack>
          </GlassView>
        </XStack>
      )}

      {onModeChange && <ModeSelector value={mode} onChange={onModeChange} />}

      <YStack paddingHorizontal={12} paddingBottom={8}>
        <GlassView intensity="strong" borderRadius={9999} padding={0}>
          <XStack paddingHorizontal={6} paddingVertical={6} gap={8} alignItems="flex-end">
            <XStack
              flex={1}
              backgroundColor="rgba(255,255,255,0.15)"
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
              {canSend ? (
                <XStack
                  width={44}
                  height={44}
                  borderRadius="$full"
                  backgroundColor="$accent"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize={22} fontWeight="500" color="$accentText" marginTop={-2}>
                    ↑
                  </Text>
                </XStack>
              ) : (
                <GlassView
                  intensity="subtle"
                  borderRadius={9999}
                  padding={0}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text fontSize={22} fontWeight="500" color="$colorMuted" marginTop={-2}>
                    ↑
                  </Text>
                </GlassView>
              )}
            </Pressable>
          </XStack>
        </GlassView>
      </YStack>
    </YStack>
  );
};

export type { ChatEntry, ChatConversationProps };
export { ChatConversation };
