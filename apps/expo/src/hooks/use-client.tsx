import { createContext, useContext, type ReactNode } from 'react';

import type { AgenticClient } from '../client/client';

const AgenticClientContext = createContext<AgenticClient | null>(null);

const AgenticClientProvider = ({ client, children }: { client: AgenticClient; children: ReactNode }) => (
  <AgenticClientContext.Provider value={client}>{children}</AgenticClientContext.Provider>
);

const useAgenticClient = (): AgenticClient => {
  const client = useContext(AgenticClientContext);
  if (!client) throw new Error('useAgenticClient must be used within AgenticClientProvider');
  return client;
};

export { AgenticClientProvider, useAgenticClient };
