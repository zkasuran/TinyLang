/**
 * Formatter Configuration
 */

export interface FormatOptions {
  /** Number of spaces per indentation level (default: 2) */
  indentSize: number;
  /** Maximum line width before breaking (default: 80) */
  maxLineWidth: number;
  /** Whether to insert a final newline at end of file (default: true) */
  insertFinalNewline: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  indentSize: 2,
  maxLineWidth: 80,
  insertFinalNewline: true,
};
