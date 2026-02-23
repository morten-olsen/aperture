import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../../src/hooks/use-tools';
import { useKeyboardBottomInset } from '../../src/hooks/use-keyboard-bottom-inset';
import { TodoList } from '../../src/components/todo-list/todo-list';
import { TodoQuickAdd } from '../../src/components/todo-list/todo-quick-add';
import { ListScreen } from '../../src/components/list-screen/list-screen';

const TasksRoute = () => {
  const router = useRouter();
  const bottomInset = useKeyboardBottomInset();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useToolQuery('todo.list', { parentId: null });
  const createTask = useToolInvoke('todo.create');
  const updateTask = useToolInvoke('todo.update');

  const tasks = data?.tasks ?? [];

  const handleAdd = useCallback(
    async (title: string) => {
      await createTask.mutateAsync({ title });
      queryClient.invalidateQueries({ queryKey: ['tool', 'todo.list'] });
    },
    [createTask, queryClient],
  );

  const handleToggleComplete = useCallback(
    async (id: string, currentStatus: string) => {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      await updateTask.mutateAsync({ taskId: id, status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['tool', 'todo.list'] });
    },
    [updateTask, queryClient],
  );

  const fabStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    bottom: bottomInset.value + 16,
    left: 0,
    right: 0,
  }));

  return (
    <ListScreen
      title="Tasks"
      onBack={() => router.back()}
      overlay={
        <Animated.View style={fabStyle}>
          <TodoQuickAdd onAdd={handleAdd} isAdding={createTask.isPending} />
        </Animated.View>
      }
    >
      {({ scrollHandler, contentPadding }) => (
        <TodoList
          onScroll={scrollHandler}
          contentPadding={contentPadding}
          tasks={tasks}
          onSelect={(id) => router.push(`/settings/tasks/${id}`)}
          onToggleComplete={handleToggleComplete}
          onRefresh={refetch}
          isRefreshing={isLoading}
        />
      )}
    </ListScreen>
  );
};

export default TasksRoute;
