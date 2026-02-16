import { describe, expect, it } from 'vitest';

import { toTelegramMarkdown } from './service.markdown.js';

describe('toTelegramMarkdown', () => {
  it('should escape special characters in plain text', () => {
    expect(toTelegramMarkdown('hello.world!')).toBe('hello\\.world\\!');
  });

  it('should convert **bold** to MarkdownV2 bold', () => {
    expect(toTelegramMarkdown('this is **bold** text')).toBe(
      'this is *bold* text',
    );
  });

  it('should convert *italic* to MarkdownV2 italic', () => {
    expect(toTelegramMarkdown('this is *italic* text')).toBe(
      'this is _italic_ text',
    );
  });

  it('should convert ***bold italic*** to MarkdownV2', () => {
    expect(toTelegramMarkdown('***both***')).toBe('*_both_*');
  });

  it('should convert ~~strikethrough~~ to MarkdownV2', () => {
    expect(toTelegramMarkdown('~~gone~~')).toBe('~gone~');
  });

  it('should preserve inline code without escaping content', () => {
    expect(toTelegramMarkdown('run `rm -rf /` now')).toBe(
      'run `rm -rf /` now',
    );
  });

  it('should preserve fenced code blocks', () => {
    const input = '```js\nconst x = 1;\n```';
    const result = toTelegramMarkdown(input);
    expect(result).toBe('```js\nconst x = 1;\n```');
  });

  it('should convert links', () => {
    expect(toTelegramMarkdown('[click](https://example.com)')).toBe(
      '[click](https://example.com)',
    );
  });

  it('should escape special chars inside link text', () => {
    expect(toTelegramMarkdown('[a.b](https://example.com)')).toBe(
      '[a\\.b](https://example.com)',
    );
  });

  it('should convert headings to bold', () => {
    expect(toTelegramMarkdown('# Hello World')).toBe('*Hello World*');
  });

  it('should handle a mixed message', () => {
    const input = '## Summary\n\nHere is **important** info.\n\n- item one\n- item two';
    const result = toTelegramMarkdown(input);
    expect(result).toContain('*Summary*');
    expect(result).toContain('*important*');
    expect(result).toContain('\\- item one');
  });

  it('should fall through to plain text on malformed input gracefully', () => {
    const result = toTelegramMarkdown('just plain text');
    expect(result).toBe('just plain text');
  });
});
