import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import type { EventStream } from '../../client/client.events.ts';

import { ConnectionStatus } from './connection-status.tsx';

const meta: Meta<typeof ConnectionStatus> = {
  component: ConnectionStatus,
};

type Story = StoryObj<typeof ConnectionStatus>;

const Connected: Story = {
  args: {
    events: { connected: true } as EventStream,
  },
};

const Disconnected: Story = {
  args: {
    events: { connected: false } as EventStream,
  },
};

export { Connected, Disconnected };
export default meta;
