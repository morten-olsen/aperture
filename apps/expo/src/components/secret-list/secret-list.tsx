import { FlatList } from 'react-native';
import { YStack, Text } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';

import { AnimatedListItem } from '../animation/animated-list-item.tsx';

import type { SecretSummary } from './secret-list-item.tsx';
import { SecretListItem } from './secret-list-item.tsx';

type SecretListProps = {
  secrets: SecretSummary[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

const EmptyState = () => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
    <Lock size={48} color="$colorMuted" />
    <Text fontSize={16} color="$colorMuted">
      No secrets stored
    </Text>
  </YStack>
);

const SecretList = ({ secrets, onSelect, onRefresh, isRefreshing = false }: SecretListProps) => (
  <FlatList
    data={secrets}
    keyExtractor={(item) => item.id}
    renderItem={({ item, index }) => (
      <AnimatedListItem index={index}>
        <SecretListItem secret={item} onPress={() => onSelect(item.id)} />
      </AnimatedListItem>
    )}
    onRefresh={onRefresh}
    refreshing={isRefreshing}
    ListEmptyComponent={EmptyState}
    contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 }}
  />
);

export type { SecretListProps };
export { SecretList };
