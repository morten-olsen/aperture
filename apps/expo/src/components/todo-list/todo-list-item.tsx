import { Pressable } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';
import { ChevronRight } from '@tamagui/lucide-icons';

import type { ToolOutput } from '../../generated/tools.ts';
import { formatRelativeTime } from '../../utils/format-time.ts';
import { GlassView } from '../glass/glass-view.tsx';

type TodoTask = ToolOutput<'todo.list'>['tasks'][number];

type TodoListItemProps = {
  task: TodoTask;
  onPress: () => void;
  onToggleComplete: () => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '$warning',
  urgent: '$danger',
};

const STATUS_STYLES = {
  pending: { borderColor: 'rgba(150,150,150,0.4)', backgroundColor: 'transparent', checkmark: false },
  in_progress: { borderColor: '$accent', backgroundColor: 'transparent', checkmark: false },
  completed: { borderColor: '$success', backgroundColor: '$success', checkmark: true },
  cancelled: { borderColor: 'rgba(150,150,150,0.3)', backgroundColor: 'rgba(150,150,150,0.3)', checkmark: false },
} as const;

const TodoListItem = ({ task, onPress, onToggleComplete }: TodoListItemProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const isCompleted = task.status === 'completed';
  const statusStyle = STATUS_STYLES[task.status] ?? STATUS_STYLES.pending;
  const priorityColor = PRIORITY_COLORS[task.priority];
  const isOverdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !isCompleted;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <YStack marginHorizontal={16} marginVertical={4}>
        <GlassView intensity="subtle" borderRadius={9999} padding={12}>
          <XStack alignItems="center" gap={12}>
            <Pressable onPress={onToggleComplete} hitSlop={8}>
              <XStack
                width={28}
                height={28}
                borderRadius={14}
                borderWidth={2}
                borderColor={statusStyle.borderColor}
                backgroundColor={statusStyle.backgroundColor}
                alignItems="center"
                justifyContent="center"
              >
                {statusStyle.checkmark && (
                  <Text fontSize={14} color="white" fontWeight="700">
                    {'✓'}
                  </Text>
                )}
              </XStack>
            </Pressable>

            <YStack flex={1} gap={2}>
              <Text
                fontSize={16}
                fontWeight="600"
                letterSpacing={-0.2}
                color={isCompleted ? '$colorMuted' : '$color'}
                numberOfLines={1}
                textDecorationLine={isCompleted ? 'line-through' : 'none'}
              >
                {task.title}
              </Text>

              <XStack alignItems="center" gap={8}>
                {priorityColor && <XStack width={8} height={8} borderRadius={4} backgroundColor={priorityColor} />}
                {task.dueAt && (
                  <Text
                    fontSize={12}
                    color={isOverdue ? '$danger' : '$colorMuted'}
                    fontWeight={isOverdue ? '600' : '400'}
                  >
                    {formatRelativeTime(task.dueAt)}
                  </Text>
                )}
                {task.project && (
                  <XStack
                    paddingHorizontal={8}
                    paddingVertical={2}
                    borderRadius={8}
                    backgroundColor={isDark ? 'rgba(79,109,245,0.15)' : '$accentSurface'}
                  >
                    <Text fontSize={11} color="$accent" fontWeight="500">
                      {task.project}
                    </Text>
                  </XStack>
                )}
              </XStack>
            </YStack>

            <ChevronRight size={18} color="$colorMuted" />
          </XStack>
        </GlassView>
      </YStack>
    </Pressable>
  );
};

export type { TodoListItemProps, TodoTask };
export { TodoListItem };
