import { useCallback } from 'react';
import { Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../src/hooks/use-tools';
import { useMountAnimation } from '../src/hooks/use-mount-animation';
import { GlassView } from '../src/components/glass/glass-view';
import { TodoList } from '../src/components/todo-list/todo-list';
import { TodoQuickAdd } from '../src/components/todo-list/todo-quick-add';

const TodosRoute = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useToolQuery('todo.list', { parentId: null });
  const createTask = useToolInvoke('todo.create');
  const updateTask = useToolInvoke('todo.update');

  const tasks = data?.result.tasks ?? [];

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

  const headerAnim = useMountAnimation({ duration: 400, delay: 200 });
  const titleAnim = useMountAnimation({ translateY: 10, duration: 450, delay: 300 });

  const content = (
    <YStack flex={1} paddingTop={insets.top} paddingBottom={insets.bottom}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={headerAnim.style}>
        <YStack paddingHorizontal="$5" paddingTop="$4" paddingBottom="$2">
          <XStack alignItems="center" height={52}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <GlassView
                intensity="subtle"
                borderRadius={9999}
                padding={0}
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowLeft size={24} color="$accent" />
              </GlassView>
            </Pressable>
          </XStack>
        </YStack>
      </Animated.View>

      <Animated.View style={titleAnim.style}>
        <Text
          fontFamily="$heading"
          fontSize={34}
          fontWeight="700"
          letterSpacing={-1}
          color="$color"
          paddingHorizontal="$5"
          paddingTop="$4"
          paddingBottom="$3"
        >
          Tasks
        </Text>
      </Animated.View>

      <TodoList
        tasks={tasks}
        onSelect={(id) => router.push(`/todo/${id}`)}
        onToggleComplete={handleToggleComplete}
        onRefresh={refetch}
        isRefreshing={isLoading}
      />

      <YStack position="absolute" bottom={insets.bottom + 16} left={0} right={0}>
        <TodoQuickAdd onAdd={handleAdd} isAdding={createTask.isPending} />
      </YStack>
    </YStack>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
};

export default TodosRoute;
