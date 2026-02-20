import { useEffect, useState } from 'react';
import { XStack, YStack } from 'tamagui';

const StreamingIndicator = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => (prev + 1) % 3);
    }, 450);
    return () => clearInterval(interval);
  }, []);

  return (
    <XStack paddingVertical="$3" gap="$2" alignItems="center">
      {[0, 1, 2].map((i) => (
        <YStack
          key={i}
          width={8}
          height={8}
          borderRadius="$full"
          backgroundColor="$colorMuted"
          opacity={step === i ? 0.9 : 0.25}
        />
      ))}
    </XStack>
  );
};

export { StreamingIndicator };
