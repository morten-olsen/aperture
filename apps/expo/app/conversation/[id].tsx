import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { YStack, Text } from 'tamagui';
import { useQueryClient } from '@tanstack/react-query';

import { useToolInvoke } from '../../src/hooks/use-tools';
import { KeyboardAwareView } from '../../src/components/keyboard/keyboard-aware-view';

/**
 * Deep link handler for /conversation/[id] routes.
 * Sets the conversation as active and redirects to home where the chat is displayed.
 */
const ConversationDeepLink = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveConversation = useToolInvoke('conversation.setActive');

  useEffect(() => {
    const setActive = async () => {
      try {
        await setActiveConversation.mutateAsync({ conversationId: id });
        queryClient.invalidateQueries({ queryKey: ['tool', 'conversation.getActive'] });
        queryClient.invalidateQueries({ queryKey: ['tool', 'conversation.get'] });
        router.replace('/');
      } catch {
        // If setting active fails, still redirect home
        router.replace('/');
      }
    };
    setActive();
  }, [id, setActiveConversation, queryClient, router]);

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="$colorMuted">Loading conversation...</Text>
      </YStack>
    </KeyboardAwareView>
  );
};

export default ConversationDeepLink;
