import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/types/tokens';
import { LexerError } from '../../src/lexer/errors';

describe('Lexer', () => {
  function tokenize(source: string) {
    return new Lexer(source).tokenize();
  }

  function tokenTypes(source: string): string[] {
    return tokenize(source).map(t => t.type);
  }

  function tokenValues(source: string): string[] {
    return tokenize(source).map(t => t.value);
  }

  describe('Number Literals', () => {
    it('should tokenize integers', () => {
      const tokens = tokenize('42');
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe('42');
    });

    it('should tokenize floats', () => {
      const tokens = tokenize('3.14');
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe('3.14');
    });

    it('should tokenize zero', () => {
      const tokens = tokenize('0');
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe('0');
    });

    it('should tokenize multiple numbers', () => {
      const types = tokenTypes('1 + 2');
      expect(types).toContain(TokenType.NUMBER);
    });
  });

  describe('String Literals', () => {
    it('should tokenize double-quoted strings', () => {
      const tokens = tokenize('"hello"');
      expect(tokens[0].type).toBe(TokenType.STRING);
      expect(tokens[0].value).toBe('hello');
    });

    it('should tokenize single-quoted strings', () => {
      const tokens = tokenize("'world'");
      expect(tokens[0].type).toBe(TokenType.STRING);
      expect(tokens[0].value).toBe('world');
    });

    it('should handle escape sequences', () => {
      const tokens = tokenize('"hello\\nworld"');
      expect(tokens[0].value).toBe('hello\nworld');
    });

    it('should handle tab escape', () => {
      const tokens = tokenize('"col1\\tcol2"');
      expect(tokens[0].value).toBe('col1\tcol2');
    });

    it('should handle escaped quotes', () => {
      const tokens = tokenize('"say \\"hi\\""');
      expect(tokens[0].value).toBe('say "hi"');
    });

    it('should throw on unterminated string', () => {
      expect(() => tokenize('"unterminated')).toThrow(LexerError);
    });
  });

  describe('Keywords', () => {
    it('should recognize all keywords', () => {
      const keywords = ['let', 'const', 'fn', 'return', 'if', 'else', 'while', 'for', 'in', 'break', 'continue', 'print', 'and', 'or', 'not', 'class', 'new', 'this', 'extends', 'match', 'when', 'import', 'from'];
      for (const kw of keywords) {
        const tokens = tokenize(kw);
        expect(tokens[0].type).not.toBe(TokenType.IDENTIFIER);
      }
    });

    it('should tokenize true and false as booleans', () => {
      expect(tokenize('true')[0].type).toBe(TokenType.BOOLEAN);
      expect(tokenize('false')[0].type).toBe(TokenType.BOOLEAN);
    });

    it('should tokenize null', () => {
      expect(tokenize('null')[0].type).toBe(TokenType.NULL);
    });

    it('should distinguish keywords from identifiers', () => {
      const tokens = tokenize('letter');
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    });
  });

  describe('Operators', () => {
    it('should tokenize arithmetic operators', () => {
      const types = tokenTypes('+ - * / % **');
      expect(types).toContain(TokenType.PLUS);
      expect(types).toContain(TokenType.MINUS);
      expect(types).toContain(TokenType.STAR);
      expect(types).toContain(TokenType.SLASH);
      expect(types).toContain(TokenType.PERCENT);
      expect(types).toContain(TokenType.POWER);
    });

    it('should tokenize comparison operators', () => {
      const types = tokenTypes('== != < > <= >=');
      expect(types).toContain(TokenType.EQUAL);
      expect(types).toContain(TokenType.NOT_EQUAL);
      expect(types).toContain(TokenType.LESS);
      expect(types).toContain(TokenType.GREATER);
      expect(types).toContain(TokenType.LESS_EQUAL);
      expect(types).toContain(TokenType.GREATER_EQUAL);
    });

    it('should tokenize assignment operators', () => {
      const types = tokenTypes('= += -= *= /=');
      expect(types).toContain(TokenType.ASSIGN);
      expect(types).toContain(TokenType.PLUS_ASSIGN);
      expect(types).toContain(TokenType.MINUS_ASSIGN);
      expect(types).toContain(TokenType.STAR_ASSIGN);
      expect(types).toContain(TokenType.SLASH_ASSIGN);
    });

    it('should tokenize arrow operator', () => {
      const tokens = tokenize('=>');
      expect(tokens[0].type).toBe(TokenType.ARROW);
    });
  });

  describe('Delimiters', () => {
    it('should tokenize all delimiters', () => {
      const types = tokenTypes('( ) { } [ ] , . : ;');
      expect(types).toContain(TokenType.LPAREN);
      expect(types).toContain(TokenType.RPAREN);
      expect(types).toContain(TokenType.LBRACE);
      expect(types).toContain(TokenType.RBRACE);
      expect(types).toContain(TokenType.LBRACKET);
      expect(types).toContain(TokenType.RBRACKET);
      expect(types).toContain(TokenType.COMMA);
      expect(types).toContain(TokenType.DOT);
      expect(types).toContain(TokenType.COLON);
      expect(types).toContain(TokenType.SEMICOLON);
    });
  });

  describe('Comments', () => {
    it('should skip single-line comments', () => {
      const tokens = tokenize('42 // this is a comment\n10');
      expect(tokens.filter(t => t.type === TokenType.NUMBER)).toHaveLength(2);
    });

    it('should skip block comments', () => {
      const tokens = tokenize('42 /* block comment */ 10');
      expect(tokens.filter(t => t.type === TokenType.NUMBER)).toHaveLength(2);
    });

    it('should handle nested block comments', () => {
      const tokens = tokenize('42 /* outer /* inner */ still comment */ 10');
      expect(tokens.filter(t => t.type === TokenType.NUMBER)).toHaveLength(2);
    });
  });

  describe('Newlines', () => {
    it('should insert NEWLINE tokens after statement-ending tokens', () => {
      const types = tokenTypes('x\ny');
      expect(types).toContain(TokenType.NEWLINE);
    });

    it('should not insert NEWLINE after operators', () => {
      const types = tokenTypes('x +\ny');
      expect(types.filter(t => t === TokenType.NEWLINE)).toHaveLength(0);
    });
  });

  describe('Position Tracking', () => {
    it('should track line and column', () => {
      const tokens = tokenize('let x = 5');
      expect(tokens[0].position.line).toBe(1);
      expect(tokens[0].position.column).toBe(1);
    });

    it('should track position across lines', () => {
      const tokens = tokenize('x\ny');
      const yToken = tokens.find(t => t.value === 'y');
      expect(yToken?.position.line).toBe(2);
    });
  });

  describe('Error Messages', () => {
    it('should provide friendly error for unexpected characters', () => {
      expect(() => tokenize('@')).toThrow(/Unexpected character/);
    });

    it('should suggest not to use ! for negation', () => {
      expect(() => tokenize('!true')).toThrow(/Unexpected character/);
    });
  });

  describe('Complex Tokenization', () => {
    it('should tokenize a complete program', () => {
      const source = `
        fn add(a, b) {
          return a + b
        }
        let result = add(3, 4)
        print(result)
      `;
      const tokens = tokenize(source);
      expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
      expect(tokens.length).toBeGreaterThan(10);
    });
  });

  describe("'?' disambiguation", () => {
    it('lexes a bare ? as QUESTION', () => {
      // This used to be a lex error, which is why the ternary was unreachable.
      expect(tokenTypes('a ? b : c')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.QUESTION,
        TokenType.IDENTIFIER,
        TokenType.COLON,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('still lexes ?? as NULLISH_COALESCE', () => {
      expect(tokenTypes('a ?? b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.NULLISH_COALESCE,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('still lexes ?. as QUESTION_DOT', () => {
      expect(tokenTypes('a?.b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.QUESTION_DOT,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('lexes a ternary whose condition uses ?. and ??', () => {
      expect(tokenTypes('a?.b ?? c ? d : e')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.QUESTION_DOT,
        TokenType.IDENTIFIER,
        TokenType.NULLISH_COALESCE,
        TokenType.IDENTIFIER,
        TokenType.QUESTION,
        TokenType.IDENTIFIER,
        TokenType.COLON,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });
  });
});
