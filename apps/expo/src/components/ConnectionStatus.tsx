import { useEffect, useState } from 'react';
import { XStack, Text } from 'tamagui';

import type { EventStream } from '../client/client.events.ts';

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
    <XStack alignItems="center" gap="$1">
      <XStack width={8} height={8} borderRadius={4} backgroundColor={connected ? '$green9' : '$red9'} />
      <Text fontSize="$2" color="$gray10">
        {connected ? 'Connected' : 'Disconnected'}
      </Text>
    </XStack>
  );
};

export { ConnectionStatus };
