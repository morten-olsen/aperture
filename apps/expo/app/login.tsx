import { useCallback, useState } from 'react';
import { Stack } from 'expo-router';

import { useSession } from '../src/hooks/use-session';
import { LoginScreen } from '../src/components/login/login-screen';

const LoginRoute = () => {
  const session = useSession();
  const [serverUrl, setServerUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    if (!serverUrl.trim() || !userId.trim()) return;
    setIsConnecting(true);
    try {
      await session.login({ serverUrl: serverUrl.trim(), userId: userId.trim(), password });
    } finally {
      setIsConnecting(false);
    }
  }, [serverUrl, userId, password, session]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <LoginScreen
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        userId={userId}
        onUserIdChange={setUserId}
        password={password}
        onPasswordChange={setPassword}
        onConnect={handleConnect}
        isConnecting={isConnecting}
      />
    </>
  );
};

export default LoginRoute;
