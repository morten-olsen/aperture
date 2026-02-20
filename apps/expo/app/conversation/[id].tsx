import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import Animated from 'react-native-reanimated';

import { useToolQuery } from '../../src/hooks/use-tools';
import { usePrompt, type PromptOutput } from '../../src/hooks/use-prompt';
import { useMountAnimation } from '../../src/hooks/use-mount-animation';
import { ChatConversation } from '../../src/components/chat/chat-conversation';
import { GlassView } from '../../src/components/glass/glass-view';

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
    if (prompt.input) {
      entries.push({ type: 'text', role: 'user', content: prompt.input });
    }
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useToolQuery('conversation.get', { id });
  const { send, outputs, pendingApproval, isStreaming, error, approve, reject } = usePrompt();
  const [pendingInput, setPendingInput] = useState<string | null>(null);

  const history = flattenPrompts(data?.result.prompts ?? []);

  const allMessages: (HistoryEntry | PromptOutput)[] = [
    ...history,
    ...(pendingInput ? [{ type: 'text', role: 'user', content: pendingInput }] : []),
    ...outputs,
  ];

  const handleSend = useCallback(
    (text: string) => {
      setPendingInput(text);
      send(text, { conversationId: id });
    },
    [send, id],
  );

  const headerAnim = useMountAnimation({ translateY: -10, duration: 300, delay: 200 });
  const headerHeight = insets.top + 12 + 24 + 12;

  const content = (
    <YStack flex={1} paddingBottom={insets.bottom}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }, headerAnim.style]}>
        <GlassView intensity="strong" borderRadius={0} padding={0}>
          <XStack paddingHorizontal={16} paddingTop={insets.top + 12} paddingBottom={12}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ArrowLeft size={24} color="$accent" />
            </Pressable>
          </XStack>
        </GlassView>
      </Animated.View>

      <ChatConversation
        messages={allMessages}
        isStreaming={isStreaming}
        error={error?.message ?? null}
        pendingApproval={pendingApproval}
        onSend={handleSend}
        onApprove={pendingApproval ? () => approve(pendingApproval.toolCallId) : undefined}
        onReject={pendingApproval ? () => reject(pendingApproval.toolCallId) : undefined}
        contentTopInset={headerHeight}
      />
    </YStack>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
};

export default ChatScreen;
