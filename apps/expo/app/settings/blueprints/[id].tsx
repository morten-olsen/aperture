import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { YStack, Text } from 'tamagui';
import { useQueryClient } from '@tanstack/react-query';

import { useToolQuery, useToolInvoke } from '../../../src/hooks/use-tools';
import { useAutoSave } from '../../../src/hooks/use-auto-save';
import { DetailHeader, useDetailHeaderHeight } from '../../../src/components/detail-header/detail-header';
import { BlueprintDetail } from '../../../src/components/blueprint-detail/blueprint-detail';
import { KeyboardAwareView } from '../../../src/components/keyboard/keyboard-aware-view';

import type { BlueprintDetailChanges } from '../../../src/components/blueprint-detail/blueprint-detail';

const BlueprintDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const headerHeight = useDetailHeaderHeight();
  const { data } = useToolQuery('blueprint.get', { id });
  const updateBlueprint = useToolInvoke('blueprint.update');
  const deleteBlueprint = useToolInvoke('blueprint.delete');

  const blueprint = data;

  const handleUpdate = useCallback(
    async (changes: BlueprintDetailChanges) => {
      await updateBlueprint.mutateAsync({ id, ...changes });
      queryClient.invalidateQueries({ queryKey: ['tool', 'blueprint.get'] });
      queryClient.invalidateQueries({ queryKey: ['tool', 'blueprint.list'] });
    },
    [updateBlueprint, id, queryClient],
  );

  const { save, status: saveStatus } = useAutoSave(handleUpdate);

  const handleDelete = useCallback(async () => {
    await deleteBlueprint.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'blueprint.list'] });
    router.back();
  }, [deleteBlueprint, id, queryClient, router]);

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      <DetailHeader title={blueprint?.title} onBack={() => router.back()} saveStatus={saveStatus} />

      <YStack flex={1} paddingTop={headerHeight}>
        {blueprint ? (
          <BlueprintDetail blueprint={blueprint} onUpdate={save} onDelete={handleDelete} />
        ) : (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <Text color="$colorMuted">Loading...</Text>
          </YStack>
        )}
      </YStack>
    </KeyboardAwareView>
  );
};

export default BlueprintDetailScreen;
