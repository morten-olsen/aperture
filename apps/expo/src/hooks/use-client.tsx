import { createContext, useContext, type ReactNode } from 'react';

import type { ApertureClient } from '@morten-olsen/agentic-client';

const AgenticClientContext = createContext<ApertureClient | null>(null);

const AgenticClientProvider = ({ client, children }: { client: ApertureClient; children: ReactNode }) => (
  <AgenticClientContext.Provider value={client}>{children}</AgenticClientContext.Provider>
);

const useAgenticClient = (): ApertureClient => {
  const client = useContext(AgenticClientContext);
  if (!client) throw new Error('useAgenticClient must be used within AgenticClientProvider');
  return client;
};

export { AgenticClientProvider, useAgenticClient };
