import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tamagui/lucide-icons';

import { useToolQuery, useToolInvoke } from '../../src/hooks/use-tools';
import { GlassView } from '../../src/components/glass/glass-view';
import { BlueprintList } from '../../src/components/blueprint-list/blueprint-list';
import { ListScreen } from '../../src/components/list-screen/list-screen';

const BlueprintsRoute = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useToolQuery('blueprint.list', {});
  const createBlueprint = useToolInvoke('blueprint.create');

  const blueprints = data?.blueprints ?? [];

  const handleCreate = useCallback(async () => {
    const result = await createBlueprint.mutateAsync({
      title: 'New Blueprint',
      use_case: '',
      process: '',
    });
    queryClient.invalidateQueries({ queryKey: ['tool', 'blueprint.list'] });
    router.push(`/settings/blueprints/${result.id}`);
  }, [createBlueprint, queryClient, router]);

  return (
    <ListScreen
      title="Blueprints"
      onBack={() => router.back()}
      headerRight={
        <Pressable onPress={handleCreate} disabled={createBlueprint.isPending}>
          <GlassView
            intensity="subtle"
            borderRadius={9999}
            padding={0}
            style={{
              width: 42,
              height: 42,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: createBlueprint.isPending ? 0.5 : 1,
            }}
          >
            <Plus size={24} color="$accent" />
          </GlassView>
        </Pressable>
      }
    >
      {({ scrollHandler, contentPadding }) => (
        <BlueprintList
          onScroll={scrollHandler}
          contentPadding={contentPadding}
          blueprints={blueprints}
          onSelect={(id) => router.push(`/settings/blueprints/${id}`)}
          onRefresh={refetch}
          isRefreshing={isLoading}
        />
      )}
    </ListScreen>
  );
};

export default BlueprintsRoute;
