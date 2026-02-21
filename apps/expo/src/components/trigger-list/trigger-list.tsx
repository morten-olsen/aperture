import { FlatList } from 'react-native';
import { YStack, Text } from 'tamagui';
import { Clock } from '@tamagui/lucide-icons';

import { AnimatedListItem } from '../animation/animated-list-item.tsx';

import type { TriggerSummary } from './trigger-list-item.tsx';
import { TriggerListItem } from './trigger-list-item.tsx';

type TriggerListProps = {
  triggers: TriggerSummary[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

const EmptyState = () => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
    <Clock size={48} color="$colorMuted" />
    <Text fontSize={16} color="$colorMuted">
      No triggers yet
    </Text>
  </YStack>
);

const TriggerList = ({ triggers, onSelect, onRefresh, isRefreshing = false }: TriggerListProps) => (
  <FlatList
    data={triggers}
    keyExtractor={(item) => item.id}
    renderItem={({ item, index }) => (
      <AnimatedListItem index={index}>
        <TriggerListItem trigger={item} onPress={() => onSelect(item.id)} />
      </AnimatedListItem>
    )}
    onRefresh={onRefresh}
    refreshing={isRefreshing}
    ListEmptyComponent={EmptyState}
    contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 }}
  />
);

export type { TriggerListProps };
export { TriggerList };
