import { useState } from 'react';
import { Pressable } from 'react-native';
import { YStack, XStack, Text } from 'tamagui';
import { Settings, ChevronDown, ChevronRight } from '@tamagui/lucide-icons';

const needsQuoting = /[:#{}[\],&*?|>!'"%@`]/;

const quoteString = (str: string, pad: string): string => {
  const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${pad}"${escaped}"`;
};

const toYaml = (value: unknown, indent = 0): string => {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) return `${pad}~`;

  if (typeof value === 'string') {
    if (value.includes('\n')) {
      const lines = value.split('\n').map((l) => `${pad}  ${l}`);
      return `${pad}|\n${lines.join('\n')}`;
    }
    return needsQuoting.test(value) ? quoteString(value, pad) : `${pad}${value}`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return `${pad}${String(value)}`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        const rendered = toYaml(item, indent + 1).trimStart();
        return `${pad}- ${rendered}`;
      })
      .join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    const isScalar = (v: unknown) =>
      v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    return entries
      .map(([k, v]) => {
        if (isScalar(v)) {
          return `${pad}${k}: ${toYaml(v, 0).trimStart()}`;
        }
        return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
      })
      .join('\n');
  }

  return `${pad}${String(value)}`;
};

type ToolCallData = {
  type: string;
  function?: string;
  input?: unknown;
  result?: unknown;
  [key: string]: unknown;
};

type ToolCallCardProps = {
  data: ToolCallData;
};

const ToolIcon = () => <Settings size={14} color="$colorMuted" />;

const ToolCallRow = ({ data }: ToolCallCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasResult = data.result !== undefined;

  return (
    <YStack>
      <Pressable onPress={() => setExpanded(!expanded)}>
        <XStack paddingVertical={6} paddingHorizontal={4} alignItems="center" gap={8}>
          <XStack width={6} height={6} borderRadius="$full" backgroundColor={hasResult ? '$success' : '$colorMuted'} />
          <Text fontSize={13} fontFamily="$mono" color="$colorSubtle" flex={1} numberOfLines={1}>
            {data.function ?? 'tool_call'}
          </Text>
          {expanded ? <ChevronDown size={14} color="$colorMuted" /> : <ChevronRight size={14} color="$colorMuted" />}
        </XStack>
      </Pressable>

      {expanded && (
        <YStack paddingLeft={14} paddingBottom={6} gap="$2">
          {data.input !== undefined && (
            <YStack gap="$1">
              <Text fontSize={11} color="$colorMuted" fontWeight="500" letterSpacing={0.5} textTransform="uppercase">
                Input
              </Text>
              <YStack backgroundColor="$background" borderRadius="$badge" padding="$2">
                <Text fontSize={12} fontFamily="$mono" lineHeight={18} color="$colorSubtle">
                  {toYaml(data.input)}
                </Text>
              </YStack>
            </YStack>
          )}
          {data.result !== undefined && (
            <YStack gap="$1">
              <Text fontSize={11} color="$colorMuted" fontWeight="500" letterSpacing={0.5} textTransform="uppercase">
                Result
              </Text>
              <YStack backgroundColor="$background" borderRadius="$badge" padding="$2">
                <Text fontSize={12} fontFamily="$mono" lineHeight={18} color="$colorSubtle">
                  {toYaml(data.result)}
                </Text>
              </YStack>
            </YStack>
          )}
        </YStack>
      )}
    </YStack>
  );
};

type ToolCallGroupProps = {
  tools: ToolCallData[];
};

const ToolCallGroup = ({ tools }: ToolCallGroupProps) => {
  const [expanded, setExpanded] = useState(false);
  const allDone = tools.every((t) => t.result !== undefined);
  const label = tools.length === 1 ? (tools[0].function ?? 'tool call') : `${tools.length} tool calls`;

  return (
    <YStack
      borderRadius={14}
      borderWidth={1}
      borderColor="$chatToolBorder"
      backgroundColor="$chatTool"
      overflow="hidden"
      alignSelf={expanded ? 'stretch' : 'flex-start'}
      maxWidth={expanded ? '100%' : '88%'}
    >
      <Pressable onPress={() => setExpanded(!expanded)}>
        <XStack paddingHorizontal={12} paddingVertical={8} alignItems="center" gap={8}>
          <ToolIcon />
          <XStack width={6} height={6} borderRadius="$full" backgroundColor={allDone ? '$success' : '$colorMuted'} />
          <Text fontSize={13} fontFamily="$mono" color="$colorSubtle" flex={1} numberOfLines={1}>
            {label}
          </Text>
          {expanded ? <ChevronDown size={14} color="$colorMuted" /> : <ChevronRight size={14} color="$colorMuted" />}
        </XStack>
      </Pressable>

      {expanded && (
        <YStack paddingHorizontal={12} paddingBottom={8} gap={2}>
          {tools.map((tool, i) => (
            <YStack key={i} borderTopWidth={i > 0 ? 1 : 0} borderTopColor="$chatToolBorder" paddingTop={i > 0 ? 4 : 0}>
              <ToolCallRow data={tool} />
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
};

// Keep single-card export for backwards compat with stories
const ToolCallCard = ({ data }: ToolCallCardProps) => <ToolCallGroup tools={[data]} />;

export type { ToolCallData, ToolCallCardProps, ToolCallGroupProps };
export { ToolCallCard, ToolCallGroup };
