import { SourcePosition } from '../types/tokens';

/**
 * LexerError provides friendly, educational error messages
 * to help beginners understand what went wrong with their code.
 */
export class LexerError extends Error {
  public position: SourcePosition;
  public hint: string;

  constructor(message: string, position: SourcePosition, hint?: string) {
    const formattedMessage = `Syntax Error at line ${position.line}, column ${position.column}: ${message}`;
    super(formattedMessage);
    this.name = 'LexerError';
    this.position = position;
    this.hint = hint || '';
  }

  /**
   * Format the error with source context for display
   */
  formatWithSource(source: string): string {
    const lines = source.split('\n');
    const errorLine = lines[this.position.line - 1] || '';
    const pointer = ' '.repeat(this.position.column - 1) + '^';
    
    let output = `\n❌ ${this.message}\n\n`;
    output += `  ${this.position.line} | ${errorLine}\n`;
    output += `    | ${pointer}\n`;
    
    if (this.hint) {
      output += `\n💡 Hint: ${this.hint}\n`;
    }
    
    return output;
  }
}
