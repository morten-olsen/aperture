import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { MarkdownView } from './markdown-view.tsx';

const meta: Meta<typeof MarkdownView> = {
  component: MarkdownView,
};

type Story = StoryObj<typeof MarkdownView>;

const Default: Story = {
  args: {
    content: '# Hello World\n\nThis is a **markdown** paragraph with `inline code`.',
  },
};

const RichContent: Story = {
  args: {
    content: [
      '# Refactoring Plan',
      '',
      'Here are the changes I suggest:',
      '',
      '## Step 1: Extract utilities',
      '',
      'Move the **token validation** logic into `auth.tokens.ts`. This gives us:',
      '',
      '- Better separation of concerns',
      '- Easier unit testing',
      '- Reusable token helpers',
      '',
      '## Step 2: Add error types',
      '',
      '```typescript',
      'class AuthError extends Error {',
      '  constructor(public code: string, message: string) {',
      '    super(message);',
      '  }',
      '}',
      '```',
      '',
      'This replaces the ***generic*** error strings with typed errors.',
      '',
      '### Ordered steps',
      '',
      '1. Create the error classes',
      '2. Update the service',
      '3. Run the test suite',
    ].join('\n'),
  },
};

const CodeBlock: Story = {
  args: {
    content: [
      'Here is the fix:',
      '',
      '```ts',
      'const handler = async (req: Request) => {',
      '  const token = req.headers.get("Authorization");',
      '  if (!token) throw new AuthError("MISSING_TOKEN", "No token");',
      '  return validate(token);',
      '};',
      '```',
      '',
      'Apply this to `src/auth/auth.middleware.ts`.',
    ].join('\n'),
  },
};

export { Default, RichContent, CodeBlock };
export default meta;
