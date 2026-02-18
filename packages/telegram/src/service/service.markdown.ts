const SPECIAL_CHARS = /([_*[\]()~`>#+\-=|{}.!\\])/g;

const escapeV2 = (text: string): string => {
  return text.replace(SPECIAL_CHARS, '\\$1');
};

const toTelegramMarkdown = (text: string): string => {
  try {
    const slots: string[] = [];
    const slot = (content: string): string => {
      const i = slots.length;
      slots.push(content);
      return `\x00${i}\x00`;
    };

    let out = text;

    // 1. Protect fenced code blocks
    out = out.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, body) => {
      return slot(`\`\`\`${lang}\n${body}\`\`\``);
    });

    // 2. Protect inline code
    out = out.replace(/`([^`]+)`/g, (_m, body) => {
      return slot(`\`${body}\``);
    });

    // 3. Normalize * list markers to • (prevents italic regex from matching across list items)
    out = out.replace(/^(\s*)\*(\s)/gm, '$1•$2');

    // 4. Links [text](url)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      return slot(`[${escapeV2(label)}](${url.replace(/([)\\])/g, '\\$1')})`);
    });

    // 5. Bold + italic (***text***)
    out = out.replace(/\*{3}(.+?)\*{3}/g, (_m, c) => {
      return slot(`*_${escapeV2(c)}_*`);
    });

    // 6. Bold (**text**)
    out = out.replace(/\*{2}(.+?)\*{2}/g, (_m, c) => {
      return slot(`*${escapeV2(c)}*`);
    });

    // 7. Italic (*text*) — single asterisks not adjacent to other asterisks, content must not start/end with space
    out = out.replace(/(?<!\*)\*([^*\s][^*]*[^*\s]|[^*\s])\*(?!\*)/g, (_m, c) => {
      return slot(`_${escapeV2(c)}_`);
    });

    // 8. Strikethrough (~~text~~)
    out = out.replace(/~~(.+?)~~/g, (_m, c) => {
      return slot(`~${escapeV2(c)}~`);
    });

    // 9. Headings → bold
    out = out.replace(/^#{1,6}\s+(.+)$/gm, (_m, c) => {
      return slot(`*${escapeV2(c)}*`);
    });

    // 10. Escape everything remaining
    out = escapeV2(out);

    // 11. Restore blockquote markers at line starts
    out = out.replace(/^\\>/gm, '>');

    // 12. Restore slots
    // eslint-disable-next-line no-control-regex
    out = out.replace(/\x00(\d+)\x00/g, (_m, i) => {
      return slots[Number(i)] ?? '';
    });

    return out;
  } catch {
    return text;
  }
};

const stripMarkdown = (text: string): string => {
  let out = text;
  out = out.replace(/```\w*\n?/g, '');
  out = out.replace(/\*{3}([^*]+)\*{3}/g, '$1');
  out = out.replace(/\*{2}([^*]+)\*{2}/g, '$1');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  out = out.replace(/~~([^~]+)~~/g, '$1');
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  out = out.replace(/^>\s?/gm, '');
  return out;
};

export { toTelegramMarkdown, stripMarkdown };
