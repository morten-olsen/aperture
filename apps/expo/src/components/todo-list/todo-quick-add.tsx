import { useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { XStack, useThemeName } from 'tamagui';
import { Plus } from '@tamagui/lucide-icons';

import { GlassView } from '../glass/glass-view.tsx';

type TodoQuickAddProps = {
  onAdd: (title: string) => void;
  isAdding?: boolean;
};

const TodoQuickAdd = ({ onAdd, isAdding = false }: TodoQuickAddProps) => {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const themeName = useThemeName();
  const isDark = themeName === 'dark';

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <GlassView intensity="strong" borderRadius={9999} padding={0} style={{ marginHorizontal: 16 }}>
      <XStack alignItems="center" paddingHorizontal={16} paddingVertical={10} gap={10}>
        <Plus size={20} color="$accent" opacity={isAdding ? 0.5 : 1} />
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="New task..."
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
          editable={!isAdding}
          style={{
            flex: 1,
            fontSize: 16,
            color: isDark ? '#fff' : '#000',
            padding: 0,
          }}
        />
      </XStack>
    </GlassView>
  );
};

export type { TodoQuickAddProps };
export { TodoQuickAdd };
