import { Pressable } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';
import { ChevronRight } from '@tamagui/lucide-icons';

import type { ToolOutput } from '../../generated/tools.ts';
import { formatRelativeTime } from '../../utils/format-time.ts';
import { GlassView } from '../glass/glass-view.tsx';

type TriggerSummary = ToolOutput<'trigger.list'>['triggers'][number];

type TriggerListItemProps = {
  trigger: TriggerSummary;
  onPress: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  active: '$success',
  paused: '$warning',
  completed: '$colorMuted',
  failed: '$danger',
};

const TriggerListItem = ({ trigger, onPress }: TriggerListItemProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const statusColor = STATUS_COLORS[trigger.status] ?? '$colorMuted';
  const isCron = trigger.scheduleType === 'cron';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <YStack marginHorizontal={16} marginVertical={4}>
        <GlassView intensity="subtle" borderRadius={9999} padding={12}>
          <XStack alignItems="center" gap={12}>
            <XStack width={10} height={10} borderRadius={5} backgroundColor={statusColor} />

            <YStack flex={1} gap={2}>
              <Text fontSize={16} fontWeight="600" letterSpacing={-0.2} color="$color" numberOfLines={1}>
                {trigger.name}
              </Text>

              <XStack alignItems="center" gap={8}>
                <XStack
                  paddingHorizontal={8}
                  paddingVertical={2}
                  borderRadius={8}
                  backgroundColor={isDark ? 'rgba(79,109,245,0.15)' : '$accentSurface'}
                >
                  <Text fontSize={11} color="$accent" fontWeight="500">
                    {isCron ? 'cron' : 'once'}
                  </Text>
                </XStack>
                {trigger.nextInvocationAt && (
                  <Text fontSize={12} color="$colorMuted">
                    next {formatRelativeTime(trigger.nextInvocationAt)}
                  </Text>
                )}
                {!trigger.nextInvocationAt && trigger.lastInvokedAt && (
                  <Text fontSize={12} color="$colorMuted">
                    ran {formatRelativeTime(trigger.lastInvokedAt)}
                  </Text>
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

export type { TriggerListItemProps, TriggerSummary };
export { TriggerListItem };
