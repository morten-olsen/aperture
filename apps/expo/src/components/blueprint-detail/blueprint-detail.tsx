import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';

import type { ToolOutput } from '../../generated/tools.ts';
import { GlassView } from '../glass/glass-view.tsx';

type Blueprint = ToolOutput<'blueprint.get'>;

type BlueprintDetailChanges = {
  title?: string;
  use_case?: string;
  process?: string;
  notes?: string;
};

type BlueprintDetailProps = {
  blueprint: Blueprint;
  onUpdate: (changes: BlueprintDetailChanges) => void;
  onDelete: () => void;
};

const SectionLabel = ({ children }: { children: string }) => (
  <Text fontSize={13} fontWeight="600" color="$colorMuted" letterSpacing={0.5} paddingBottom={6}>
    {children}
  </Text>
);

const BlueprintDetail = ({ blueprint, onUpdate, onDelete }: BlueprintDetailProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';

  const [editTitle, setEditTitle] = useState(blueprint.title);
  const [editUseCase, setEditUseCase] = useState(blueprint.use_case);
  const [editProcess, setEditProcess] = useState(blueprint.process);
  const [editNotes, setEditNotes] = useState(blueprint.notes ?? '');

  const textColor = isDark ? '#fff' : '#000';
  const placeholderColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';

  const handleTitleBlur = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== blueprint.title) {
      onUpdate({ title: trimmed });
    }
  };

  const handleUseCaseBlur = () => {
    const trimmed = editUseCase.trim();
    if (trimmed && trimmed !== blueprint.use_case) {
      onUpdate({ use_case: trimmed });
    }
  };

  const handleProcessBlur = () => {
    const trimmed = editProcess.trim();
    if (trimmed && trimmed !== blueprint.process) {
      onUpdate({ process: trimmed });
    }
  };

  const handleNotesBlur = () => {
    const trimmed = editNotes.trim();
    const oldVal = blueprint.notes ?? '';
    if (trimmed !== oldVal) {
      onUpdate({ notes: trimmed || undefined });
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <YStack paddingVertical={16}>
        <TextInput
          value={editTitle}
          onChangeText={setEditTitle}
          onBlur={handleTitleBlur}
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: textColor,
            padding: 0,
          }}
        />
      </YStack>

      <YStack gap={16}>
        <YStack>
          <SectionLabel>Use Case</SectionLabel>
          <GlassView intensity="subtle" borderRadius={16} padding={14}>
            <TextInput
              value={editUseCase}
              onChangeText={setEditUseCase}
              onBlur={handleUseCaseBlur}
              placeholder="When should this blueprint be used?"
              placeholderTextColor={placeholderColor}
              multiline
              style={{
                fontSize: 15,
                color: textColor,
                minHeight: 60,
                padding: 0,
                textAlignVertical: 'top',
              }}
            />
          </GlassView>
        </YStack>

        <YStack>
          <SectionLabel>Process</SectionLabel>
          <GlassView intensity="subtle" borderRadius={16} padding={14}>
            <TextInput
              value={editProcess}
              onChangeText={setEditProcess}
              onBlur={handleProcessBlur}
              placeholder="Step-by-step instructions..."
              placeholderTextColor={placeholderColor}
              multiline
              style={{
                fontSize: 15,
                color: textColor,
                minHeight: 120,
                padding: 0,
                textAlignVertical: 'top',
              }}
            />
          </GlassView>
        </YStack>

        <YStack>
          <SectionLabel>Notes</SectionLabel>
          <GlassView intensity="subtle" borderRadius={16} padding={14}>
            <TextInput
              value={editNotes}
              onChangeText={setEditNotes}
              onBlur={handleNotesBlur}
              placeholder="Optional scratch pad..."
              placeholderTextColor={placeholderColor}
              multiline
              style={{
                fontSize: 15,
                color: textColor,
                minHeight: 60,
                padding: 0,
                textAlignVertical: 'top',
              }}
            />
          </GlassView>
        </YStack>

        <GlassView intensity="subtle" borderRadius={16} padding={14}>
          <XStack alignItems="center" justifyContent="space-between" paddingVertical={4}>
            <Text fontSize={13} color="$colorMuted">
              Created
            </Text>
            <Text fontSize={13} color="$colorSubtle">
              {formatDate(blueprint.created_at)}
            </Text>
          </XStack>
          <YStack height={1} backgroundColor="$glassBorder" marginVertical={8} />
          <XStack alignItems="center" justifyContent="space-between" paddingVertical={4}>
            <Text fontSize={13} color="$colorMuted">
              Updated
            </Text>
            <Text fontSize={13} color="$colorSubtle">
              {formatDate(blueprint.updated_at)}
            </Text>
          </XStack>
        </GlassView>

        <Pressable
          onPress={() =>
            Alert.alert('Delete Blueprint', 'Are you sure you want to delete this blueprint?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ])
          }
        >
          <YStack alignItems="center" paddingVertical={16}>
            <Text fontSize={16} color="$danger" fontWeight="500">
              Delete Blueprint
            </Text>
          </YStack>
        </Pressable>
      </YStack>
    </ScrollView>
  );
};

export type { BlueprintDetailProps, BlueprintDetailChanges };
export { BlueprintDetail };
