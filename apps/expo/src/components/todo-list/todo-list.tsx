import { FlatList } from 'react-native';
import { YStack, Text } from 'tamagui';
import { CircleCheck } from '@tamagui/lucide-icons';

import { AnimatedListItem } from '../animation/animated-list-item.tsx';

import type { TodoTask } from './todo-list-item.tsx';
import { TodoListItem } from './todo-list-item.tsx';

type TodoListProps = {
  tasks: TodoTask[];
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, currentStatus: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

const EmptyState = () => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$6" gap="$3">
    <CircleCheck size={48} color="$colorMuted" />
    <Text fontSize={16} color="$colorMuted">
      All clear
    </Text>
    <Text fontSize={14} color="$colorMuted">
      Tap + to add a task
    </Text>
  </YStack>
);

const TodoList = ({ tasks, onSelect, onToggleComplete, onRefresh, isRefreshing = false }: TodoListProps) => (
  <FlatList
    data={tasks}
    keyExtractor={(item) => item.id}
    renderItem={({ item, index }) => (
      <AnimatedListItem index={index}>
        <TodoListItem
          task={item}
          onPress={() => onSelect(item.id)}
          onToggleComplete={() => onToggleComplete(item.id, item.status)}
        />
      </AnimatedListItem>
    )}
    onRefresh={onRefresh}
    refreshing={isRefreshing}
    ListEmptyComponent={EmptyState}
    contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 }}
  />
);

export type { TodoListProps };
export { TodoList };
