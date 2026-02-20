import { TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text, useTheme } from 'tamagui';

import { AuraBackground } from '../aura/aura-background.tsx';
import { GlassView } from '../glass/glass-view.tsx';

type LoginScreenProps = {
  serverUrl: string;
  onServerUrlChange: (v: string) => void;
  userId: string;
  onUserIdChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  onConnect: () => void;
  isConnecting?: boolean;
};

const Field = ({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
}) => {
  const theme = useTheme();
  return (
    <XStack
      backgroundColor="rgba(255,255,255,0.15)"
      borderRadius="$input"
      height={48}
      paddingHorizontal={16}
      alignItems="center"
    >
      <TextInput
        style={{
          flex: 1,
          fontSize: 16,
          letterSpacing: -0.1,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          color: theme.color?.val,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colorMuted?.val}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </XStack>
  );
};

const LoginScreen = ({
  serverUrl,
  onServerUrlChange,
  userId,
  onUserIdChange,
  password,
  onPasswordChange,
  onConnect,
  isConnecting = false,
}: LoginScreenProps) => {
  const insets = useSafeAreaInsets();

  return (
    <YStack
      flex={1}
      backgroundColor="$backgroundBase"
      alignItems="center"
      justifyContent="center"
      padding="$5"
      paddingTop={insets.top}
      paddingBottom={insets.bottom}
    >
      <AuraBackground variant="login" />

      <YStack width="100%" maxWidth={400} gap="$6">
        <YStack alignItems="center" gap="$2">
          <Text fontFamily="$heading" fontSize={42} fontWeight="700" letterSpacing={-1.2} color="$color">
            Aperture
          </Text>
          <Text fontSize={15} color="$colorSubtle">
            Agentic AI Framework
          </Text>
        </YStack>

        <GlassView intensity="medium" borderRadius={24} padding={24}>
          <YStack gap="$3">
            <Field value={serverUrl} onChangeText={onServerUrlChange} placeholder="Server URL" />
            <Field value={userId} onChangeText={onUserIdChange} placeholder="Username" />
            <Field value={password} onChangeText={onPasswordChange} placeholder="Password" secureTextEntry />
          </YStack>

          <YStack height={20} />

          <Pressable
            onPress={isConnecting ? undefined : onConnect}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <YStack
              backgroundColor="$accent"
              borderRadius="$button"
              height={50}
              alignItems="center"
              justifyContent="center"
              opacity={isConnecting ? 0.6 : 1}
            >
              <Text color="$accentText" fontSize={17} fontWeight="600">
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Text>
            </YStack>
          </Pressable>
        </GlassView>
      </YStack>
    </YStack>
  );
};

export type { LoginScreenProps };
export { LoginScreen };
