import { useEffect } from 'react';

import { useAgenticClient } from './use-client.tsx';

const useEventStream = () => {
  const client = useAgenticClient();

  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);

  return client.events;
};

export { useEventStream };
