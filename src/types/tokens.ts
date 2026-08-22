/**
 * TinyLang Token Types
 * 
 * Defines all token types recognized by the TinyLang lexer.
 * Tokens are the fundamental building blocks produced during lexical analysis.
 */

export enum TokenType {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  FSTRING = 'FSTRING',
  BOOLEAN = 'BOOLEAN',
  NULL = 'NULL',

  // Identifiers & Keywords
  IDENTIFIER = 'IDENTIFIER',
  LET = 'LET',
  CONST = 'CONST',
  FN = 'FN',
  RETURN = 'RETURN',
  IF = 'IF',
  ELSE = 'ELSE',
  WHILE = 'WHILE',
  FOR = 'FOR',
  IN = 'IN',
  BREAK = 'BREAK',
  CONTINUE = 'CONTINUE',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NULL_KEYWORD = 'NULL_KEYWORD',
  PRINT = 'PRINT',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  IMPORT = 'IMPORT',
  FROM = 'FROM',
  CLASS = 'CLASS',
  NEW = 'NEW',
  THIS = 'THIS',
  EXTENDS = 'EXTENDS',
  MATCH = 'MATCH',
  WHEN = 'WHEN',
  TEST = 'TEST',
  TRY = 'TRY',
  CATCH = 'CATCH',
  THROW = 'THROW',
  ENUM = 'ENUM',

  // Operators
  PLUS = 'PLUS',             // +
  MINUS = 'MINUS',           // -
  STAR = 'STAR',             // *
  SLASH = 'SLASH',           // /
  PERCENT = 'PERCENT',       // %
  POWER = 'POWER',           // **
  ASSIGN = 'ASSIGN',         // =
  PLUS_ASSIGN = 'PLUS_ASSIGN',   // +=
  MINUS_ASSIGN = 'MINUS_ASSIGN', // -=
  STAR_ASSIGN = 'STAR_ASSIGN',   // *=
  SLASH_ASSIGN = 'SLASH_ASSIGN', // /=

  // Comparison
  EQUAL = 'EQUAL',           // ==
  NOT_EQUAL = 'NOT_EQUAL',   // !=
  LESS = 'LESS',             // <
  LESS_EQUAL = 'LESS_EQUAL', // <=
  GREATER = 'GREATER',       // >
  GREATER_EQUAL = 'GREATER_EQUAL', // >=

  // Delimiters
  LPAREN = 'LPAREN',         // (
  RPAREN = 'RPAREN',         // )
  LBRACE = 'LBRACE',         // {
  RBRACE = 'RBRACE',         // }
  LBRACKET = 'LBRACKET',     // [
  RBRACKET = 'RBRACKET',     // ]
  COMMA = 'COMMA',           // ,
  DOT = 'DOT',               // .
  COLON = 'COLON',           // :
  SEMICOLON = 'SEMICOLON',   // ;
  ARROW = 'ARROW',           // =>
  PIPE = 'PIPE',             // |
  PIPE_ARROW = 'PIPE_ARROW', // |>
  SPREAD = 'SPREAD',         // ...
  QUESTION = 'QUESTION',                 // ?  (ternary)
  QUESTION_DOT = 'QUESTION_DOT',         // ?.
  NULLISH_COALESCE = 'NULLISH_COALESCE', // ??

  // Special
  EOF = 'EOF',
  NEWLINE = 'NEWLINE',
}

export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface Token {
  type: TokenType;
  value: string;
  position: SourcePosition;
  length: number;
}

/** A `//` comment running to end of line, or a delimited block (which may nest). */
export type CommentKind = 'line' | 'block';

/**
 * A comment retained by the lexer.
 *
 * Comments are not tokens: they never enter the token stream, because every
 * consumer of `tokenize()` - parser, linter, debugger, module loader - is
 * written against a stream in which they do not appear. They are collected
 * alongside it instead, and read back with `Lexer.getComments()`.
 *
 * The formatter needs all four fields: the verbatim `text` so a block comment's
 * internal layout survives, `start`/`end` to work out which construct a comment
 * belongs to and whether a blank line preceded it, and `ownLine` to tell a
 * comment that occupies its own line from one that trails code.
 */
export interface CommentToken {
  kind: CommentKind;
  /** Verbatim source text, including the `//` or `/*` delimiters. */
  text: string;
  /** Position of the first delimiter character. */
  start: SourcePosition;
  /**
   * Position just past the comment. `offset` is exclusive; `line` is the line
   * the comment ends on, which differs from `start.line` for block comments.
   */
  end: SourcePosition;
  /** True when only whitespace precedes the comment on its line. */
  ownLine: boolean;
}

/**
 * Maps keyword strings to their token types
 */
export const KEYWORDS: Record<string, TokenType> = {
  'let': TokenType.LET,
  'const': TokenType.CONST,
  'fn': TokenType.FN,
  'return': TokenType.RETURN,
  'if': TokenType.IF,
  'else': TokenType.ELSE,
  'while': TokenType.WHILE,
  'for': TokenType.FOR,
  'in': TokenType.IN,
  'break': TokenType.BREAK,
  'continue': TokenType.CONTINUE,
  'true': TokenType.TRUE,
  'false': TokenType.FALSE,
  'null': TokenType.NULL_KEYWORD,
  'print': TokenType.PRINT,
  'and': TokenType.AND,
  'or': TokenType.OR,
  'not': TokenType.NOT,
  'import': TokenType.IMPORT,
  'from': TokenType.FROM,
  'class': TokenType.CLASS,
  'new': TokenType.NEW,
  'this': TokenType.THIS,
  'extends': TokenType.EXTENDS,
  'match': TokenType.MATCH,
  'when': TokenType.WHEN,
  'test': TokenType.TEST,
  'try': TokenType.TRY,
  'catch': TokenType.CATCH,
  'throw': TokenType.THROW,
  'enum': TokenType.ENUM,
};
