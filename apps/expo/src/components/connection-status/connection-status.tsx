import { useEffect, useState } from 'react';
import { XStack, Text } from 'tamagui';

import type { EventStream } from '../../client/client.events.ts';
import { GlassView } from '../glass/glass-view.tsx';

type ConnectionStatusProps = {
  events: EventStream;
};

const ConnectionStatus = ({ events }: ConnectionStatusProps) => {
  const [connected, setConnected] = useState(events.connected);

  useEffect(() => {
    const interval = setInterval(() => {
      setConnected(events.connected);
    }, 1000);
    return () => clearInterval(interval);
  }, [events]);

  return (
    <GlassView intensity="subtle" borderRadius={9999} padding={0}>
      <XStack alignItems="center" gap={8} paddingHorizontal={10} paddingVertical={6}>
        <XStack width={7} height={7} borderRadius="$full" backgroundColor={connected ? '$success' : '$danger'} />
        <Text fontSize="$2" color={connected ? '$success' : '$danger'} fontWeight="500">
          {connected ? 'Connected' : 'Disconnected'}
        </Text>
      </XStack>
    </GlassView>
  );
};

export { ConnectionStatus };
