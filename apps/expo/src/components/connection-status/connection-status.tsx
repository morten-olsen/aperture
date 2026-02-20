import { useEffect, useState } from 'react';
import { XStack, Text } from 'tamagui';

import type { EventStream } from '../../client/client.events.ts';

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
    <XStack
      alignItems="center"
      gap="$2"
      backgroundColor={connected ? '$successSurface' : '$dangerSurface'}
      paddingHorizontal="$2.5"
      paddingVertical="$1.5"
      borderRadius="$full"
    >
      <XStack width={7} height={7} borderRadius="$full" backgroundColor={connected ? '$success' : '$danger'} />
      <Text fontSize="$2" color={connected ? '$success' : '$danger'} fontWeight="500">
        {connected ? 'Connected' : 'Disconnected'}
      </Text>
    </XStack>
  );
};

export { ConnectionStatus };
