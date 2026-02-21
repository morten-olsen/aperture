import { useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';

import type { ToolOutput } from '../../generated/tools.ts';
import { GlassView } from '../glass/glass-view.tsx';

type TriggerSummary = ToolOutput<'trigger.list'>['triggers'][number];

type TriggerDetailChanges = {
  name?: string;
  status?: 'active' | 'paused';
  scheduleType?: 'once' | 'cron';
  scheduleValue?: string;
};

type TriggerDetailProps = {
  trigger: TriggerSummary;
  onUpdate: (changes: TriggerDetailChanges) => void;
  onDelete: () => void;
  isUpdating?: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  active: '$success',
  paused: '$warning',
  completed: '$colorMuted',
  failed: '$danger',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
};

const PropertyRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <XStack alignItems="center" justifyContent="space-between" paddingVertical={10}>
    <Text fontSize={15} color="$colorMuted" fontWeight="500">
      {label}
    </Text>
    {children}
  </XStack>
);

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const TriggerDetail = ({ trigger, onUpdate, onDelete, isUpdating = false }: TriggerDetailProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';

  const [editName, setEditName] = useState(trigger.name);
  const [editScheduleValue, setEditScheduleValue] = useState(trigger.scheduleValue);

  const textColor = isDark ? '#fff' : '#000';
  const placeholderColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
  const statusColor = STATUS_COLORS[trigger.status] ?? '$colorMuted';
  const canToggle = trigger.status === 'active' || trigger.status === 'paused';

  const handleNameBlur = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== trigger.name) {
      onUpdate({ name: trimmed });
    }
  };

  const handleScheduleValueBlur = () => {
    const trimmed = editScheduleValue.trim();
    if (trimmed && trimmed !== trigger.scheduleValue) {
      onUpdate({ scheduleValue: trimmed });
    }
  };

  const toggleStatus = () => {
    if (trigger.status === 'active') {
      onUpdate({ status: 'paused' });
    } else if (trigger.status === 'paused') {
      onUpdate({ status: 'active' });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <YStack paddingVertical={16}>
        <TextInput
          value={editName}
          onChangeText={setEditName}
          onBlur={handleNameBlur}
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: textColor,
            padding: 0,
          }}
        />
      </YStack>

      <GlassView intensity="subtle" borderRadius={16} padding={14} style={{ marginBottom: 16 }}>
        <PropertyRow label="Status">
          <Pressable onPress={toggleStatus} disabled={isUpdating || !canToggle}>
            <XStack alignItems="center" gap={6}>
              <XStack width={8} height={8} borderRadius={4} backgroundColor={statusColor} />
              <Text fontSize={15} color={canToggle ? '$accent' : '$colorMuted'} fontWeight="500">
                {STATUS_LABELS[trigger.status] ?? trigger.status}
              </Text>
            </XStack>
          </Pressable>
        </PropertyRow>

        <YStack height={1} backgroundColor="$glassBorder" />

        <PropertyRow label="Type">
          <Text fontSize={15} color="$colorSubtle">
            {trigger.scheduleType === 'cron' ? 'Recurring (cron)' : 'One-time'}
          </Text>
        </PropertyRow>

        <YStack height={1} backgroundColor="$glassBorder" />

        <PropertyRow label="Schedule">
          <TextInput
            value={editScheduleValue}
            onChangeText={setEditScheduleValue}
            onBlur={handleScheduleValueBlur}
            placeholder="Schedule value"
            placeholderTextColor={placeholderColor}
            style={{
              fontSize: 15,
              color: isDark ? 'rgba(79,109,245,1)' : 'rgba(79,109,245,1)',
              fontWeight: '500',
              padding: 0,
              textAlign: 'right',
              minWidth: 80,
              maxWidth: 200,
            }}
          />
        </PropertyRow>

        <YStack height={1} backgroundColor="$glassBorder" />

        <PropertyRow label="Invocations">
          <Text fontSize={15} color="$colorSubtle">
            {trigger.invocationCount}
          </Text>
        </PropertyRow>

        {trigger.nextInvocationAt && (
          <>
            <YStack height={1} backgroundColor="$glassBorder" />
            <PropertyRow label="Next Run">
              <Text fontSize={15} color="$colorSubtle">
                {formatDate(trigger.nextInvocationAt)}
              </Text>
            </PropertyRow>
          </>
        )}

        {trigger.lastInvokedAt && (
          <>
            <YStack height={1} backgroundColor="$glassBorder" />
            <PropertyRow label="Last Run">
              <Text fontSize={15} color="$colorSubtle">
                {formatDate(trigger.lastInvokedAt)}
              </Text>
            </PropertyRow>
          </>
        )}
      </GlassView>

      <Pressable onPress={onDelete} disabled={isUpdating}>
        <YStack alignItems="center" paddingVertical={16}>
          <Text fontSize={16} color="$danger" fontWeight="500">
            Delete Trigger
          </Text>
        </YStack>
      </Pressable>
    </ScrollView>
  );
};

export type { TriggerDetailProps, TriggerDetailChanges };
export { TriggerDetail };
