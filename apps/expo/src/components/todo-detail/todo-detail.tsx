import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';

import type { ToolOutput } from '../../generated/tools.ts';
import { GlassView } from '../glass/glass-view.tsx';

type TodoTask = ToolOutput<'todo.list'>['tasks'][number];

type TodoDetailChanges = {
  title?: string;
  description?: string | null;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  project?: string | null;
};

type TodoDetailProps = {
  task: TodoTask;
  onUpdate: (changes: TodoDetailChanges) => void;
  onDelete: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_ORDER = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
const PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent'] as const;

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '$colorMuted',
  medium: '$color',
  high: '$warning',
  urgent: '$danger',
};

const CHECKBOX_STYLES = {
  pending: { borderColor: 'rgba(150,150,150,0.4)', backgroundColor: 'transparent', checkmark: false },
  in_progress: { borderColor: '$accent', backgroundColor: 'transparent', checkmark: false },
  completed: { borderColor: '$success', backgroundColor: '$success', checkmark: true },
  cancelled: { borderColor: 'rgba(150,150,150,0.3)', backgroundColor: 'rgba(150,150,150,0.3)', checkmark: false },
} as const;

const PropertyRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <XStack alignItems="center" justifyContent="space-between" paddingVertical={10}>
    <Text fontSize={15} color="$colorMuted" fontWeight="500">
      {label}
    </Text>
    {children}
  </XStack>
);

const TodoDetail = ({ task, onUpdate, onDelete }: TodoDetailProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description ?? '');
  const [editProject, setEditProject] = useState(task.project ?? '');
  const titleRef = useRef<TextInput>(null);
  const checkboxStyle = CHECKBOX_STYLES[task.status] ?? CHECKBOX_STYLES.pending;

  const handleTitleBlur = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate({ title: trimmed });
    }
  };

  const handleDescriptionBlur = () => {
    const newVal = editDescription.trim();
    const oldVal = task.description ?? '';
    if (newVal !== oldVal) {
      onUpdate({ description: newVal || null });
    }
  };

  const handleProjectBlur = () => {
    const newVal = editProject.trim();
    const oldVal = task.project ?? '';
    if (newVal !== oldVal) {
      onUpdate({ project: newVal || null });
    }
  };

  const cycleStatus = () => {
    const idx = STATUS_ORDER.indexOf(task.status as (typeof STATUS_ORDER)[number]);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    onUpdate({ status: next });
  };

  const cyclePriority = () => {
    const idx = PRIORITY_ORDER.indexOf(task.priority as (typeof PRIORITY_ORDER)[number]);
    const next = PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length];
    onUpdate({ priority: next });
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <XStack alignItems="center" gap={14} paddingVertical={16}>
        <Pressable onPress={cycleStatus} hitSlop={8}>
          <XStack
            width={36}
            height={36}
            borderRadius={18}
            borderWidth={2.5}
            borderColor={checkboxStyle.borderColor}
            backgroundColor={checkboxStyle.backgroundColor}
            alignItems="center"
            justifyContent="center"
          >
            {checkboxStyle.checkmark && (
              <Text fontSize={18} color="white" fontWeight="700">
                {'✓'}
              </Text>
            )}
          </XStack>
        </Pressable>
        <TextInput
          ref={titleRef}
          value={editTitle}
          onChangeText={setEditTitle}
          onBlur={handleTitleBlur}
          style={{
            flex: 1,
            fontSize: 22,
            fontWeight: '700',
            color: isDark ? '#fff' : '#000',
            padding: 0,
            textDecorationLine: task.status === 'completed' ? 'line-through' : 'none',
          }}
        />
      </XStack>

      <GlassView intensity="subtle" borderRadius={16} padding={14} style={{ marginBottom: 16 }}>
        <TextInput
          value={editDescription}
          onChangeText={setEditDescription}
          onBlur={handleDescriptionBlur}
          placeholder="Add notes..."
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
          multiline
          style={{
            fontSize: 15,
            color: isDark ? '#fff' : '#000',
            minHeight: 80,
            padding: 0,
            textAlignVertical: 'top',
          }}
        />
      </GlassView>

      <GlassView intensity="subtle" borderRadius={16} padding={14} style={{ marginBottom: 16 }}>
        <PropertyRow label="Status">
          <Pressable onPress={cycleStatus}>
            <Text fontSize={15} color="$accent" fontWeight="500">
              {STATUS_LABELS[task.status] ?? task.status}
            </Text>
          </Pressable>
        </PropertyRow>

        <YStack height={1} backgroundColor="$glassBorder" />

        <PropertyRow label="Priority">
          <Pressable onPress={cyclePriority}>
            <XStack alignItems="center" gap={6}>
              <XStack
                width={8}
                height={8}
                borderRadius={4}
                backgroundColor={PRIORITY_COLORS[task.priority] ?? '$colorMuted'}
              />
              <Text fontSize={15} color={PRIORITY_COLORS[task.priority] ?? '$colorMuted'} fontWeight="500">
                {PRIORITY_LABELS[task.priority] ?? task.priority}
              </Text>
            </XStack>
          </Pressable>
        </PropertyRow>

        <YStack height={1} backgroundColor="$glassBorder" />

        <PropertyRow label="Project">
          <TextInput
            value={editProject}
            onChangeText={setEditProject}
            onBlur={handleProjectBlur}
            placeholder="None"
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
            style={{
              fontSize: 15,
              color: isDark ? 'rgba(79,109,245,1)' : 'rgba(79,109,245,1)',
              fontWeight: '500',
              padding: 0,
              textAlign: 'right',
              minWidth: 60,
            }}
          />
        </PropertyRow>

        {task.dueAt && (
          <>
            <YStack height={1} backgroundColor="$glassBorder" />
            <PropertyRow label="Due">
              <Text fontSize={15} color="$colorSubtle">
                {new Date(task.dueAt).toLocaleDateString()}
              </Text>
            </PropertyRow>
          </>
        )}

        {task.tags.length > 0 && (
          <>
            <YStack height={1} backgroundColor="$glassBorder" />
            <PropertyRow label="Tags">
              <XStack gap={6} flexWrap="wrap" justifyContent="flex-end" flex={1} marginLeft={16}>
                {task.tags.map((tag) => (
                  <XStack
                    key={tag}
                    paddingHorizontal={10}
                    paddingVertical={4}
                    borderRadius={10}
                    backgroundColor={isDark ? 'rgba(79,109,245,0.15)' : '$accentSurface'}
                  >
                    <Text fontSize={13} color="$accent" fontWeight="500">
                      {tag}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            </PropertyRow>
          </>
        )}
      </GlassView>

      <Pressable
        onPress={() =>
          Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ])
        }
      >
        <YStack alignItems="center" paddingVertical={16}>
          <Text fontSize={16} color="$danger" fontWeight="500">
            Delete Task
          </Text>
        </YStack>
      </Pressable>
    </ScrollView>
  );
};

export type { TodoDetailProps, TodoDetailChanges };
export { TodoDetail };
