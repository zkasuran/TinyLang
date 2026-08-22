/**
 * Lexer comment retention.
 *
 * Comments used to be scanned and thrown away, which is the root of why
 * `tinylang fmt` deleted every one of them: nothing downstream could keep what
 * the lexer never handed on. They are now collected next to the token stream -
 * next to, not in it, because every existing consumer of tokenize() is written
 * against a stream that has never contained comments.
 */

import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer';
import { TokenType } from '../../src/types/tokens';

function lex(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return { tokens, comments: lexer.getComments() };
}

describe('Lexer comment retention', () => {
  it('keeps comments out of the token stream', () => {
    const { tokens } = lex('// note\nlet x = 1 /* mid */ + 2\n');
    const significant = tokens.filter((t) => t.type !== TokenType.NEWLINE);
    expect(significant.map((t) => t.value)).toEqual(['let', 'x', '=', '1', '+', '2', '']);
    expect(tokens.some((t) => t.value.includes('//') || t.value.includes('/*'))).toBe(false);
  });

  it('reports no comments for a file with none', () => {
    expect(lex('let x = 1\n').comments).toEqual([]);
  });

  it('records a line comment with its text, kind and span', () => {
    const { comments } = lex('// note\nlet x = 1\n');
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe('line');
    expect(comments[0].text).toBe('// note');
    expect(comments[0].start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(comments[0].end.line).toBe(1);
    expect(comments[0].end.offset).toBe(7);
  });

  it('records a block comment verbatim, including its newlines', () => {
    const { comments } = lex('/* one\n   two */\nlet x = 1\n');
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe('block');
    expect(comments[0].text).toBe('/* one\n   two */');
    expect(comments[0].start.line).toBe(1);
    expect(comments[0].end.line).toBe(2);
  });

  it('still supports nested block comments, as one comment', () => {
    const { comments } = lex('/* outer /* inner */ still outer */\nlet x = 1\n');
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('/* outer /* inner */ still outer */');
  });

  it('still rejects an unterminated block comment', () => {
    expect(() => lex('/* never closed\nlet x = 1\n')).toThrow(/Unterminated block comment/);
  });

  it('marks a comment that has its own line', () => {
    const { comments } = lex('  // indented but alone\nlet x = 1\n');
    expect(comments[0].ownLine).toBe(true);
  });

  it('marks a comment that follows code on its line', () => {
    const { comments } = lex('let x = 1 // beside the code\n');
    expect(comments[0].ownLine).toBe(false);
  });

  it('marks the first comment on the first line as its own', () => {
    expect(lex('// very first thing\nlet x = 1\n').comments[0].ownLine).toBe(true);
  });

  it('keeps every comment, in source order', () => {
    const { comments } = lex(
      ['// one', 'let x = 1 // two', '/* three */', 'let y = 2 /* four */ + 1'].join('\n')
    );
    expect(comments.map((c) => c.text)).toEqual([
      '// one',
      '// two',
      '/* three */',
      '/* four */',
    ]);
    expect(comments.map((c) => c.ownLine)).toEqual([true, false, true, false]);
  });

  it('does not confuse division or comment-like text in strings', () => {
    const { comments } = lex('let x = 6 / 2\nlet s = "// not a comment"\nlet t = "/* nor this */"\n');
    expect(comments).toEqual([]);
  });

  it('starts each tokenize() with a clean list', () => {
    const lexer = new Lexer('// only once\nlet x = 1\n');
    lexer.tokenize();
    lexer.tokenize();
    expect(lexer.getComments().map((c) => c.text)).toEqual(['// only once']);
  });
});
