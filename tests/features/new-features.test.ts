/**
 * Tests for new language features:
 * - String interpolation (f-strings)
 * - Try/catch error handling
 * - Throw statement
 * - Spread operator in arrays
 * - "Did you mean?" suggestions
 * - AST and profile CLI commands
 */

import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import { Interpreter } from '../../src/interpreter';
import { TokenType } from '../../src/types/tokens';
import { TinyLang } from '../../src/tinylang';

function run(source: string): { output: string[]; error?: string } {
  const output: string[] = [];
  const tinylang = new TinyLang({ output: (msg) => output.push(msg) });
  const result = tinylang.run(source);
  return { output, error: result.error?.message };
}

// ============ String Interpolation (f-strings) ============

describe('String Interpolation (f-strings)', () => {
  it('should interpolate simple identifiers', () => {
    const { output } = run(`
      let name = "World"
      print(f"Hello {name}!")
    `);
    expect(output).toEqual(['Hello World!']);
  });

  it('should interpolate expressions', () => {
    const { output } = run(`
      let x = 5
      let y = 3
      print(f"Sum: {x + y}")
    `);
    expect(output).toEqual(['Sum: 8']);
  });

  it('should handle multiple interpolations', () => {
    const { output } = run(`
      let name = "Alice"
      let age = 30
      print(f"{name} is {age} years old")
    `);
    expect(output).toEqual(['Alice is 30 years old']);
  });

  it('should handle nested expressions', () => {
    const { output } = run(`
      let items = [1, 2, 3]
      print(f"Length: {items.length}")
    `);
    expect(output).toEqual(['Length: 3']);
  });

  it('should handle f-string with no interpolation', () => {
    const { output } = run(`
      print(f"plain text")
    `);
    expect(output).toEqual(['plain text']);
  });

  it('should handle empty interpolation expressions with function calls', () => {
    const { output } = run(`
      fn greet(name) { return "Hi " + name }
      print(f"{greet("Bob")}")
    `);
    expect(output).toEqual(['Hi Bob']);
  });

  it('should handle f-strings in variable assignments', () => {
    const { output } = run(`
      let x = 42
      let msg = f"The answer is {x}"
      print(msg)
    `);
    expect(output).toEqual(['The answer is 42']);
  });

  it('should handle booleans and null in interpolation', () => {
    const { output } = run(`
      let flag = true
      let nothing = null
      print(f"flag={flag}, nothing={nothing}")
    `);
    expect(output).toEqual(['flag=true, nothing=null']);
  });

  it('should tokenize f-strings as FSTRING type', () => {
    const lexer = new Lexer('f"hello {x}"');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.FSTRING);
    expect(tokens[0].value).toBe('hello {x}');
  });
});

// ============ Try/Catch Error Handling ============

describe('Try/Catch Error Handling', () => {
  it('should catch runtime errors', () => {
    const { output } = run(`
      try {
        let x = 1 / 0
      } catch err {
        print(err.message)
      }
    `);
    expect(output[0]).toContain('Division by zero');
  });

  it('should not execute catch block when no error', () => {
    const { output } = run(`
      try {
        print("success")
      } catch err {
        print("error")
      }
    `);
    expect(output).toEqual(['success']);
  });

  it('should provide error object with message property', () => {
    const { output } = run(`
      try {
        let arr = [1, 2, 3]
        let x = arr[10]
      } catch err {
        print(err.message)
      }
    `);
    expect(output[0]).toContain('out of bounds');
  });

  it('should handle nested try/catch', () => {
    const { output } = run(`
      try {
        try {
          let x = 1 / 0
        } catch inner {
          print(f"Inner: {inner.message}")
          let y = undefined_var
        }
      } catch outer {
        print("Outer caught")
      }
    `);
    expect(output[0]).toContain('Inner:');
    expect(output[1]).toBe('Outer caught');
  });

  it('should handle throw statement with string', () => {
    const { output } = run(`
      try {
        throw "Something went wrong"
      } catch err {
        print(err.message)
      }
    `);
    expect(output).toEqual(['Something went wrong']);
  });

  it('should handle throw with object', () => {
    const { output } = run(`
      try {
        throw {message: "custom error", code: 42}
      } catch err {
        print(err.message)
      }
    `);
    expect(output).toEqual(['custom error']);
  });

  it('should propagate uncaught errors', () => {
    const { error } = run(`
      try {
        print("ok")
      } catch err {
        print(err.message)
      }
      let x = 1 / 0
    `);
    expect(error).toContain('Division by zero');
  });

  it('should scope catch variable to catch block', () => {
    const { output } = run(`
      try {
        throw "test error"
      } catch err {
        print(err.message)
      }
      print("after catch")
    `);
    expect(output).toEqual(['test error', 'after catch']);
  });
});

// ============ Spread Operator ============

describe('Spread Operator in Arrays', () => {
  it('should spread an array into another array', () => {
    const { output } = run(`
      let arr1 = [1, 2, 3]
      let arr2 = [4, 5, 6]
      let combined = [...arr1, ...arr2]
      print(combined)
    `);
    expect(output).toEqual(['[1, 2, 3, 4, 5, 6]']);
  });

  it('should spread with other elements', () => {
    const { output } = run(`
      let arr = [2, 3]
      let result = [1, ...arr, 4]
      print(result)
    `);
    expect(output).toEqual(['[1, 2, 3, 4]']);
  });

  it('should spread strings into characters', () => {
    const { output } = run(`
      let chars = [..."abc"]
      print(chars)
    `);
    expect(output).toEqual(['[a, b, c]']);
  });

  it('should handle empty spread', () => {
    const { output } = run(`
      let empty = []
      let result = [1, ...empty, 2]
      print(result)
    `);
    expect(output).toEqual(['[1, 2]']);
  });

  it('should spread multiple arrays', () => {
    const { output } = run(`
      let a = [1]
      let b = [2]
      let c = [3]
      let result = [...a, ...b, ...c]
      print(result)
    `);
    expect(output).toEqual(['[1, 2, 3]']);
  });
});

// ============ "Did you mean?" Suggestions ============

describe('"Did you mean?" Suggestions', () => {
  it('should suggest similar variable names', () => {
    const { error } = run(`
      let counter = 0
      print(conter)
    `);
    expect(error).toContain("Did you mean 'counter'");
  });

  it('should suggest for function names', () => {
    const { error } = run(`
      fn calculate(x) { return x * 2 }
      calculte(5)
    `);
    expect(error).toContain("Did you mean 'calculate'");
  });

  it('should not suggest when no similar name exists', () => {
    const { error } = run(`
      let x = 1
      print(completelyDifferentName)
    `);
    expect(error).toContain('is not defined');
    expect(error).not.toContain('Did you mean');
  });

  it('should handle single character difference', () => {
    const { error } = run(`
      let name = "Alice"
      print(nme)
    `);
    expect(error).toContain("Did you mean 'name'");
  });
});

// ============ Lexer: Spread Token ============

describe('Spread Token Lexing', () => {
  it('should lex ... as SPREAD token', () => {
    const lexer = new Lexer('[...arr]');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.LBRACKET);
    expect(tokens[1].type).toBe(TokenType.SPREAD);
    expect(tokens[2].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[3].type).toBe(TokenType.RBRACKET);
  });

  it('should still lex single dot as DOT', () => {
    const lexer = new Lexer('obj.prop');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.DOT);
  });

  it('should still lex range .. correctly', () => {
    const lexer = new Lexer('1..5');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[1].type).toBe(TokenType.DOT);
    expect(tokens[2].type).toBe(TokenType.DOT);
    expect(tokens[3].type).toBe(TokenType.NUMBER);
  });
});

// ============ Parser: New AST Nodes ============

describe('Parser: Try/Catch', () => {
  it('should parse try/catch statement', () => {
    const lexer = new Lexer('try { x() } catch err { print(err) }');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    expect(program.body[0].type).toBe('TryCatchStatement');
  });

  it('should parse throw statement', () => {
    const lexer = new Lexer('throw "error"');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    expect(program.body[0].type).toBe('ThrowStatement');
  });
});

describe('Parser: Interpolated String', () => {
  it('should parse f-string into InterpolatedString node', () => {
    const lexer = new Lexer('f"hello {name}"');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    const stmt = program.body[0];
    expect(stmt.type).toBe('ExpressionStatement');
    if (stmt.type === 'ExpressionStatement') {
      expect(stmt.expression.type).toBe('InterpolatedString');
    }
  });
});

// ============ Destructuring ============

describe('Array Destructuring', () => {
  it('should destructure arrays', () => {
    const { output } = run(`
      let [a, b, c] = [1, 2, 3]
      print(f"{a} {b} {c}")
    `);
    expect(output).toEqual(['1 2 3']);
  });

  it('should assign null for missing elements', () => {
    const { output } = run(`
      let [a, b, c] = [1]
      print(f"{a} {b} {c}")
    `);
    expect(output).toEqual(['1 null null']);
  });

  it('should work with const', () => {
    const { output, error } = run(`
      const [x, y] = [10, 20]
      print(f"{x} {y}")
    `);
    expect(output).toEqual(['10 20']);
    expect(error).toBeUndefined();
  });

  it('should error on non-array value', () => {
    const { error } = run(`
      let [a, b] = 42
    `);
    expect(error).toContain('Cannot destructure');
  });
});

describe('Object Destructuring', () => {
  it('should destructure objects', () => {
    const { output } = run(`
      let obj = {name: "Alice", age: 30}
      let {name, age} = obj
      print(f"{name} is {age}")
    `);
    expect(output).toEqual(['Alice is 30']);
  });

  it('should assign null for missing properties', () => {
    const { output } = run(`
      let {x, y} = {x: 1}
      print(f"{x} {y}")
    `);
    expect(output).toEqual(['1 null']);
  });

  it('should work with inline object', () => {
    const { output } = run(`
      let {a, b} = {a: "hello", b: "world"}
      print(f"{a} {b}")
    `);
    expect(output).toEqual(['hello world']);
  });

  it('should error on non-object value', () => {
    const { error } = run(`
      let {a} = [1, 2, 3]
    `);
    expect(error).toContain('Cannot destructure');
  });
});
