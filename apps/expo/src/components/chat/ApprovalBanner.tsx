import { YStack, XStack, Text, Button } from 'tamagui';

import type { ApprovalRequest } from '../../hooks/use-prompt';

type ApprovalBannerProps = {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
};

const ApprovalBanner = ({ approval, onApprove, onReject }: ApprovalBannerProps) => (
  <YStack padding="$3" backgroundColor="$yellow2" borderTopWidth={1} borderTopColor="$yellow6" gap="$2">
    <Text fontWeight="600">Approval Required</Text>
    <Text fontSize="$3">
      {approval.toolName}: {approval.reason}
    </Text>
    <XStack gap="$2">
      <Button theme="active" size="$3" onPress={onApprove} flex={1}>
        Approve
      </Button>
      <Button theme="red" size="$3" onPress={onReject} flex={1}>
        Reject
      </Button>
    </XStack>
  </YStack>
);

export { ApprovalBanner };
