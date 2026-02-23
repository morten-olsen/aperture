import { useCallback, useState, useMemo } from 'react';
import { Pressable, Modal, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { Menu, Settings, MessageSquare } from '@tamagui/lucide-icons';
import Animated, { SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';

import { useToolQuery, useToolInvoke } from '../src/hooks/use-tools';
import { useSession } from '../src/hooks/use-session';
import { usePrompt, type PromptOutput } from '../src/hooks/use-prompt';
import { useMountAnimation } from '../src/hooks/use-mount-animation';
import { ChatConversation } from '../src/components/chat/chat-conversation';
import { ConversationSidebar } from '../src/components/conversation-sidebar/conversation-sidebar';
import { SettingsSheet } from '../src/components/settings-sheet/settings-sheet';
import { GlassView } from '../src/components/glass/glass-view';
import { KeyboardAwareView } from '../src/components/keyboard/keyboard-aware-view';

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

const SIDEBAR_WIDTH = 280;
const BREAKPOINT_SM = 660;

const HomeScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();

  const isLargeScreen = screenWidth >= BREAKPOINT_SM;

  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [pendingInput, setPendingInput] = useState<string | null>(null);

  // Fetch active conversation
  const { data: activeData, refetch: refetchActive } = useToolQuery('conversation.getActive', {});
  const activeConversation = activeData ?? null;
  const activeId = activeConversation?.id ?? null;

  // Fetch conversation list
  const { data: listData, refetch: refetchList, isLoading: isListLoading } = useToolQuery('conversation.list', {});
  const conversations = listData?.conversations ?? [];

  // Fetch full conversation if we have an active one
  const { data: conversationData } = useToolQuery('conversation.get', { id: activeId ?? '' }, { enabled: !!activeId });

  // Mutations
  const createConversation = useToolInvoke('conversation.create');
  const setActiveConversation = useToolInvoke('conversation.setActive');

  // Chat
  const { send, outputs, pendingApproval, isStreaming, error, approve, reject } = usePrompt();

  const history = useMemo(() => flattenPrompts(conversationData?.prompts ?? []), [conversationData?.prompts]);

  const allMessages: (HistoryEntry | PromptOutput)[] = useMemo(
    () => [...history, ...(pendingInput ? [{ type: 'text', role: 'user', content: pendingInput }] : []), ...outputs],
    [history, pendingInput, outputs],
  );

  const handleCreate = useCallback(async () => {
    const result = await createConversation.mutateAsync({});
    await setActiveConversation.mutateAsync({ conversationId: result.id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'conversation.list'] });
    queryClient.invalidateQueries({ queryKey: ['tool', 'conversation.getActive'] });
    setSidebarVisible(false);
  }, [createConversation, setActiveConversation, queryClient]);

  const handleSelect = useCallback(
    async (id: string) => {
      if (id === activeId) {
        setSidebarVisible(false);
        return;
      }
      await setActiveConversation.mutateAsync({ conversationId: id });
      queryClient.invalidateQueries({ queryKey: ['tool', 'conversation.getActive'] });
      queryClient.invalidateQueries({ queryKey: ['tool', 'conversation.get'] });
      setPendingInput(null);
      setSidebarVisible(false);
    },
    [activeId, setActiveConversation, queryClient],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (!activeId) return;
      setPendingInput(text);
      send(text, { conversationId: activeId });
    },
    [send, activeId],
  );

  const handleLogout = useCallback(async () => {
    setSettingsVisible(false);
    await session.logout();
  }, [session]);

  const handleNavigateSettings = useCallback(
    (route: 'secrets' | 'triggers' | 'blueprints' | 'tasks' | 'appearance') => {
      const routeMap = {
        secrets: '/settings/secrets',
        triggers: '/settings/triggers',
        blueprints: '/settings/blueprints',
        tasks: '/settings/tasks',
        appearance: '/settings/appearance',
      };
      router.push(routeMap[route] as never);
    },
    [router],
  );

  const handleRefresh = useCallback(() => {
    refetchList();
    refetchActive();
  }, [refetchList, refetchActive]);

  const headerAnim = useMountAnimation({ translateY: -10, duration: 300, delay: 200 });
  const headerHeight = insets.top + 12 + 24 + 12;

  // Sidebar content (reused for both modal and inline)
  const sidebarContent = (
    <ConversationSidebar
      conversations={conversations}
      activeId={activeId}
      onSelect={handleSelect}
      onCreate={handleCreate}
      onRefresh={handleRefresh}
      isRefreshing={isListLoading}
      isCreating={createConversation.isPending}
    />
  );

  // Empty state when no active conversation
  const emptyState = (
    <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$4">
      <XStack
        width={80}
        height={80}
        borderRadius="$full"
        backgroundColor="$accentSurface"
        alignItems="center"
        justifyContent="center"
      >
        <MessageSquare size={36} color="$accent" />
      </XStack>
      <YStack alignItems="center" gap="$2">
        <Text fontFamily="$heading" fontSize={24} fontWeight="700" letterSpacing={-0.5} color="$color">
          Welcome to Aperture
        </Text>
        <Text fontSize={16} color="$colorSubtle" textAlign="center">
          Start a conversation to begin
        </Text>
      </YStack>
      <Pressable onPress={handleCreate} disabled={createConversation.isPending}>
        <GlassView
          intensity="medium"
          borderRadius={12}
          padding={0}
          style={{ opacity: createConversation.isPending ? 0.5 : 1 }}
        >
          <XStack paddingHorizontal={20} paddingVertical={12} gap={8} alignItems="center">
            <Text fontSize={16} fontWeight="600" color="$accent">
              New Conversation
            </Text>
          </XStack>
        </GlassView>
      </Pressable>
    </YStack>
  );

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      <XStack flex={1}>
        {/* Persistent sidebar on large screens */}
        {isLargeScreen && (
          <YStack width={SIDEBAR_WIDTH} paddingTop={insets.top}>
            <GlassView intensity="medium" borderRadius={0} padding={0} style={{ flex: 1 }}>
              {sidebarContent}
            </GlassView>
          </YStack>
        )}

        {/* Main content area */}
        <YStack flex={1}>
          {/* Header */}
          <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }, headerAnim.style]}>
            <GlassView intensity="strong" borderRadius={0} padding={0}>
              <XStack
                paddingHorizontal={16}
                paddingTop={insets.top + 12}
                paddingBottom={12}
                alignItems="center"
                gap={12}
              >
                {/* Menu button (only on small screens) */}
                {!isLargeScreen && (
                  <Pressable onPress={() => setSidebarVisible(true)} hitSlop={12}>
                    <Menu size={24} color="$accent" />
                  </Pressable>
                )}

                {/* Title */}
                <YStack flex={1}>
                  <Text
                    fontFamily="$heading"
                    fontSize={17}
                    fontWeight="600"
                    letterSpacing={-0.2}
                    color="$color"
                    numberOfLines={1}
                  >
                    {activeId ? `Chat` : 'Aperture'}
                  </Text>
                </YStack>

                {/* Settings button */}
                <Pressable onPress={() => setSettingsVisible(true)} hitSlop={12}>
                  <GlassView
                    intensity="subtle"
                    borderRadius={9999}
                    padding={0}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Settings size={18} color="$accent" />
                  </GlassView>
                </Pressable>
              </XStack>
            </GlassView>
          </Animated.View>

          {/* Chat or empty state */}
          {activeId ? (
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
          ) : (
            <YStack flex={1} paddingTop={headerHeight}>
              {emptyState}
            </YStack>
          )}
        </YStack>
      </XStack>

      {/* Sidebar modal (small screens only) */}
      {!isLargeScreen && (
        <Modal
          visible={sidebarVisible}
          transparent
          animationType="none"
          onRequestClose={() => setSidebarVisible(false)}
        >
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setSidebarVisible(false)}>
            <Animated.View
              entering={SlideInLeft.springify().damping(20).stiffness(200)}
              exiting={SlideOutLeft.springify().damping(20).stiffness(200)}
              style={{ width: SIDEBAR_WIDTH, height: '100%' }}
            >
              <Pressable onPress={(e) => e.stopPropagation()} style={{ flex: 1 }}>
                <GlassView intensity="strong" borderRadius={0} padding={0} style={{ flex: 1, paddingTop: insets.top }}>
                  {sidebarContent}
                </GlassView>
              </Pressable>
            </Animated.View>
          </Pressable>
        </Modal>
      )}

      {/* Settings sheet */}
      <SettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        userId={session.userId}
        onNavigate={handleNavigateSettings}
        onLogout={handleLogout}
      />
    </KeyboardAwareView>
  );
};

export default HomeScreen;
