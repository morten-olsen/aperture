import { FlatList } from 'react-native';
import { YStack, Text } from 'tamagui';

import { ConversationListItem } from './conversation-list-item.tsx';

type Conversation = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationListProps = {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

const EmptyState = () => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$2">
    <Text fontSize={16} color="$colorMuted">
      No conversations yet
    </Text>
    <Text fontSize={14} color="$colorMuted">
      Tap + to start one
    </Text>
  </YStack>
);

const ConversationList = ({ conversations, onSelect, onRefresh, isRefreshing = false }: ConversationListProps) => (
  <FlatList
    data={conversations}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => (
      <ConversationListItem id={item.id} updatedAt={item.updatedAt} onPress={() => onSelect(item.id)} />
    )}
    onRefresh={onRefresh}
    refreshing={isRefreshing}
    ListEmptyComponent={EmptyState}
    contentContainerStyle={{ flexGrow: 1 }}
  />
);

export type { ConversationListProps, Conversation };
export { ConversationList };
