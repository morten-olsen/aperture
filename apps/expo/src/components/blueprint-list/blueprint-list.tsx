import type { ReactNode } from 'react';
import { YStack, Text } from 'tamagui';
import { BookOpen } from '@tamagui/lucide-icons';
import Animated from 'react-native-reanimated';

import { AnimatedListItem } from '../animation/animated-list-item.tsx';

import type { BlueprintSummary } from './blueprint-list-item.tsx';
import { BlueprintListItem } from './blueprint-list-item.tsx';

type BlueprintListProps = {
  blueprints: BlueprintSummary[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  header?: ReactNode;
  onScroll?: React.ComponentProps<typeof Animated.FlatList>['onScroll'];
  contentPadding?: number;
};

const EmptyState = () => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
    <BookOpen size={48} color="$colorMuted" />
    <Text fontSize={16} color="$colorMuted">
      No blueprints yet
    </Text>
  </YStack>
);

const BlueprintList = ({
  blueprints,
  onSelect,
  onRefresh,
  isRefreshing = false,
  header,
  onScroll,
  contentPadding,
}: BlueprintListProps) => (
  <Animated.FlatList
    data={blueprints}
    keyExtractor={(item) => item.id}
    renderItem={({ item, index }) => (
      <AnimatedListItem index={index}>
        <BlueprintListItem blueprint={item} onPress={() => onSelect(item.id)} />
      </AnimatedListItem>
    )}
    onRefresh={onRefresh}
    refreshing={isRefreshing}
    ListHeaderComponent={header}
    ListEmptyComponent={EmptyState}
    onScroll={onScroll}
    scrollEventThrottle={16}
    contentContainerStyle={{ flexGrow: 1, paddingTop: contentPadding ?? 0, paddingBottom: 80 }}
  />
);

export type { BlueprintListProps };
export { BlueprintList };
