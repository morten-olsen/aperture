import { ScrollView, Pressable } from 'react-native';
import { XStack, Text } from 'tamagui';

type FilterChipOption<T extends string> = {
  value: T;
  label: string;
  color?: string;
  surface?: string;
};

type FilterChipsProps<T extends string> = {
  options: FilterChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
};

const FilterChips = <T extends string>({ options, selected, onSelect }: FilterChipsProps<T>) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
  >
    {options.map((option) => {
      const isActive = option.value === selected;
      return (
        <Pressable
          key={option.value}
          onPress={() => onSelect(option.value)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <XStack
            alignItems="center"
            gap={6}
            paddingHorizontal={12}
            paddingVertical={6}
            borderRadius={9999}
            borderWidth={1}
            borderColor={isActive ? 'transparent' : '$borderSubtle'}
            backgroundColor={isActive ? (option.surface ?? '$backgroundHover') : 'transparent'}
          >
            {option.color && <XStack width={8} height={8} borderRadius={4} backgroundColor={option.color} />}
            <Text fontSize={13} fontWeight={isActive ? '600' : '400'} color={isActive ? '$color' : '$colorMuted'}>
              {option.label}
            </Text>
          </XStack>
        </Pressable>
      );
    })}
  </ScrollView>
);

export type { FilterChipOption, FilterChipsProps };
export { FilterChips };
