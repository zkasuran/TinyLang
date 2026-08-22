/**
 * The formatter's comment safety net.
 *
 * The AST round-trip check in ./equivalence.ts cannot see comment loss:
 * comments are not in the AST, so a formatter that deleted every one of them -
 * which is exactly what this one did - passes that check with nothing to say.
 * This module supplies the missing half. Formatting is verified by comparing the
 * *sequence of comment texts* in the input with the sequence in the output; if
 * one is missing, added or altered the formatter refuses to return the result.
 *
 * Two details are worth spelling out.
 *
 * Comments inside an f-string interpolation are included. A comment written
 * between the braces of an f-string sits in a place the lexer stores as string
 * data, and the formatter re-renders interpolations from the AST, so without
 * looking inside them a comment written there would be dropped with nothing
 * noticing.
 *
 * The indentation of a block comment's continuation lines is normalised away
 * before comparing. Re-indenting those lines is the one change to comment text
 * the formatter is allowed to make - a comment nested two levels deep has to
 * move with its statement - and the amount of the common indent is not
 * information about the comment. Everything else, including the *relative*
 * indentation between continuation lines, is compared exactly.
 */

import { Lexer } from '../lexer';
import { TokenType } from '../types/tokens';
import { splitInterpolatedString } from '../parser/fstring';

/**
 * Every comment in `source`, in source order, including those written inside
 * f-string interpolations.
 */
export function commentTexts(source: string): string[] {
  const texts: string[] = [];
  collect(source, texts);
  return texts;
}

/**
 * Whether `source` contains a comment written inside an f-string interpolation.
 *
 * This is the one place a comment cannot be put back: the formatter re-renders
 * `f"{...}"` from the AST of the expression inside it, and that AST has no room
 * for a comment. Knowing it in advance lets the refusal say what to do about it
 * instead of reporting an internal error the user cannot act on.
 */
export function hasInterpolatedComment(source: string): boolean {
  const all: string[] = [];
  collect(source, all);
  if (all.length === 0) return false;

  const outer = new Lexer(source);
  outer.tokenize();
  return outer.getComments().length !== all.length;
}

function collect(source: string, out: string[]): void {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const comments = lexer.getComments();
  let next = 0;

  for (const token of tokens) {
    // Comments that precede this token, so that a comment written before an
    // f-string is reported before the ones written inside it.
    while (next < comments.length && comments[next].start.offset < token.position.offset) {
      out.push(comments[next++].text);
    }
    if (token.type === TokenType.FSTRING) {
      for (const part of splitInterpolatedString(token.value)) {
        if (part.kind === 'expression') collect(part.source, out);
      }
    }
  }

  while (next < comments.length) {
    out.push(comments[next++].text);
  }
}

/**
 * Normalise a comment for comparison: trailing whitespace per line, and the
 * common indentation of a block comment's continuation lines, both of which the
 * formatter is entitled to change.
 */
export function normalizeCommentText(text: string): string {
  const lines = text.split('\n').map((line) => line.replace(/[ \t]+$/, ''));
  if (lines.length === 1) return lines[0];

  const continuations = lines.slice(1);
  const common = commonIndent(continuations);
  return [lines[0], ...continuations.map((line) => line.slice(common))].join('\n');
}

/** Length of the whitespace prefix shared by every non-blank line. */
export function commonIndent(lines: string[]): number {
  let common: number | null = null;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const width = line.length - line.trimStart().length;
    common = common === null ? width : Math.min(common, width);
  }
  return common ?? 0;
}

/**
 * Describe the first difference between two comment sequences, or null when they
 * hold the same comments in the same order.
 *
 * The message names the comment at fault, because "a comment was lost" is not
 * something a user can act on and "the comment `// handle the empty case` was
 * lost" is.
 */
export function commentDifference(
  before: readonly string[],
  after: readonly string[]
): string | null {
  const count = Math.max(before.length, after.length);
  for (let i = 0; i < count; i++) {
    const expected = before[i];
    const actual = after[i];
    if (expected === undefined) {
      return `a comment that was not in the input appeared in the output: ${quote(actual)}`;
    }
    if (actual === undefined) {
      return `comment ${i + 1} of ${before.length} was lost: ${quote(expected)}`;
    }
    if (normalizeCommentText(expected) !== normalizeCommentText(actual)) {
      return (
        `comment ${i + 1} of ${before.length} changed\n` +
        `  before: ${quote(expected)}\n` +
        `  after:  ${quote(actual)}`
      );
    }
  }
  return null;
}

function quote(text: string): string {
  const oneLine = text.replace(/\n/g, '\\n');
  return oneLine.length > 120 ? `"${oneLine.slice(0, 120)}…"` : `"${oneLine}"`;
}
