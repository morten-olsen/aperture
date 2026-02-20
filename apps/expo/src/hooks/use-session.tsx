import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SessionContextValue = {
  serverUrl: string;
  userId: string;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (params: { serverUrl: string; userId: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEYS = ['serverUrl', 'userId', 'password'] as const;

const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [serverUrl, setServerUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [storedUrl, storedUserId] = await Promise.all([
        AsyncStorage.getItem('serverUrl'),
        AsyncStorage.getItem('userId'),
      ]);
      if (storedUrl) setServerUrl(storedUrl);
      if (storedUserId) setUserId(storedUserId);
      setIsLoading(false);
    };
    load();
  }, []);

  const login = useCallback(async (params: { serverUrl: string; userId: string; password: string }) => {
    await AsyncStorage.multiSet([
      ['serverUrl', params.serverUrl],
      ['userId', params.userId],
      ['password', params.password],
    ]);
    setServerUrl(params.serverUrl);
    setUserId(params.userId);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([...STORAGE_KEYS]);
    setServerUrl('');
    setUserId('');
  }, []);

  const isLoggedIn = Boolean(serverUrl && userId);

  return (
    <SessionContext.Provider value={{ serverUrl, userId, isLoggedIn, isLoading, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
};

const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
};

export type { SessionContextValue };
export { SessionProvider, useSession };
