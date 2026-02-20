import { useCallback, useRef, useState } from 'react';
import { Pressable, Modal, Platform, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text, useThemeName } from 'tamagui';
import { Plus } from '@tamagui/lucide-icons';
import Animated from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../src/hooks/use-tools';
import { useSession } from '../src/hooks/use-session';
import { useMountAnimation } from '../src/hooks/use-mount-animation';
import { ConversationList } from '../src/components/conversation-list/conversation-list';
import { GlassView } from '../src/components/glass/glass-view';

type MenuPosition = { top: number; left: number };

const AvatarMenu = ({ onLogout }: { onLogout: () => void }) => {
  const { userId } = useSession();
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
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
          backgroundColor={isDark ? 'rgba(79,109,245,0.2)' : '$accentSurface'}
          borderWidth={isDark ? 1 : 0}
          borderColor="rgba(79,109,245,0.15)"
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
          <GlassView
            intensity="strong"
            borderRadius={18}
            padding={0}
            style={{
              position: 'absolute',
              top: position.top,
              left: position.left,
              minWidth: 160,
            }}
          >
            <YStack paddingHorizontal={16} paddingVertical={8}>
              <Text fontSize={13} color="$colorSubtle" fontWeight="500">
                {userId}
              </Text>
            </YStack>
            <YStack height={1} backgroundColor="$glassBorder" marginVertical={4} />
            <Pressable
              onPress={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <YStack paddingHorizontal={16} paddingVertical={10}>
                <Text fontSize={15} color="$danger" fontWeight="500">
                  Sign Out
                </Text>
              </YStack>
            </Pressable>
          </GlassView>
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

  const headerAnim = useMountAnimation({ duration: 400, delay: 200 });
  const titleAnim = useMountAnimation({ translateY: 10, duration: 450, delay: 300 });

  const content = (
    <YStack flex={1} paddingTop={insets.top} paddingBottom={insets.bottom}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={headerAnim.style}>
        <YStack paddingHorizontal="$5" paddingTop="$4" paddingBottom="$2">
          <XStack justifyContent="space-between" alignItems="center" height={52}>
            <YStack width={42} />
            <AvatarMenu onLogout={handleLogout} />
            <Pressable onPress={handleCreate} disabled={createConversation.isPending}>
              <GlassView
                intensity="subtle"
                borderRadius={9999}
                padding={0}
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: createConversation.isPending ? 0.5 : 1,
                }}
              >
                <Plus size={24} color="$accent" />
              </GlassView>
            </Pressable>
          </XStack>
        </YStack>
      </Animated.View>

      <Animated.View style={titleAnim.style}>
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
      </Animated.View>

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
