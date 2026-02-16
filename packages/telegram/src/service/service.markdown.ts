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

    // 3. Links [text](url)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      return slot(
        `[${escapeV2(label)}](${url.replace(/([)\\])/g, '\\$1')})`,
      );
    });

    // 4. Bold + italic (***text***)
    out = out.replace(/\*{3}(.+?)\*{3}/g, (_m, c) => {
      return slot(`*_${escapeV2(c)}_*`);
    });

    // 5. Bold (**text**)
    out = out.replace(/\*{2}(.+?)\*{2}/g, (_m, c) => {
      return slot(`*${escapeV2(c)}*`);
    });

    // 6. Italic (*text*) — single asterisks not adjacent to other asterisks
    out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_m, c) => {
      return slot(`_${escapeV2(c)}_`);
    });

    // 7. Strikethrough (~~text~~)
    out = out.replace(/~~(.+?)~~/g, (_m, c) => {
      return slot(`~${escapeV2(c)}~`);
    });

    // 8. Headings → bold
    out = out.replace(/^#{1,6}\s+(.+)$/gm, (_m, c) => {
      return slot(`*${escapeV2(c)}*`);
    });

    // 9. Escape everything remaining
    out = escapeV2(out);

    // 10. Restore slots
    out = out.replace(/\x00(\d+)\x00/g, (_m, i) => {
      return slots[Number(i)] ?? '';
    });

    return out;
  } catch {
    return text;
  }
};

export { toTelegramMarkdown };
