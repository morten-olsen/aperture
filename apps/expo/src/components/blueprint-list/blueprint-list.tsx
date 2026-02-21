import { FlatList } from 'react-native';
import { YStack, Text } from 'tamagui';
import { BookOpen } from '@tamagui/lucide-icons';

import { AnimatedListItem } from '../animation/animated-list-item.tsx';

import type { BlueprintSummary } from './blueprint-list-item.tsx';
import { BlueprintListItem } from './blueprint-list-item.tsx';

type BlueprintListProps = {
  blueprints: BlueprintSummary[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

const EmptyState = () => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
    <BookOpen size={48} color="$colorMuted" />
    <Text fontSize={16} color="$colorMuted">
      No blueprints yet
    </Text>
  </YStack>
);

const BlueprintList = ({ blueprints, onSelect, onRefresh, isRefreshing = false }: BlueprintListProps) => (
  <FlatList
    data={blueprints}
    keyExtractor={(item) => item.id}
    renderItem={({ item, index }) => (
      <AnimatedListItem index={index}>
        <BlueprintListItem blueprint={item} onPress={() => onSelect(item.id)} />
      </AnimatedListItem>
    )}
    onRefresh={onRefresh}
    refreshing={isRefreshing}
    ListEmptyComponent={EmptyState}
    contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 }}
  />
);

export type { BlueprintListProps };
export { BlueprintList };
