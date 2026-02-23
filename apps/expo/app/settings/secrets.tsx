import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tamagui/lucide-icons';

import { useToolQuery, useToolInvoke } from '../../src/hooks/use-tools';
import { GlassView } from '../../src/components/glass/glass-view';
import { SecretList } from '../../src/components/secret-list/secret-list';
import { ListScreen } from '../../src/components/list-screen/list-screen';

const SecretsRoute = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useToolQuery('configuration.secrets.list', {});
  const createSecret = useToolInvoke('configuration.secrets.create');

  const secrets = data?.secrets ?? [];

  const handleCreate = useCallback(async () => {
    const result = await createSecret.mutateAsync({
      name: 'New Secret',
      value: '',
    });
    queryClient.invalidateQueries({ queryKey: ['tool', 'configuration.secrets.list'] });
    router.push(`/settings/secrets/${result.id}`);
  }, [createSecret, queryClient, router]);

  return (
    <ListScreen
      title="Secrets"
      onBack={() => router.back()}
      headerRight={
        <Pressable onPress={handleCreate} disabled={createSecret.isPending}>
          <GlassView
            intensity="subtle"
            borderRadius={9999}
            padding={0}
            style={{
              width: 42,
              height: 42,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: createSecret.isPending ? 0.5 : 1,
            }}
          >
            <Plus size={24} color="$accent" />
          </GlassView>
        </Pressable>
      }
    >
      {({ scrollHandler, contentPadding }) => (
        <SecretList
          onScroll={scrollHandler}
          contentPadding={contentPadding}
          secrets={secrets}
          onSelect={(id) => router.push(`/settings/secrets/${id}`)}
          onRefresh={refetch}
          isRefreshing={isLoading}
        />
      )}
    </ListScreen>
  );
};

export default SecretsRoute;
