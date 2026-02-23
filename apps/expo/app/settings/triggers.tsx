import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tamagui/lucide-icons';

import { useToolQuery, useToolInvoke } from '../../src/hooks/use-tools';
import { GlassView } from '../../src/components/glass/glass-view';
import { TriggerList } from '../../src/components/trigger-list/trigger-list';
import { ListScreen } from '../../src/components/list-screen/list-screen';

const TriggersRoute = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useToolQuery('trigger.list', {});
  const createTrigger = useToolInvoke('trigger.create');

  const triggers = data?.triggers ?? [];

  const handleCreate = useCallback(async () => {
    const result = await createTrigger.mutateAsync({
      name: 'New Trigger',
      goal: '',
      model: 'normal',
      scheduleType: 'cron',
      scheduleValue: '0 9 * * *',
    });
    queryClient.invalidateQueries({ queryKey: ['tool', 'trigger.list'] });
    router.push(`/settings/triggers/${result.triggerId}`);
  }, [createTrigger, queryClient, router]);

  return (
    <ListScreen
      title="Triggers"
      onBack={() => router.back()}
      headerRight={
        <Pressable onPress={handleCreate} disabled={createTrigger.isPending}>
          <GlassView
            intensity="subtle"
            borderRadius={9999}
            padding={0}
            style={{
              width: 42,
              height: 42,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: createTrigger.isPending ? 0.5 : 1,
            }}
          >
            <Plus size={24} color="$accent" />
          </GlassView>
        </Pressable>
      }
    >
      {({ scrollHandler, contentPadding }) => (
        <TriggerList
          onScroll={scrollHandler}
          contentPadding={contentPadding}
          triggers={triggers}
          onSelect={(id) => router.push(`/settings/triggers/${id}`)}
          onRefresh={refetch}
          isRefreshing={isLoading}
        />
      )}
    </ListScreen>
  );
};

export default TriggersRoute;
