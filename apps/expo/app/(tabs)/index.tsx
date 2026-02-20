import { useCallback } from 'react';
import { FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Button } from 'tamagui';

import { useToolQuery, useToolInvoke } from '../../src/hooks/use-tools';

const ConversationsScreen = () => {
  const router = useRouter();
  const { data, refetch, isLoading } = useToolQuery('conversation.list', {});
  const createConversation = useToolInvoke('conversation.create');

  const conversations = data?.result.conversations ?? [];

  const handleCreate = useCallback(async () => {
    const result = await createConversation.mutateAsync({});
    router.push(`/conversation/${result.result.id}`);
  }, [createConversation, router]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof conversations)[number] }) => (
      <Pressable onPress={() => router.push(`/conversation/${item.id}`)}>
        <XStack padding="$3" borderBottomWidth={1} borderBottomColor="$borderColor">
          <YStack flex={1}>
            <Text fontWeight="600">{item.id}</Text>
            {item.updatedAt && (
              <Text fontSize="$2" color="$gray10">
                {new Date(item.updatedAt).toLocaleString()}
              </Text>
            )}
          </YStack>
        </XStack>
      </Pressable>
    ),
    [router],
  );

  return (
    <YStack flex={1}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onRefresh={refetch}
        refreshing={isLoading}
      />
      <Button margin="$3" theme="active" onPress={handleCreate} disabled={createConversation.isPending}>
        New Conversation
      </Button>
    </YStack>
  );
};

export default ConversationsScreen;
