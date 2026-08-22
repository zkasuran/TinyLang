import { SourcePosition, Token } from '../types/tokens';

/**
 * ParseError provides educational error messages during parsing.
 * Multiple parse errors can be collected during a single parse pass.
 */
export class ParseError extends Error {
  public position: SourcePosition;
  public hint: string;

  constructor(message: string, position: SourcePosition, hint?: string) {
    const formattedMessage = `Parse Error at line ${position.line}, column ${position.column}: ${message}`;
    super(formattedMessage);
    this.name = 'ParseError';
    this.position = position;
    this.hint = hint || '';
  }

  /**
   * Format the error with source context for display
   */
  formatWithSource(source: string): string {
    const lines = source.split('\n');
    const errorLine = lines[this.position.line - 1] || '';
    const pointer = ' '.repeat(Math.max(0, this.position.column - 1)) + '^';

    let output = `\n❌ ${this.message}\n\n`;
    output += `  ${this.position.line} | ${errorLine}\n`;
    output += `    | ${pointer}\n`;

    if (this.hint) {
      output += `\n💡 Hint: ${this.hint}\n`;
    }

    return output;
  }

  /**
   * Create a ParseError from a token with a helpful message
   */
  static fromToken(token: Token, message: string, hint?: string): ParseError {
    return new ParseError(message, token.position, hint);
  }

  /**
   * Create an "unexpected token" error with suggestions
   */
  static unexpected(token: Token, expected?: string): ParseError {
    const msg = expected
      ? `Unexpected '${token.value}', expected ${expected}`
      : `Unexpected '${token.value}'`;
    const hint = expected
      ? `Try replacing '${token.value}' with ${expected}`
      : `This token doesn't belong here. Check for missing operators or punctuation.`;
    return new ParseError(msg, token.position, hint);
  }
}
