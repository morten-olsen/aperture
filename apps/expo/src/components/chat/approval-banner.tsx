import { Pressable } from 'react-native';
import { YStack, XStack, Text } from 'tamagui';

import type { ApprovalRequest } from '../../hooks/use-prompt';

import { GlassView } from '../glass/glass-view.tsx';

type ApprovalBannerProps = {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
};

const ApprovalBanner = ({ approval, onApprove, onReject }: ApprovalBannerProps) => (
  <GlassView intensity="strong" borderRadius={0} padding={0}>
    <YStack paddingHorizontal={20} paddingVertical={16} gap={16}>
      <YStack gap={8}>
        <Text fontSize={13} fontWeight="600" color="$colorMuted" letterSpacing={0.3} textTransform="uppercase">
          Approval required
        </Text>
        <XStack alignItems="center" gap={10} flexWrap="wrap">
          <YStack
            backgroundColor="rgba(255,255,255,0.15)"
            borderRadius="$badge"
            paddingHorizontal={10}
            paddingVertical={6}
          >
            <Text fontSize={13} fontFamily="$mono" color="$colorSubtle">
              {approval.toolName}
            </Text>
          </YStack>
          <Text fontSize={15} color="$color" flex={1}>
            {approval.reason}
          </Text>
        </XStack>
      </YStack>
      <XStack gap={12} alignItems="center">
        <Pressable onPress={onApprove} style={{ flex: 1 }}>
          <YStack
            backgroundColor="$accent"
            borderRadius="$button"
            paddingVertical={12}
            alignItems="center"
            pressStyle={{ opacity: 0.85 }}
          >
            <Text fontSize={16} fontWeight="600" color="$accentText">
              Approve
            </Text>
          </YStack>
        </Pressable>
        <Pressable onPress={onReject}>
          <YStack paddingVertical={12} paddingHorizontal={16}>
            <Text fontSize={16} color="$colorMuted">
              Reject
            </Text>
          </YStack>
        </Pressable>
      </XStack>
    </YStack>
  </GlassView>
);

export { ApprovalBanner };
