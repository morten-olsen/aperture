import { Text } from 'tamagui';

type MarkdownViewProps = {
  content: string;
};

const MarkdownView = ({ content }: MarkdownViewProps) => <Text>{content}</Text>;

export { MarkdownView };
