import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { YStack, Text } from 'tamagui';
import { useQueryClient } from '@tanstack/react-query';

import { useToolQuery, useToolInvoke } from '../../../src/hooks/use-tools';
import { useAutoSave } from '../../../src/hooks/use-auto-save';
import { DetailHeader, useDetailHeaderHeight } from '../../../src/components/detail-header/detail-header';
import { SecretDetail } from '../../../src/components/secret-detail/secret-detail';
import { KeyboardAwareView } from '../../../src/components/keyboard/keyboard-aware-view';

import type { SecretDetailChanges } from '../../../src/components/secret-detail/secret-detail';

const SecretDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const headerHeight = useDetailHeaderHeight();
  const { data } = useToolQuery('configuration.secrets.list', {});
  const updateSecret = useToolInvoke('configuration.secrets.update');
  const deleteSecret = useToolInvoke('configuration.secrets.delete');

  const secret = data?.secrets.find((s) => s.id === id);

  const handleUpdate = useCallback(
    async (changes: SecretDetailChanges) => {
      await updateSecret.mutateAsync({ id, ...changes });
      queryClient.invalidateQueries({ queryKey: ['tool', 'configuration.secrets.list'] });
    },
    [updateSecret, id, queryClient],
  );

  const { save, status: saveStatus } = useAutoSave(handleUpdate);

  const handleDelete = useCallback(async () => {
    await deleteSecret.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'configuration.secrets.list'] });
    router.back();
  }, [deleteSecret, id, queryClient, router]);

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      <DetailHeader title={secret?.name} onBack={() => router.back()} saveStatus={saveStatus} />

      <YStack flex={1} paddingTop={headerHeight}>
        {secret ? (
          <SecretDetail secret={secret} onUpdate={save} onDelete={handleDelete} />
        ) : (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <Text color="$colorMuted">Loading...</Text>
          </YStack>
        )}
      </YStack>
    </KeyboardAwareView>
  );
};

export default SecretDetailScreen;
