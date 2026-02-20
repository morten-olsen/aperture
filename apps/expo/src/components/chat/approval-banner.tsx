import { Pressable } from 'react-native';
import { YStack, XStack, Text } from 'tamagui';

import type { ApprovalRequest } from '../../hooks/use-prompt';

type ApprovalBannerProps = {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
};

const ApprovalBanner = ({ approval, onApprove, onReject }: ApprovalBannerProps) => (
  <YStack paddingHorizontal="$5" paddingVertical="$4" gap="$4" borderTopWidth={1} borderTopColor="$borderSubtle">
    <YStack gap="$2">
      <Text fontSize={13} fontWeight="600" color="$colorMuted" letterSpacing={0.3} textTransform="uppercase">
        Approval required
      </Text>
      <XStack alignItems="center" gap="$2.5" flexWrap="wrap">
        <YStack backgroundColor="$chatTool" borderRadius="$badge" paddingHorizontal="$2.5" paddingVertical="$1.5">
          <Text fontSize={13} fontFamily="$mono" color="$colorSubtle">
            {approval.toolName}
          </Text>
        </YStack>
        <Text fontSize={15} color="$color" flex={1}>
          {approval.reason}
        </Text>
      </XStack>
    </YStack>
    <XStack gap="$3" alignItems="center">
      <Pressable onPress={onApprove} style={{ flex: 1 }}>
        <YStack
          backgroundColor="$accent"
          borderRadius="$button"
          paddingVertical="$3"
          alignItems="center"
          pressStyle={{ opacity: 0.85 }}
        >
          <Text fontSize={16} fontWeight="600" color="$accentText">
            Approve
          </Text>
        </YStack>
      </Pressable>
      <Pressable onPress={onReject}>
        <YStack paddingVertical="$3" paddingHorizontal="$4">
          <Text fontSize={16} color="$colorMuted">
            Reject
          </Text>
        </YStack>
      </Pressable>
    </XStack>
  </YStack>
);

export { ApprovalBanner };
