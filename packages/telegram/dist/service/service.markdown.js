const SPECIAL_CHARS = /([_*[\]()~`>#+\-=|{}.!\\])/g;
const toTelegramMarkdown = (text) => {
    try {
        const codeBlocks = [];
        const inlineCode = [];
        // Extract fenced code blocks
        let processed = text.replace(/```([\s\S]*?)```/g, (_match, content) => {
            const index = codeBlocks.length;
            codeBlocks.push(`\`\`\`${content}\`\`\``);
            return `%%CODEBLOCK_${index}%%`;
        });
        // Extract inline code
        processed = processed.replace(/`([^`]+)`/g, (_match, content) => {
            const index = inlineCode.length;
            inlineCode.push(`\`${content}\``);
            return `%%INLINE_${index}%%`;
        });
        // Escape special characters in plain text
        processed = processed.replace(SPECIAL_CHARS, '\\$1');
        // Restore inline code
        processed = processed.replace(/%%INLINE_(\d+)%%/g, (_match, index) => {
            return inlineCode[Number(index)] ?? '';
        });
        // Restore code blocks
        processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (_match, index) => {
            return codeBlocks[Number(index)] ?? '';
        });
        return processed;
    }
    catch {
        return text;
    }
};
export { toTelegramMarkdown };
//# sourceMappingURL=service.markdown.js.map