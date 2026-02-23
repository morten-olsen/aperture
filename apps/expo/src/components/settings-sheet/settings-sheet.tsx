import { Pressable, Modal, ScrollView } from 'react-native';
import { YStack, XStack, Text, useThemeName } from 'tamagui';
import {
  X,
  User,
  KeyRound,
  Clock,
  BookOpen,
  CheckSquare,
  Palette,
  ChevronRight,
  type LucideIcon,
} from '@tamagui/lucide-icons';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '../glass/glass-view.tsx';

type SettingsSheetProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onNavigate: (route: 'secrets' | 'triggers' | 'blueprints' | 'tasks' | 'appearance') => void;
  onLogout: () => void;
};

type SettingsRowProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  showChevron?: boolean;
};

const SettingsRow = ({
  icon: Icon,
  title,
  subtitle,
  onPress,
  danger = false,
  showChevron = true,
}: SettingsRowProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack alignItems="center" paddingHorizontal={16} paddingVertical={14} gap={14}>
        <XStack
          width={36}
          height={36}
          borderRadius={10}
          backgroundColor={
            danger
              ? isDark
                ? 'rgba(239,68,68,0.15)'
                : '$dangerSurface'
              : isDark
                ? 'rgba(79,109,245,0.15)'
                : '$accentSurface'
          }
          alignItems="center"
          justifyContent="center"
        >
          <Icon size={18} color={danger ? '$danger' : '$accent'} />
        </XStack>
        <YStack flex={1} gap={1}>
          <Text fontSize={16} fontWeight="500" color={danger ? '$danger' : '$color'}>
            {title}
          </Text>
          {subtitle && (
            <Text fontSize={13} color="$colorMuted" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </YStack>
        {showChevron && <ChevronRight size={18} color="$colorMuted" />}
      </XStack>
    </Pressable>
  );
};

const Divider = () => <YStack height={1} backgroundColor="$borderSubtle" marginHorizontal={16} />;

const SectionHeader = ({ title }: { title: string }) => (
  <Text
    fontSize={12}
    fontWeight="600"
    color="$colorMuted"
    paddingHorizontal={16}
    paddingTop={20}
    paddingBottom={8}
    textTransform="uppercase"
    letterSpacing={0.5}
  >
    {title}
  </Text>
);

const SettingsSheet = ({ visible, onClose, userId, onNavigate, onLogout }: SettingsSheetProps) => {
  const insets = useSafeAreaInsets();

  const handleNavigate = (route: 'secrets' | 'triggers' | 'blueprints' | 'tasks' | 'appearance') => {
    onClose();
    onNavigate(route);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose}>
        <YStack flex={1} justifyContent="flex-end">
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View
              entering={SlideInDown.springify().damping(20).stiffness(200)}
              exiting={SlideOutDown.springify().damping(20).stiffness(200)}
            >
              <GlassView
                intensity="strong"
                borderRadius={24}
                padding={0}
                style={{ marginHorizontal: 8, marginBottom: insets.bottom + 8 }}
              >
                <YStack maxHeight={500}>
                  <XStack
                    alignItems="center"
                    justifyContent="space-between"
                    paddingHorizontal={16}
                    paddingTop={16}
                    paddingBottom={8}
                  >
                    <Text fontFamily="$heading" fontSize={20} fontWeight="700" letterSpacing={-0.3} color="$color">
                      Settings
                    </Text>
                    <Pressable onPress={onClose} hitSlop={12}>
                      <GlassView
                        intensity="subtle"
                        borderRadius={9999}
                        padding={0}
                        style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <X size={16} color="$colorMuted" />
                      </GlassView>
                    </Pressable>
                  </XStack>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <SectionHeader title="Account" />
                    <SettingsRow
                      icon={User}
                      title={userId}
                      subtitle="Connected to server"
                      showChevron={false}
                      onPress={onClose}
                    />

                    <SectionHeader title="Configuration" />
                    <SettingsRow
                      icon={KeyRound}
                      title="Secrets"
                      subtitle="API keys and credentials"
                      onPress={() => handleNavigate('secrets')}
                    />
                    <Divider />
                    <SettingsRow
                      icon={Clock}
                      title="Triggers"
                      subtitle="Scheduled automations"
                      onPress={() => handleNavigate('triggers')}
                    />
                    <Divider />
                    <SettingsRow
                      icon={BookOpen}
                      title="Blueprints"
                      subtitle="Process templates"
                      onPress={() => handleNavigate('blueprints')}
                    />
                    <Divider />
                    <SettingsRow
                      icon={CheckSquare}
                      title="Tasks"
                      subtitle="Review and manage tasks"
                      onPress={() => handleNavigate('tasks')}
                    />

                    <SectionHeader title="Preferences" />
                    <SettingsRow
                      icon={Palette}
                      title="Appearance"
                      subtitle="Theme and display"
                      onPress={() => handleNavigate('appearance')}
                    />

                    <YStack paddingTop={16} paddingBottom={16}>
                      <Pressable
                        onPress={onLogout}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.7 : 1,
                          marginHorizontal: 16,
                        })}
                      >
                        <GlassView intensity="subtle" borderRadius={12} padding={14}>
                          <Text fontSize={16} fontWeight="600" color="$danger" textAlign="center">
                            Sign Out
                          </Text>
                        </GlassView>
                      </Pressable>
                    </YStack>
                  </ScrollView>
                </YStack>
              </GlassView>
            </Animated.View>
          </Pressable>
        </YStack>
      </Pressable>
    </Modal>
  );
};

export type { SettingsSheetProps };
export { SettingsSheet };
