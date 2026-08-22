/**
 * Tests for advanced language features:
 * - Pipe Operator (|>)
 * - Enum Types
 * - Optional Chaining (?.)
 * - Nullish Coalescing (??)
 */

import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import { TokenType } from '../../src/types/tokens';
import { TinyLang } from '../../src/tinylang';

function run(source: string): { output: string[]; error?: string } {
  const output: string[] = [];
  const tinylang = new TinyLang({ output: (msg) => output.push(msg) });
  const result = tinylang.run(source);
  return { output, error: result.error?.message };
}

// ============ Pipe Operator (|>) ============

describe('Pipe Operator (|>)', () => {
  it('should lex |> as PIPE_ARROW token', () => {
    const lexer = new Lexer('x |> double');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.PIPE_ARROW);
    expect(tokens[1].value).toBe('|>');
  });

  it('should still lex | as PIPE token', () => {
    const lexer = new Lexer('a | b');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.PIPE);
  });

  it('should pipe a value into a function', () => {
    const { output } = run(`
      fn double(x) { return x * 2 }
      let result = 5 |> double
      print(result)
    `);
    expect(output).toEqual(['10']);
  });

  it('should chain multiple pipes', () => {
    const { output } = run(`
      fn double(x) { return x * 2 }
      fn addOne(x) { return x + 1 }
      let result = 5 |> double |> addOne
      print(result)
    `);
    expect(output).toEqual(['11']);
  });

  it('should pipe into a function call with extra arguments', () => {
    const { output } = run(`
      fn add(x, y) { return x + y }
      let result = 5 |> add(3)
      print(result)
    `);
    expect(output).toEqual(['8']);
  });

  it('should work with arrow functions through variables', () => {
    const { output } = run(`
      let triple = (x) => x * 3
      let result = 4 |> triple
      print(result)
    `);
    expect(output).toEqual(['12']);
  });

  it('should work with built-in stdlib functions', () => {
    const { output } = run(`
      fn negate(x) { return -x }
      let result = 42 |> negate
      print(result)
    `);
    expect(output).toEqual(['-42']);
  });

  it('should parse PipeExpression AST node', () => {
    const lexer = new Lexer('x |> double');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    const stmt = program.body[0];
    expect(stmt.type).toBe('ExpressionStatement');
    if (stmt.type === 'ExpressionStatement') {
      expect(stmt.expression.type).toBe('PipeExpression');
    }
  });
});

// ============ Enum Types ============

describe('Enum Types', () => {
  it('should lex enum as ENUM keyword', () => {
    const lexer = new Lexer('enum Direction { North }');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.ENUM);
  });

  it('should parse enum declarations', () => {
    const lexer = new Lexer('enum Color { Red\nGreen\nBlue }');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    expect(program.body[0].type).toBe('EnumDeclaration');
  });

  it('should create enum with accessible variants', () => {
    const { output } = run(`
      enum Direction {
        North
        South
        East
        West
      }
      print(Direction.North)
    `);
    expect(output).toEqual(['North']);
  });

  it('should allow comparison of enum variants', () => {
    const { output } = run(`
      enum Color {
        Red
        Green
        Blue
      }
      let c = Color.Red
      print(c == Color.Red)
      print(c == Color.Blue)
    `);
    expect(output).toEqual(['true', 'false']);
  });

  it('should store variants as string values', () => {
    const { output } = run(`
      enum Status {
        Active
        Inactive
        Pending
      }
      let s = Status.Active
      print(s)
      print(s == "Active")
    `);
    expect(output).toEqual(['Active', 'true']);
  });

  it('should work in match statements', () => {
    const { output } = run(`
      enum Direction {
        North
        South
        East
        West
      }
      let dir = Direction.East
      match dir {
        when "North" => print("going north")
        when "East" => print("going east")
        else => print("other")
      }
    `);
    expect(output).toEqual(['going east']);
  });

  it('should be usable in if conditions', () => {
    const { output } = run(`
      enum Light {
        Red
        Yellow
        Green
      }
      let current = Light.Green
      if current == Light.Green {
        print("go")
      } else {
        print("stop")
      }
    `);
    expect(output).toEqual(['go']);
  });

  it('should treat enum as constant', () => {
    const { error } = run(`
      enum Fruit {
        Apple
        Banana
      }
      Fruit = "not allowed"
    `);
    expect(error).toContain('Cannot reassign constant');
  });
});

// ============ Optional Chaining (?.) ============

describe('Optional Chaining (?.)', () => {
  it('should lex ?. as QUESTION_DOT token', () => {
    const lexer = new Lexer('obj?.name');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.QUESTION_DOT);
  });

  it('should return null when object is null', () => {
    const { output } = run(`
      let obj = null
      let result = obj?.name
      print(result)
    `);
    expect(output).toEqual(['null']);
  });

  it('should access property when object is not null', () => {
    const { output } = run(`
      let obj = {name: "Alice"}
      let result = obj?.name
      print(result)
    `);
    expect(output).toEqual(['Alice']);
  });

  it('should chain multiple optional accesses', () => {
    const { output } = run(`
      let user = {profile: {name: "Bob"}}
      print(user?.profile?.name)
    `);
    expect(output).toEqual(['Bob']);
  });

  it('should short-circuit on null in chain', () => {
    const { output } = run(`
      let user = {profile: null}
      let result = user?.profile?.name
      print(result)
    `);
    expect(output).toEqual(['null']);
  });

  it('should work with optional index access ?.[]', () => {
    const { output } = run(`
      let arr = [1, 2, 3]
      print(arr?.[0])
      let nothing = null
      print(nothing?.[0])
    `);
    expect(output).toEqual(['1', 'null']);
  });

  it('should return null for out-of-bounds optional index', () => {
    const { output } = run(`
      let arr = [1, 2]
      print(arr?.[10])
    `);
    expect(output).toEqual(['null']);
  });

  it('should parse OptionalMemberExpression AST node', () => {
    const lexer = new Lexer('obj?.name');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    const stmt = program.body[0];
    expect(stmt.type).toBe('ExpressionStatement');
    if (stmt.type === 'ExpressionStatement') {
      expect(stmt.expression.type).toBe('OptionalMemberExpression');
    }
  });
});

// ============ Nullish Coalescing (??) ============

describe('Nullish Coalescing (??)', () => {
  it('should lex ?? as NULLISH_COALESCE token', () => {
    const lexer = new Lexer('x ?? y');
    const tokens = lexer.tokenize();
    expect(tokens[1].type).toBe(TokenType.NULLISH_COALESCE);
  });

  it('should return left side when not null', () => {
    const { output } = run(`
      let x = 42
      let result = x ?? 0
      print(result)
    `);
    expect(output).toEqual(['42']);
  });

  it('should return right side when left is null', () => {
    const { output } = run(`
      let x = null
      let result = x ?? "default"
      print(result)
    `);
    expect(output).toEqual(['default']);
  });

  it('should not treat false as null', () => {
    const { output } = run(`
      let x = false
      let result = x ?? "default"
      print(result)
    `);
    expect(output).toEqual(['false']);
  });

  it('should not treat 0 as null', () => {
    const { output } = run(`
      let x = 0
      let result = x ?? 42
      print(result)
    `);
    expect(output).toEqual(['0']);
  });

  it('should not treat empty string as null', () => {
    const { output } = run(`
      let x = ""
      let result = x ?? "default"
      print(result)
    `);
    expect(output).toEqual(['']);
  });

  it('should chain multiple ?? operators', () => {
    const { output } = run(`
      let a = null
      let b = null
      let c = "found"
      let result = a ?? b ?? c
      print(result)
    `);
    expect(output).toEqual(['found']);
  });

  it('should parse NullishCoalesceExpression AST node', () => {
    const lexer = new Lexer('x ?? y');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    const stmt = program.body[0];
    expect(stmt.type).toBe('ExpressionStatement');
    if (stmt.type === 'ExpressionStatement') {
      expect(stmt.expression.type).toBe('NullishCoalesceExpression');
    }
  });
});

// ============ Combined Features ============

describe('Combined: Optional Chaining + Nullish Coalescing', () => {
  it('should use ?? with ?. for default values', () => {
    const { output } = run(`
      let user = null
      let name = user?.name ?? "Anonymous"
      print(name)
    `);
    expect(output).toEqual(['Anonymous']);
  });

  it('should get nested value or default', () => {
    const { output } = run(`
      let config = {theme: {color: "blue"}}
      let color = config?.theme?.color ?? "red"
      print(color)
    `);
    expect(output).toEqual(['blue']);
  });

  it('should fall back when nested property is null', () => {
    const { output } = run(`
      let config = {theme: null}
      let color = config?.theme?.color ?? "red"
      print(color)
    `);
    expect(output).toEqual(['red']);
  });

  it('should combine pipe with other features', () => {
    const { output } = run(`
      fn getLength(s) { return s.length }
      let text = "hello"
      let result = text |> getLength
      print(result)
    `);
    expect(output).toEqual(['5']);
  });
});
