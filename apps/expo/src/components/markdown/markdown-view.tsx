import type { ReactNode } from 'react';
import { YStack, XStack, Text } from 'tamagui';

type MarkdownViewProps = {
  content: string;
  color?: string;
};

type InlineSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'boldItalic'; value: string };

const parseInline = (text: string): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  const pattern = /(`[^`]+`)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    if (match[1]) {
      segments.push({ type: 'code', value: raw.slice(1, -1) });
    } else if (match[2]) {
      segments.push({ type: 'boldItalic', value: raw.slice(3, -3) });
    } else if (match[3]) {
      segments.push({ type: 'bold', value: raw.slice(2, -2) });
    } else if (match[4]) {
      segments.push({ type: 'italic', value: raw.slice(1, -1) });
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
};

const InlineRenderer = ({ segments, color }: { segments: InlineSegment[]; color: string }) => (
  <Text fontSize={16} lineHeight={23} letterSpacing={-0.1} color={color}>
    {segments.map((seg, i) => {
      switch (seg.type) {
        case 'bold':
          return (
            <Text key={i} fontWeight="700" color={color}>
              {seg.value}
            </Text>
          );
        case 'italic':
          return (
            <Text key={i} fontStyle="italic" color={color}>
              {seg.value}
            </Text>
          );
        case 'boldItalic':
          return (
            <Text key={i} fontWeight="700" fontStyle="italic" color={color}>
              {seg.value}
            </Text>
          );
        case 'code':
          return (
            <Text
              key={i}
              fontFamily="$mono"
              fontSize={14}
              backgroundColor="rgba(255,255,255,0.15)"
              paddingHorizontal={5}
              borderRadius={4}
              color={color}
            >
              {seg.value}
            </Text>
          );
        default:
          return seg.value;
      }
    })}
  </Text>
);

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language: string; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

const parseBlocks = (source: string): Block[] => {
  const blocks: Block[] = [];
  const lines = source.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', language, text: codeLines.join('\n') });
      i++; // skip closing ```
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // List items
    const listMatch = line.match(/^(\d+\.\s+|- |\* )/);
    if (listMatch) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(?:\d+\.\s+|- |\* )(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].match(/^(\d+\.\s+|- |\* )/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
    }
  }

  return blocks;
};

const HEADING_SIZES = [24, 20, 17] as const;

const BlockRenderer = ({ block, color }: { block: Block; color: string }): ReactNode => {
  switch (block.type) {
    case 'heading': {
      const size = HEADING_SIZES[block.level - 1] ?? 17;
      return (
        <Text fontFamily="$heading" fontSize={size} fontWeight="700" letterSpacing={-0.3} color={color}>
          {block.text}
        </Text>
      );
    }
    case 'code':
      return (
        <YStack
          backgroundColor="rgba(255,255,255,0.12)"
          borderRadius="$badge"
          paddingHorizontal={14}
          paddingVertical={12}
        >
          <Text fontFamily="$mono" fontSize={14} lineHeight={20} color={color}>
            {block.text}
          </Text>
        </YStack>
      );
    case 'list':
      return (
        <YStack gap={4}>
          {block.items.map((item, i) => (
            <XStack key={i} gap={8}>
              <Text fontSize={16} lineHeight={23} color="$colorMuted" width={20} textAlign="right">
                {block.ordered ? `${i + 1}.` : '\u2022'}
              </Text>
              <InlineRenderer segments={parseInline(item)} color={color} />
            </XStack>
          ))}
        </YStack>
      );
    case 'paragraph':
      return <InlineRenderer segments={parseInline(block.text)} color={color} />;
  }
};

const MarkdownView = ({ content, color = '$color' }: MarkdownViewProps) => {
  const blocks = parseBlocks(content);

  return (
    <YStack gap={10}>
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} color={color} />
      ))}
    </YStack>
  );
};

export type { MarkdownViewProps };
export { MarkdownView };
