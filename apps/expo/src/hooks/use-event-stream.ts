import { useEffect } from 'react';

import { useAgenticClient } from './use-client.tsx';

const useEventStream = () => {
  const client = useAgenticClient();

  useEffect(() => {
    client.events.connect();
    return () => client.events.disconnect();
  }, [client]);

  return client.events;
};

export { useEventStream };
