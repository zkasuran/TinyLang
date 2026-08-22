/**
 * TinyLang Lexer
 * 
 * Converts raw source code into a stream of tokens.
 * The lexer handles:
 * - Single and multi-line comments
 * - String literals with escape sequences
 * - Number literals (integers and floats)
 * - Operators (single and multi-character)
 * - Keywords and identifiers
 * - Meaningful newlines for statement separation
 * 
 * Educational error messages guide beginners when they make mistakes.
 */

import {
  Token,
  TokenType,
  KEYWORDS,
  SourcePosition,
  CommentToken,
  CommentKind,
} from '../types/tokens';
import { LexerError } from './errors';

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  /**
   * Comments seen during the last `tokenize()`, in source order.
   *
   * Kept out of `tokens` on purpose: adding them to the stream would change
   * what every existing caller of `tokenize()` sees. See getComments().
   */
  private comments: CommentToken[] = [];
  private current: number = 0;
  private line: number = 1;
  private column: number = 1;
  private start: number = 0;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the entire source and return a list of tokens
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.comments = [];
    this.current = 0;
    this.line = 1;
    this.column = 1;

    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      position: this.getPosition(),
      length: 0,
    });

    return this.tokens;
  }

  /**
   * The comments found by the most recent `tokenize()`, in source order.
   *
   * Comments used to be discarded as they were scanned, which is why
   * `tinylang fmt` deleted every one of them: the formatter renders from the
   * AST, the AST is built from the token stream, and by then the comments were
   * gone. They are retained here so the parser can attach them to the nodes
   * they belong to. `tokenize()` must be called first; the array is empty
   * otherwise.
   */
  getComments(): CommentToken[] {
    return this.comments;
  }

  private scanToken(): void {
    const char = this.advance();

    switch (char) {
      // Single character tokens
      case '(': this.addToken(TokenType.LPAREN); break;
      case ')': this.addToken(TokenType.RPAREN); break;
      case '{': this.addToken(TokenType.LBRACE); break;
      case '}': this.addToken(TokenType.RBRACE); break;
      case '[': this.addToken(TokenType.LBRACKET); break;
      case ']': this.addToken(TokenType.RBRACKET); break;
      case ',': this.addToken(TokenType.COMMA); break;
      case '.':
        if (!this.isAtEnd() && this.peek() === '.' && this.peekNext() === '.') {
          this.advance(); // second dot
          this.advance(); // third dot
          this.addToken(TokenType.SPREAD);
        } else {
          this.addToken(TokenType.DOT);
        }
        break;
      case ':': this.addToken(TokenType.COLON); break;
      case ';': this.addToken(TokenType.SEMICOLON); break;
      case '%': this.addToken(TokenType.PERCENT); break;
      case '?':
        // Disambiguate by lookahead: '?.' is optional chaining, '??' is nullish
        // coalescing, and a bare '?' opens a ternary. The bare token used to be
        // a lex error, which is why TernaryExpression was unreachable.
        if (this.match('.')) this.addToken(TokenType.QUESTION_DOT);
        else if (this.match('?')) this.addToken(TokenType.NULLISH_COALESCE);
        else this.addToken(TokenType.QUESTION);
        break;
      case '|':
        if (this.match('>')) this.addToken(TokenType.PIPE_ARROW);
        else this.addToken(TokenType.PIPE);
        break;

      // Multi-character operators
      case '+':
        if (this.match('=')) this.addToken(TokenType.PLUS_ASSIGN);
        else this.addToken(TokenType.PLUS);
        break;
      case '-':
        if (this.match('=')) this.addToken(TokenType.MINUS_ASSIGN);
        else this.addToken(TokenType.MINUS);
        break;
      case '*':
        if (this.match('*')) this.addToken(TokenType.POWER);
        else if (this.match('=')) this.addToken(TokenType.STAR_ASSIGN);
        else this.addToken(TokenType.STAR);
        break;
      case '/': {
        // Captured before the comment body is consumed: getPosition() derives
        // the column from `current - start`, which stops being the start of the
        // token once a comment has been scanned past.
        const commentStart = this.getPosition();
        if (this.match('/')) {
          // Single-line comment: consume to end of line, then record it.
          while (!this.isAtEnd() && this.peek() !== '\n') {
            this.advance();
          }
          this.addComment('line', commentStart);
        } else if (this.match('*')) {
          // Multi-line comment
          this.blockComment();
          this.addComment('block', commentStart);
        } else if (this.match('=')) {
          this.addToken(TokenType.SLASH_ASSIGN);
        } else {
          this.addToken(TokenType.SLASH);
        }
        break;
      }

      // Comparison & assignment operators
      case '=':
        if (this.match('=')) this.addToken(TokenType.EQUAL);
        else if (this.match('>')) this.addToken(TokenType.ARROW);
        else this.addToken(TokenType.ASSIGN);
        break;
      case '!':
        if (this.match('=')) this.addToken(TokenType.NOT_EQUAL);
        else {
          throw this.createError(
            `Unexpected character '!'`,
            `Use 'not' instead of '!' for logical negation in TinyLang`
          );
        }
        break;
      case '<':
        if (this.match('=')) this.addToken(TokenType.LESS_EQUAL);
        else this.addToken(TokenType.LESS);
        break;
      case '>':
        if (this.match('=')) this.addToken(TokenType.GREATER_EQUAL);
        else this.addToken(TokenType.GREATER);
        break;

      // Whitespace
      case ' ':
      case '\r':
      case '\t':
        // Skip whitespace
        break;
      case '\n':
        this.handleNewline();
        break;

      // String literals
      case '"':
      case "'":
        this.string(char);
        break;

      default:
        if (this.isDigit(char)) {
          this.number();
        } else if (this.isAlpha(char)) {
          // Check for f-string prefix: f"..." or f'...'
          if (char === 'f' && !this.isAtEnd() && (this.peek() === '"' || this.peek() === "'")) {
            const quote = this.advance();
            this.fstring(quote);
          } else {
            this.identifier();
          }
        } else {
          throw this.createError(
            `Unexpected character '${char}'`,
            `This character isn't recognized by TinyLang. Check for typos.`
          );
        }
    }
  }

  // ============ Token Scanning Methods ============

  private string(quote: string): void {
    let value = '';
    const startPos = this.getPosition();

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\n') {
        this.line++;
        this.column = 1;
      }
      
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case "'": value += "'"; break;
          case '"': value += '"'; break;
          case '0': value += '\0'; break;
          default:
            value += escaped;
        }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new LexerError(
        'Unterminated string literal',
        startPos,
        `Did you forget the closing ${quote} quote? Strings must end with the same quote they started with.`
      );
    }

    // Consume closing quote
    this.advance();
    this.addTokenWithValue(TokenType.STRING, value);
  }

  /**
   * Parse an f-string. The content between quotes is stored with {expr} markers.
   * The raw text (with {expr} sections intact) is stored as the token value.
   */
  private fstring(quote: string): void {
    let value = '';
    const startPos = this.getPosition();

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\n') {
        this.line++;
        this.column = 1;
      }

      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case "'": value += "'"; break;
          case '"': value += '"'; break;
          case '{': value += '\\{'; break;
          case '0': value += '\0'; break;
          default:
            value += escaped;
        }
      } else if (this.peek() === '{') {
        value += this.advance(); // consume '{'
        let depth = 1;
        while (!this.isAtEnd() && depth > 0) {
          const ch = this.peek();
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              value += this.advance(); // consume closing '}'
              break;
            }
          }
          if (ch === '\n') {
            this.line++;
            this.column = 1;
          }
          if (depth > 0) {
            value += this.advance();
          }
        }
        if (depth > 0) {
          throw new LexerError(
            'Unterminated interpolation expression in f-string',
            startPos,
            'Make sure every { has a matching } in your f-string'
          );
        }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new LexerError(
        'Unterminated f-string literal',
        startPos,
        `Did you forget the closing ${quote} quote?`
      );
    }

    // Consume closing quote
    this.advance();
    this.addTokenWithValue(TokenType.FSTRING, value);
  }

  private number(): void {
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      this.advance();
    }

    // Look for decimal part
    if (!this.isAtEnd() && this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // consume the '.'
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const value = this.source.slice(this.start, this.current);
    this.addTokenWithValue(TokenType.NUMBER, value);
  }

  private identifier(): void {
    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const value = this.source.slice(this.start, this.current);
    const type = KEYWORDS[value] || TokenType.IDENTIFIER;

    // Handle boolean and null keywords specially
    if (type === TokenType.TRUE || type === TokenType.FALSE) {
      this.addTokenWithValue(TokenType.BOOLEAN, value);
    } else if (type === TokenType.NULL_KEYWORD) {
      this.addTokenWithValue(TokenType.NULL, value);
    } else {
      this.addTokenWithValue(type, value);
    }
  }

  private blockComment(): void {
    let depth = 1;
    while (!this.isAtEnd() && depth > 0) {
      if (this.peek() === '/' && this.peekNext() === '*') {
        depth++;
        this.advance();
        this.advance();
      } else if (this.peek() === '*' && this.peekNext() === '/') {
        depth--;
        this.advance();
        this.advance();
      } else {
        if (this.peek() === '\n') {
          this.line++;
          this.column = 1;
        }
        this.advance();
      }
    }

    if (depth > 0) {
      throw this.createError(
        'Unterminated block comment',
        'Block comments start with /* and must end with */. Did you forget to close it?'
      );
    }
  }

  private handleNewline(): void {
    // Only add newline token if the previous token could end a statement
    if (this.tokens.length > 0) {
      const last = this.tokens[this.tokens.length - 1];
      const canEndStatement = [
        TokenType.IDENTIFIER,
        TokenType.NUMBER,
        TokenType.STRING,
        TokenType.FSTRING,
        TokenType.BOOLEAN,
        TokenType.NULL,
        TokenType.RPAREN,
        TokenType.RBRACKET,
        TokenType.RBRACE,
        TokenType.RETURN,
        TokenType.BREAK,
        TokenType.CONTINUE,
        TokenType.THIS,
      ].includes(last.type);

      if (canEndStatement) {
        this.addToken(TokenType.NEWLINE);
      }
    }
    this.line++;
    this.column = 1;
  }

  // ============ Helper Methods ============

  private advance(): string {
    const char = this.source[this.current];
    this.current++;
    this.column++;
    return char;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.current];
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return '\0';
    return this.source[this.current + 1];
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source[this.current] !== expected) return false;
    this.current++;
    this.column++;
    return true;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
           (char >= 'A' && char <= 'Z') ||
           char === '_';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private getPosition(): SourcePosition {
    return {
      line: this.line,
      column: this.column - (this.current - this.start),
      offset: this.start,
    };
  }

  private addToken(type: TokenType): void {
    const value = this.source.slice(this.start, this.current);
    this.tokens.push({
      type,
      value,
      position: this.getPosition(),
      length: this.current - this.start,
    });
  }

  /**
   * Record a comment that has just been consumed, spanning `start` to the
   * current scan position.
   */
  private addComment(kind: CommentKind, start: SourcePosition): void {
    this.comments.push({
      kind,
      text: this.source.slice(start.offset, this.current),
      start,
      end: { line: this.line, column: this.column, offset: this.current },
      ownLine: this.isFirstOnLine(start.offset),
    });
  }

  /**
   * Whether only whitespace precedes `offset` on its line.
   *
   * This is what separates a comment that documents the code below it from one
   * that annotates the code beside it, and the two are formatted differently.
   */
  private isFirstOnLine(offset: number): boolean {
    for (let i = offset - 1; i >= 0; i--) {
      const char = this.source[i];
      if (char === '\n') return true;
      if (char !== ' ' && char !== '\t' && char !== '\r') return false;
    }
    return true;
  }

  private addTokenWithValue(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      position: this.getPosition(),
      length: this.current - this.start,
    });
  }

  private createError(message: string, hint?: string): LexerError {
    return new LexerError(message, this.getPosition(), hint);
  }
}
