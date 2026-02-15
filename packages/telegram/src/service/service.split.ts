const DEFAULT_MAX_LENGTH = 4096;

const countOpenCodeBlocks = (text: string): string | null => {
  const matches = text.match(/```(\w*)/g);
  if (!matches) return null;
  const closes = text.match(/```(?!\w)/g);
  const openCount = matches.length - (closes ? closes.length : 0);
  if (openCount > 0) {
    const lastOpen = matches[matches.length - 1] ?? '';
    return lastOpen.slice(3);
  }
  return null;
};

const splitMessage = (text: string, maxLength: number = DEFAULT_MAX_LENGTH): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  let openLang: string | null = null;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(openLang !== null ? `\`\`\`${openLang}\n${remaining}` : remaining);
      break;
    }

    const prefix = openLang !== null ? `\`\`\`${openLang}\n` : '';
    const available = maxLength - prefix.length;
    const window = remaining.slice(0, available);

    // Try paragraph boundary
    let splitIndex = window.lastIndexOf('\n\n');
    // Try line boundary
    if (splitIndex === -1 || splitIndex < available * 0.3) {
      const lineIndex = window.lastIndexOf('\n');
      if (lineIndex > available * 0.3) {
        splitIndex = lineIndex;
      }
    }
    // Hard split as last resort
    if (splitIndex === -1 || splitIndex < available * 0.3) {
      splitIndex = available;
    }

    const chunk = prefix + remaining.slice(0, splitIndex);
    const lang = countOpenCodeBlocks(chunk);

    if (lang !== null) {
      chunks.push(chunk + '\n```');
      openLang = lang;
    } else {
      chunks.push(chunk);
      openLang = null;
    }

    remaining = remaining.slice(splitIndex).replace(/^\n+/, '');
  }

  return chunks;
};

export { splitMessage };
