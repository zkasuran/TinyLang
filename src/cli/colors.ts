/**
 * TinyLang CLI Colors Utility
 *
 * Helpers for colorized, formatted terminal output.
 * Respects NO_COLOR environment variable and non-TTY output.
 */

const isColorSupported = process.stdout.isTTY && !process.env['NO_COLOR'];

function wrap(code: string, resetCode: string): (text: string) => string {
  if (!isColorSupported) return (text: string) => text;
  return (text: string) => `${code}${text}${resetCode}`;
}

export const red = wrap('\x1b[31m', '\x1b[0m');
export const green = wrap('\x1b[32m', '\x1b[0m');
export const yellow = wrap('\x1b[33m', '\x1b[0m');
export const blue = wrap('\x1b[34m', '\x1b[0m');
export const cyan = wrap('\x1b[36m', '\x1b[0m');
export const gray = wrap('\x1b[90m', '\x1b[0m');
export const bold = wrap('\x1b[1m', '\x1b[22m');
export const dim = wrap('\x1b[2m', '\x1b[22m');

/**
 * Show a spinner-like prefix for non-TTY or simple prefix text.
 */
export function spinner(text: string): string {
  return `${isColorSupported ? '\u25CF' : '*'} ${text}`;
}

/**
 * Format data as an aligned table.
 */
export function table(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows];
  const colWidths: number[] = headers.map((_, i) =>
    Math.max(...allRows.map(row => (row[i] || '').length))
  );

  const lines: string[] = [];
  // Header
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  lines.push(bold(headerLine));
  lines.push(gray('-'.repeat(headerLine.length)));

  // Rows
  for (const row of rows) {
    lines.push(row.map((cell, i) => cell.padEnd(colWidths[i])).join('  '));
  }

  return lines.join('\n');
}

/**
 * Draw a box around content with border characters.
 */
export function box(title: string, content: string): string {
  const lines = content.split('\n');
  const maxWidth = Math.max(title.length + 2, ...lines.map(l => l.length));
  const width = maxWidth + 2;

  const top = `\u250C${'─'.repeat(width)}\u2510`;
  const titleLine = `\u2502 ${bold(title)}${' '.repeat(width - title.length - 1)}\u2502`;
  const separator = `\u251C${'─'.repeat(width)}\u2524`;
  const bottom = `\u2514${'─'.repeat(width)}\u2518`;

  const bodyLines = lines.map(l => `\u2502 ${l}${' '.repeat(width - l.length - 1)}\u2502`);

  return [top, titleLine, separator, ...bodyLines, bottom].join('\n');
}
