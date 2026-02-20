import { useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { tamaguiConfig } from '../src/theme/tamagui.config';
import { AgenticClient } from '../src/client/client';
import { createSseConnection } from '../src/client/client.sse';
import { AgenticClientProvider } from '../src/hooks/use-client';
import { useEventStream } from '../src/hooks/use-event-stream';

const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const DEFAULT_USER_ID = process.env.EXPO_PUBLIC_DEFAULT_USER ?? 'default';

const queryClient = new QueryClient();

const EventStreamConnector = () => {
  useEventStream();
  return null;
};

const RootLayout = () => {
  const colorScheme = useColorScheme();
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [storedUrl, storedUserId] = await Promise.all([
        AsyncStorage.getItem('serverUrl'),
        AsyncStorage.getItem('userId'),
      ]);
      if (storedUrl) setServerUrl(storedUrl);
      if (storedUserId) setUserId(storedUserId);
      setLoaded(true);
    };
    load();
  }, []);

  const client = useMemo(
    () =>
      new AgenticClient({
        baseUrl: serverUrl,
        userId,
        createSseConnection,
      }),
    [serverUrl, userId],
  );

  if (!loaded) return null;

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <QueryClientProvider client={queryClient}>
        <AgenticClientProvider client={client}>
          <EventStreamConnector />
          <Stack />
        </AgenticClientProvider>
      </QueryClientProvider>
    </TamaguiProvider>
  );
};

export default RootLayout;
