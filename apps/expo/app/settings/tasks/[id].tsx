import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { YStack, Text } from 'tamagui';
import { useQueryClient } from '@tanstack/react-query';

import { useToolQuery, useToolInvoke } from '../../../src/hooks/use-tools';
import { useAutoSave } from '../../../src/hooks/use-auto-save';
import { DetailHeader, useDetailHeaderHeight } from '../../../src/components/detail-header/detail-header';
import { TodoDetail } from '../../../src/components/todo-detail/todo-detail';
import { KeyboardAwareView } from '../../../src/components/keyboard/keyboard-aware-view';

import type { TodoDetailChanges } from '../../../src/components/todo-detail/todo-detail';

const TaskDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const headerHeight = useDetailHeaderHeight();
  const { data } = useToolQuery('todo.list', {});
  const updateTask = useToolInvoke('todo.update');
  const removeTask = useToolInvoke('todo.remove');

  const task = data?.tasks.find((t) => t.id === id);

  const handleUpdate = useCallback(
    async (changes: TodoDetailChanges) => {
      await updateTask.mutateAsync({ taskId: id, ...changes });
      queryClient.invalidateQueries({ queryKey: ['tool', 'todo.list'] });
    },
    [updateTask, id, queryClient],
  );

  const { save, status: saveStatus } = useAutoSave(handleUpdate);

  const handleDelete = useCallback(async () => {
    await removeTask.mutateAsync({ taskId: id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'todo.list'] });
    router.back();
  }, [removeTask, id, queryClient, router]);

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      <DetailHeader title={task?.title} onBack={() => router.back()} saveStatus={saveStatus} />

      <YStack flex={1} paddingTop={headerHeight}>
        {task ? (
          <TodoDetail task={task} onUpdate={save} onDelete={handleDelete} />
        ) : (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <Text color="$colorMuted">Loading...</Text>
          </YStack>
        )}
      </YStack>
    </KeyboardAwareView>
  );
};

export default TaskDetailScreen;
