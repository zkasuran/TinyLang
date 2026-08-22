/**
 * Formatter error type.
 *
 * Raised when the formatter cannot produce output it can prove is equivalent to
 * its input. Formatting is the one tool in the toolchain that rewrites the
 * user's file in place, so "produce nothing and say why" is always preferable to
 * "produce something that might not mean the same thing".
 */
export class FormatterError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
    this.name = 'FormatterError';
  }
}
