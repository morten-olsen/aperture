import { Tabs } from 'expo-router';
import { Text } from 'tamagui';

const TabLayout = () => (
  <Tabs
    screenOptions={{
      headerShown: true,
    }}
  >
    <Tabs.Screen
      name="index"
      options={{
        title: 'Conversations',
        tabBarIcon: () => <Text>{'💬'}</Text>,
      }}
    />
    <Tabs.Screen
      name="settings"
      options={{
        title: 'Settings',
        tabBarIcon: () => <Text>{'⚙️'}</Text>,
      }}
    />
  </Tabs>
);

export default TabLayout;
