import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { YStack, Text, Input, Button, XStack } from 'tamagui';

import { useAgenticClient } from '../../src/hooks/use-client';
import { ConnectionStatus } from '../../src/components/ConnectionStatus';

const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const DEFAULT_USER_ID = process.env.EXPO_PUBLIC_DEFAULT_USER ?? 'default';

const SettingsScreen = () => {
  const client = useAgenticClient();
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [userId, setUserId] = useState(DEFAULT_USER_ID);

  useEffect(() => {
    const load = async () => {
      const [storedUrl, storedUserId] = await Promise.all([
        AsyncStorage.getItem('serverUrl'),
        AsyncStorage.getItem('userId'),
      ]);
      if (storedUrl) setServerUrl(storedUrl);
      if (storedUserId) setUserId(storedUserId);
    };
    load();
  }, []);

  const handleSave = useCallback(async () => {
    await Promise.all([AsyncStorage.setItem('serverUrl', serverUrl), AsyncStorage.setItem('userId', userId)]);
  }, [serverUrl, userId]);

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <YStack gap="$2">
        <Text fontWeight="600">Server URL</Text>
        <Input value={serverUrl} onChangeText={setServerUrl} placeholder="http://localhost:3000/api" />
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="600">User ID</Text>
        <Input value={userId} onChangeText={setUserId} placeholder="default" />
      </YStack>

      <Button theme="active" onPress={handleSave}>
        Save Settings
      </Button>

      <XStack gap="$2" alignItems="center">
        <Text fontWeight="600">Connection:</Text>
        <ConnectionStatus events={client.events} />
      </XStack>
    </YStack>
  );
};

export default SettingsScreen;
