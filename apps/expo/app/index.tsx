import { useCallback, useRef, useState } from 'react';
import { Pressable, Modal, Platform, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { Plus } from '@tamagui/lucide-icons';

import { useToolQuery, useToolInvoke } from '../src/hooks/use-tools';
import { useSession } from '../src/hooks/use-session';
import { ConversationList } from '../src/components/conversation-list/conversation-list';

type MenuPosition = { top: number; left: number };

const AvatarMenu = ({ onLogout }: { onLogout: () => void }) => {
  const { userId } = useSession();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const avatarRef = useRef<{ measure: (cb: (...args: number[]) => void) => void }>(null);

  const initials = userId.slice(0, 2).toUpperCase();

  const handlePress = () => {
    avatarRef.current?.measure((_x, _y, _w, h, px, py) => {
      setPosition({ top: py + h + 8, left: px });
    });
    setOpen(true);
  };

  return (
    <>
      <Pressable ref={avatarRef as never} onPress={handlePress}>
        <XStack
          width={42}
          height={42}
          borderRadius="$full"
          backgroundColor="$accentSurface"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={15} fontWeight="600" color="$accent">
            {initials}
          </Text>
        </XStack>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <YStack
            position="absolute"
            top={position.top}
            left={position.left}
            backgroundColor="$surfaceRaised"
            borderRadius="$card"
            paddingVertical="$2"
            shadowColor="black"
            shadowOpacity={0.15}
            shadowRadius={12}
            shadowOffset={{ width: 0, height: 4 }}
            minWidth={160}
            borderWidth={1}
            borderColor="$borderSubtle"
          >
            <YStack paddingHorizontal="$4" paddingVertical="$2">
              <Text fontSize={13} color="$colorSubtle" fontWeight="500">
                {userId}
              </Text>
            </YStack>
            <YStack height={1} backgroundColor="$borderSubtle" marginVertical="$1" />
            <Pressable
              onPress={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <YStack paddingHorizontal="$4" paddingVertical="$2.5">
                <Text fontSize={15} color="$danger" fontWeight="500">
                  Sign Out
                </Text>
              </YStack>
            </Pressable>
          </YStack>
        </Pressable>
      </Modal>
    </>
  );
};

const ConversationsRoute = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { data, refetch, isLoading } = useToolQuery('conversation.list', {});
  const createConversation = useToolInvoke('conversation.create');

  const conversations = data?.result.conversations ?? [];

  const handleCreate = useCallback(async () => {
    const result = await createConversation.mutateAsync({});
    router.push(`/conversation/${result.result.id}`);
  }, [createConversation, router]);

  const handleLogout = useCallback(async () => {
    await session.logout();
  }, [session]);

  const content = (
    <YStack flex={1} backgroundColor="$background" paddingTop={insets.top} paddingBottom={insets.bottom}>
      <Stack.Screen options={{ headerShown: false }} />

      <YStack paddingHorizontal="$5" paddingTop="$4" paddingBottom="$2">
        <XStack justifyContent="space-between" alignItems="center" height={52}>
          <YStack width={42} />
          <AvatarMenu onLogout={handleLogout} />
          <Pressable onPress={handleCreate} disabled={createConversation.isPending}>
            <XStack
              width={42}
              height={42}
              borderRadius="$full"
              backgroundColor="$surfaceHover"
              alignItems="center"
              justifyContent="center"
              opacity={createConversation.isPending ? 0.5 : 1}
            >
              <Plus size={24} color="$accent" />
            </XStack>
          </Pressable>
        </XStack>
      </YStack>

      <Text
        fontFamily="$heading"
        fontSize={34}
        fontWeight="700"
        letterSpacing={-1}
        color="$color"
        paddingHorizontal="$5"
        paddingTop="$4"
        paddingBottom="$3"
      >
        Chats
      </Text>

      <ConversationList
        conversations={conversations}
        onSelect={(id) => router.push(`/conversation/${id}`)}
        onRefresh={refetch}
        isRefreshing={isLoading}
      />
    </YStack>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
};

export default ConversationsRoute;
