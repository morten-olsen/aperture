import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';

import type { ToolOutput } from '../../generated/tools.ts';
import { GlassView } from '../glass/glass-view.tsx';

type SecretItem = ToolOutput<'configuration.secrets.list'>['secrets'][number];

type SecretDetailChanges = {
  name?: string;
  description?: string;
  value?: string;
};

type SecretDetailProps = {
  secret: SecretItem;
  onUpdate: (changes: SecretDetailChanges) => void;
  onDelete: () => void;
};

const PropertyRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <XStack alignItems="center" justifyContent="space-between" paddingVertical={10}>
    <Text fontSize={15} color="$colorMuted" fontWeight="500">
      {label}
    </Text>
    {children}
  </XStack>
);

const SecretDetail = ({ secret, onUpdate, onDelete }: SecretDetailProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const [editName, setEditName] = useState(secret.name);
  const [editDescription, setEditDescription] = useState(secret.description ?? '');
  const [editValue, setEditValue] = useState('');

  const handleNameBlur = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== secret.name) {
      onUpdate({ name: trimmed });
    }
  };

  const handleDescriptionBlur = () => {
    const newVal = editDescription.trim();
    const oldVal = secret.description ?? '';
    if (newVal !== oldVal) {
      onUpdate({ description: newVal });
    }
  };

  const handleValueBlur = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      onUpdate({ value: trimmed });
      setEditValue('');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <XStack alignItems="center" gap={14} paddingVertical={16}>
        <TextInput
          value={editName}
          onChangeText={setEditName}
          onBlur={handleNameBlur}
          style={{
            flex: 1,
            fontSize: 22,
            fontWeight: '700',
            color: isDark ? '#fff' : '#000',
            padding: 0,
          }}
        />
      </XStack>

      <GlassView intensity="subtle" borderRadius={16} padding={14} style={{ marginBottom: 16 }}>
        <TextInput
          value={editDescription}
          onChangeText={setEditDescription}
          onBlur={handleDescriptionBlur}
          placeholder="Add description..."
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
          multiline
          style={{
            fontSize: 15,
            color: isDark ? '#fff' : '#000',
            minHeight: 60,
            padding: 0,
            textAlignVertical: 'top',
          }}
        />
      </GlassView>

      <GlassView intensity="subtle" borderRadius={16} padding={14} style={{ marginBottom: 16 }}>
        <Text fontSize={13} color="$colorMuted" fontWeight="500" paddingBottom={8}>
          Update value
        </Text>
        <TextInput
          value={editValue}
          onChangeText={setEditValue}
          onBlur={handleValueBlur}
          placeholder="Enter new value..."
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
          secureTextEntry
          style={{
            fontSize: 15,
            color: isDark ? '#fff' : '#000',
            padding: 0,
          }}
        />
      </GlassView>

      <GlassView intensity="subtle" borderRadius={16} padding={14} style={{ marginBottom: 16 }}>
        <PropertyRow label="Created">
          <Text fontSize={15} color="$colorSubtle">
            {new Date(secret.createdAt).toLocaleDateString()}
          </Text>
        </PropertyRow>

        <YStack height={1} backgroundColor="$glassBorder" />

        <PropertyRow label="Updated">
          <Text fontSize={15} color="$colorSubtle">
            {new Date(secret.updatedAt).toLocaleDateString()}
          </Text>
        </PropertyRow>
      </GlassView>

      <Pressable
        onPress={() =>
          Alert.alert('Delete Secret', 'Are you sure you want to delete this secret?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ])
        }
      >
        <YStack alignItems="center" paddingVertical={16}>
          <Text fontSize={16} color="$danger" fontWeight="500">
            Delete Secret
          </Text>
        </YStack>
      </Pressable>
    </ScrollView>
  );
};

export type { SecretDetailProps, SecretDetailChanges };
export { SecretDetail };
