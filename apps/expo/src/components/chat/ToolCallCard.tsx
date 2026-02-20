import { useState } from 'react';
import { YStack, XStack, Text, Button } from 'tamagui';

type ToolCallCardProps = {
  data: {
    type: string;
    function?: string;
    input?: unknown;
    result?: unknown;
    [key: string]: unknown;
  };
};

const ToolCallCard = ({ data }: ToolCallCardProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <YStack
      padding="$3"
      marginVertical="$1"
      borderRadius="$3"
      backgroundColor="$gray2"
      borderWidth={1}
      borderColor="$gray6"
    >
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontWeight="600" fontSize="$3">
          {data.function ?? 'Tool Call'}
        </Text>
        <Button size="$2" chromeless onPress={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'Expand'}
        </Button>
      </XStack>

      {expanded && (
        <YStack marginTop="$2" gap="$2">
          {data.input !== undefined && (
            <YStack>
              <Text fontSize="$2" color="$gray10" fontWeight="600">
                Input
              </Text>
              <Text fontSize="$2" fontFamily="$mono">
                {JSON.stringify(data.input, null, 2)}
              </Text>
            </YStack>
          )}
          {data.result !== undefined && (
            <YStack>
              <Text fontSize="$2" color="$gray10" fontWeight="600">
                Result
              </Text>
              <Text fontSize="$2" fontFamily="$mono">
                {JSON.stringify(data.result, null, 2)}
              </Text>
            </YStack>
          )}
        </YStack>
      )}
    </YStack>
  );
};

export { ToolCallCard };
