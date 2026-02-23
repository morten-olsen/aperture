import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../../../src/hooks/use-tools';
import { useMountAnimation } from '../../../src/hooks/use-mount-animation';
import { GlassView } from '../../../src/components/glass/glass-view';
import { TodoDetail } from '../../../src/components/todo-detail/todo-detail';
import { KeyboardAwareView } from '../../../src/components/keyboard/keyboard-aware-view';

import type { TodoDetailChanges } from '../../../src/components/todo-detail/todo-detail';

const TaskDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
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

  const handleDelete = useCallback(async () => {
    await removeTask.mutateAsync({ taskId: id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'todo.list'] });
    router.back();
  }, [removeTask, id, queryClient, router]);

  const headerAnim = useMountAnimation({ translateY: -10, duration: 300, delay: 200 });
  const headerHeight = insets.top + 12 + 24 + 12;

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }, headerAnim.style]}>
        <GlassView intensity="strong" borderRadius={0} padding={0}>
          <XStack paddingHorizontal={16} paddingTop={insets.top + 12} paddingBottom={12} alignItems="center" gap={12}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ArrowLeft size={24} color="$accent" />
            </Pressable>
            {task && (
              <Text fontSize={17} fontWeight="600" color="$color" numberOfLines={1} flex={1}>
                {task.title}
              </Text>
            )}
          </XStack>
        </GlassView>
      </Animated.View>

      <YStack flex={1} paddingTop={headerHeight}>
        {task ? (
          <TodoDetail task={task} onUpdate={handleUpdate} onDelete={handleDelete} isUpdating={updateTask.isPending} />
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
