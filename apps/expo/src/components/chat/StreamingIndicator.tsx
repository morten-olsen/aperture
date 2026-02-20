import { useEffect, useState } from 'react';
import { XStack, Text } from 'tamagui';

const StreamingIndicator = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <XStack padding="$2" justifyContent="center">
      <Text color="$gray10">Thinking{dots}</Text>
    </XStack>
  );
};

export { StreamingIndicator };
