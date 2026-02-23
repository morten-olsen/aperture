import { useCallback } from 'react';
import { FlatList, Pressable } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';
import { Plus, MessageSquare } from '@tamagui/lucide-icons';

import { formatRelativeTime } from '../../utils/format-time.ts';
import { AnimatedListItem } from '../animation/animated-list-item.tsx';
import { GlassView } from '../glass/glass-view.tsx';

type Conversation = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationSidebarProps = {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isCreating?: boolean;
};

type SidebarItemProps = {
  id: string;
  updatedAt: string;
  isActive: boolean;
  onPress: () => void;
};

const SidebarItem = ({ id, updatedAt, isActive, onPress }: SidebarItemProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const displayId = id.slice(0, 8);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <YStack marginHorizontal={8} marginVertical={2}>
        <GlassView
          intensity={isActive ? 'medium' : 'subtle'}
          borderRadius={12}
          padding={12}
          style={
            isActive
              ? {
                  borderColor: isDark ? 'rgba(79,109,245,0.3)' : 'rgba(79,109,245,0.2)',
                  borderWidth: 1,
                }
              : undefined
          }
        >
          <XStack alignItems="center" gap={10}>
            <XStack
              width={32}
              height={32}
              borderRadius="$full"
              backgroundColor={isActive ? '$accent' : isDark ? 'rgba(79,109,245,0.15)' : '$accentSurface'}
              alignItems="center"
              justifyContent="center"
            >
              <MessageSquare size={14} color={isActive ? '$accentText' : '$accent'} />
            </XStack>
            <YStack flex={1} gap={1}>
              <Text
                fontSize={14}
                fontWeight={isActive ? '600' : '500'}
                letterSpacing={-0.1}
                color={isActive ? '$accent' : '$color'}
                numberOfLines={1}
              >
                {displayId}
              </Text>
              <Text fontSize={11} color="$colorMuted" numberOfLines={1}>
                {formatRelativeTime(updatedAt)}
              </Text>
            </YStack>
          </XStack>
        </GlassView>
      </YStack>
    </Pressable>
  );
};

const EmptyState = () => (
  <YStack flex={1} alignItems="center" justifyContent="center" padding="$4" gap="$2">
    <MessageSquare size={32} color="$colorMuted" />
    <Text fontSize={13} color="$colorMuted" textAlign="center">
      No conversations yet
    </Text>
  </YStack>
);

const ConversationSidebar = ({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRefresh,
  isRefreshing = false,
  isCreating = false,
}: ConversationSidebarProps) => {
  const renderItem = useCallback(
    ({ item, index }: { item: Conversation; index: number }) => (
      <AnimatedListItem index={index}>
        <SidebarItem
          id={item.id}
          updatedAt={item.updatedAt}
          isActive={item.id === activeId}
          onPress={() => onSelect(item.id)}
        />
      </AnimatedListItem>
    ),
    [activeId, onSelect],
  );

  return (
    <YStack flex={1}>
      <XStack paddingHorizontal={12} paddingVertical={12} alignItems="center" justifyContent="space-between">
        <Text fontFamily="$heading" fontSize={17} fontWeight="600" letterSpacing={-0.2} color="$color">
          Conversations
        </Text>
        <Pressable onPress={onCreate} disabled={isCreating}>
          <GlassView
            intensity="subtle"
            borderRadius={9999}
            padding={0}
            style={{
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isCreating ? 0.5 : 1,
            }}
          >
            <Plus size={18} color="$accent" />
          </GlassView>
        </Pressable>
      </XStack>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onRefresh={onRefresh}
        refreshing={isRefreshing}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      />
    </YStack>
  );
};

export type { ConversationSidebarProps, Conversation };
export { ConversationSidebar };
