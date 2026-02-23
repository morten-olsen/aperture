import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { YStack, Text } from 'tamagui';
import { Clock } from '@tamagui/lucide-icons';
import Animated from 'react-native-reanimated';

import type { FilterChipOption } from '../filter-chips/filter-chips.tsx';
import { FilterChips } from '../filter-chips/filter-chips.tsx';
import { AnimatedListItem } from '../animation/animated-list-item.tsx';

import type { TriggerSummary } from './trigger-list-item.tsx';
import { TriggerListItem } from './trigger-list-item.tsx';

type StatusFilter = 'all' | 'active' | 'paused' | 'completed' | 'failed';

type TriggerListProps = {
  triggers: TriggerSummary[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  header?: ReactNode;
  onScroll?: React.ComponentProps<typeof Animated.FlatList>['onScroll'];
  contentPadding?: number;
};

const STATUS_FILTER_OPTIONS: FilterChipOption<StatusFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', color: '$success' },
  { value: 'paused', label: 'Paused', color: '$warning' },
  { value: 'completed', label: 'Completed', color: '$colorMuted' },
  { value: 'failed', label: 'Failed', color: '$danger' },
];

const EmptyState = ({ filtered }: { filtered: boolean }) => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
    <Clock size={48} color="$colorMuted" />
    <Text fontSize={16} color="$colorMuted">
      {filtered ? 'No matching triggers' : 'No triggers yet'}
    </Text>
  </YStack>
);

const TriggerList = ({
  triggers,
  onSelect,
  onRefresh,
  isRefreshing = false,
  header,
  onScroll,
  contentPadding,
}: TriggerListProps) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const items = statusFilter === 'all' ? triggers : triggers.filter((t) => t.status === statusFilter);
    const isScheduled = (t: TriggerSummary) => t.status === 'active' || t.status === 'paused';
    return [...items].sort((a, b) => {
      const aNext = isScheduled(a) ? a.nextInvocationAt : null;
      const bNext = isScheduled(b) ? b.nextInvocationAt : null;
      if (aNext && bNext) return new Date(aNext).getTime() - new Date(bNext).getTime();
      if (aNext) return -1;
      if (bNext) return 1;
      return 0;
    });
  }, [triggers, statusFilter]);

  return (
    <Animated.FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <AnimatedListItem index={index}>
          <TriggerListItem trigger={item} onPress={() => onSelect(item.id)} />
        </AnimatedListItem>
      )}
      onRefresh={onRefresh}
      refreshing={isRefreshing}
      ListHeaderComponent={
        <>
          {header}
          <FilterChips options={STATUS_FILTER_OPTIONS} selected={statusFilter} onSelect={setStatusFilter} />
        </>
      }
      ListEmptyComponent={<EmptyState filtered={statusFilter !== 'all'} />}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ flexGrow: 1, paddingTop: contentPadding ?? 0, paddingBottom: 80 }}
    />
  );
};

export type { TriggerListProps };
export { TriggerList };
