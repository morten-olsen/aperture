import { useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { tamaguiConfig } from '../src/theme/tamagui.config';
import { AgenticClient } from '../src/client/client';
import { createSseConnection } from '../src/client/client.sse';
import { AgenticClientProvider } from '../src/hooks/use-client';
import { useEventStream } from '../src/hooks/use-event-stream';
import { SessionProvider, useSession } from '../src/hooks/use-session';

const queryClient = new QueryClient();

const EventStreamConnector = () => {
  useEventStream();
  return null;
};

const AuthenticatedProviders = ({ children }: { children: React.ReactNode }) => {
  const { serverUrl, userId } = useSession();

  const client = useMemo(
    () =>
      new AgenticClient({
        baseUrl: serverUrl,
        userId,
        createSseConnection,
      }),
    [serverUrl, userId],
  );

  return (
    <AgenticClientProvider client={client}>
      <EventStreamConnector />
      {children}
    </AgenticClientProvider>
  );
};

const InnerLayout = () => {
  const { isLoggedIn, isLoading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const onLoginScreen = segments[0] === 'login';

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn && !onLoginScreen) {
      router.replace('/login');
    } else if (isLoggedIn && onLoginScreen) {
      router.replace('/');
    }
  }, [isLoggedIn, isLoading, onLoginScreen, router]);

  useEffect(() => {
    if (!isLoggedIn) {
      queryClient.clear();
    }
  }, [isLoggedIn]);

  if (isLoading) return null;

  // Suppress render while route doesn't match auth state (redirect is pending)
  if (!isLoggedIn && !onLoginScreen) return null;
  if (isLoggedIn && onLoginScreen) return null;

  if (isLoggedIn) {
    return (
      <AuthenticatedProviders>
        <Slot />
      </AuthenticatedProviders>
    );
  }

  return <Slot />;
};

const RootLayout = () => {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
          <QueryClientProvider client={queryClient}>
            <InnerLayout />
          </QueryClientProvider>
        </TamaguiProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
};

export default RootLayout;
