import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { Parser } from '../../src/parser/parser';
import { ParseError } from '../../src/parser/errors';
import { Program } from '../../src/types/ast';

describe('Parser', () => {
  function parse(source: string): Program {
    const tokens = new Lexer(source).tokenize();
    return new Parser(tokens).parse();
  }

  function firstStmt(source: string) {
    return parse(source).body[0];
  }

  describe('Variable Declarations', () => {
    it('should parse let declaration', () => {
      const stmt = firstStmt('let x = 5');
      expect(stmt.type).toBe('VariableDeclaration');
      if (stmt.type === 'VariableDeclaration') {
        expect(stmt.name).toBe('x');
        expect(stmt.constant).toBe(false);
      }
    });

    it('should parse const declaration', () => {
      const stmt = firstStmt('const PI = 3.14');
      if (stmt.type === 'VariableDeclaration') {
        expect(stmt.name).toBe('PI');
        expect(stmt.constant).toBe(true);
      }
    });

    it('should parse with expression values', () => {
      const stmt = firstStmt('let sum = 1 + 2');
      expect(stmt.type).toBe('VariableDeclaration');
    });
  });

  describe('Function Declarations', () => {
    it('should parse simple function', () => {
      const stmt = firstStmt('fn greet() { print("hi") }');
      expect(stmt.type).toBe('FunctionDeclaration');
      if (stmt.type === 'FunctionDeclaration') {
        expect(stmt.name).toBe('greet');
        expect(stmt.params).toHaveLength(0);
      }
    });

    it('should parse function with parameters', () => {
      const stmt = firstStmt('fn add(a, b) { return a + b }');
      if (stmt.type === 'FunctionDeclaration') {
        expect(stmt.params).toHaveLength(2);
        expect(stmt.params[0].name).toBe('a');
        expect(stmt.params[1].name).toBe('b');
      }
    });

    it('should parse function with default parameters', () => {
      const stmt = firstStmt('fn greet(name = "World") { return name }');
      if (stmt.type === 'FunctionDeclaration') {
        expect(stmt.params[0].defaultValue).toBeDefined();
      }
    });
  });

  describe('Class Declarations', () => {
    it('should parse basic class', () => {
      const stmt = firstStmt('class Dog { fn bark() { print("woof") } }');
      expect(stmt.type).toBe('ClassDeclaration');
      if (stmt.type === 'ClassDeclaration') {
        expect(stmt.name).toBe('Dog');
        expect(stmt.methods).toHaveLength(1);
      }
    });

    it('should parse class with extends', () => {
      const stmt = firstStmt('class Dog extends Animal { fn bark() { } }');
      if (stmt.type === 'ClassDeclaration') {
        expect(stmt.superClass).toBe('Animal');
      }
    });

    it('should parse class with properties', () => {
      const stmt = firstStmt('class Point { let x = 0\n let y = 0 }');
      if (stmt.type === 'ClassDeclaration') {
        expect(stmt.properties).toHaveLength(2);
      }
    });
  });

  describe('Control Flow', () => {
    it('should parse if statement', () => {
      const stmt = firstStmt('if x > 0 { print("positive") }');
      expect(stmt.type).toBe('IfStatement');
    });

    it('should parse if-else', () => {
      const stmt = firstStmt('if x > 0 { print("positive") } else { print("negative") }');
      if (stmt.type === 'IfStatement') {
        expect(stmt.alternate).not.toBeNull();
      }
    });

    it('should parse if-else if-else chain', () => {
      const stmt = firstStmt('if x > 0 { } else if x < 0 { } else { }');
      if (stmt.type === 'IfStatement') {
        expect(stmt.alternate).not.toBeNull();
      }
    });

    it('should parse while loop', () => {
      const stmt = firstStmt('while x > 0 { x -= 1 }');
      expect(stmt.type).toBe('WhileStatement');
    });

    it('should parse for loop', () => {
      const stmt = firstStmt('for i in items { print(i) }');
      expect(stmt.type).toBe('ForStatement');
      if (stmt.type === 'ForStatement') {
        expect(stmt.variable).toBe('i');
      }
    });

    it('should parse break and continue', () => {
      const prog = parse('while true { break }');
      const whileStmt = prog.body[0];
      if (whileStmt.type === 'WhileStatement') {
        expect(whileStmt.body[0].type).toBe('BreakStatement');
      }
    });
  });

  describe('Match Statement', () => {
    it('should parse match with when cases', () => {
      const stmt = firstStmt('match x {\n  when 1 => print("one")\n  when 2 => print("two")\n}');
      expect(stmt.type).toBe('MatchStatement');
      if (stmt.type === 'MatchStatement') {
        expect(stmt.cases).toHaveLength(2);
      }
    });

    it('should parse match with else case', () => {
      const stmt = firstStmt('match x {\n  when 1 => print("one")\n  else => print("other")\n}');
      if (stmt.type === 'MatchStatement') {
        expect(stmt.defaultCase).toBeDefined();
      }
    });
  });

  describe('Expressions', () => {
    it('should parse arithmetic with correct precedence', () => {
      const stmt = firstStmt('let x = 1 + 2 * 3');
      if (stmt.type === 'VariableDeclaration' && stmt.value.type === 'BinaryExpression') {
        expect(stmt.value.operator).toBe('+');
        expect(stmt.value.right.type).toBe('BinaryExpression');
      }
    });

    it('should parse unary expressions', () => {
      const stmt = firstStmt('let x = -5');
      if (stmt.type === 'VariableDeclaration') {
        expect(stmt.value.type).toBe('UnaryExpression');
      }
    });

    it('should parse logical expressions', () => {
      const stmt = firstStmt('let x = a and b or c');
      expect(stmt.type).toBe('VariableDeclaration');
    });

    it('should parse call expressions', () => {
      const stmt = firstStmt('add(1, 2)');
      if (stmt.type === 'ExpressionStatement') {
        expect(stmt.expression.type).toBe('CallExpression');
      }
    });

    it('should parse member expressions', () => {
      const stmt = firstStmt('obj.property');
      if (stmt.type === 'ExpressionStatement') {
        expect(stmt.expression.type).toBe('MemberExpression');
      }
    });

    it('should parse index expressions', () => {
      const stmt = firstStmt('arr[0]');
      if (stmt.type === 'ExpressionStatement') {
        expect(stmt.expression.type).toBe('IndexExpression');
      }
    });

    it('should parse array literals', () => {
      const stmt = firstStmt('let a = [1, 2, 3]');
      if (stmt.type === 'VariableDeclaration') {
        expect(stmt.value.type).toBe('ArrayLiteral');
      }
    });

    it('should parse object literals', () => {
      const stmt = firstStmt('let o = {name: "Alice", age: 30}');
      if (stmt.type === 'VariableDeclaration') {
        expect(stmt.value.type).toBe('ObjectLiteral');
      }
    });

    it('should parse arrow functions', () => {
      const stmt = firstStmt('let f = (x) => x * 2');
      if (stmt.type === 'VariableDeclaration') {
        expect(stmt.value.type).toBe('ArrowFunction');
      }
    });

    it('should parse range expressions', () => {
      const stmt = firstStmt('for i in 0..10 { }');
      if (stmt.type === 'ForStatement') {
        expect(stmt.iterable.type).toBe('RangeExpression');
      }
    });

    it('should parse new expressions', () => {
      const stmt = firstStmt('let d = new Dog("Rex")');
      if (stmt.type === 'VariableDeclaration') {
        expect(stmt.value.type).toBe('NewExpression');
      }
    });

    it('should parse power operator (right-associative)', () => {
      const stmt = firstStmt('let x = 2 ** 3 ** 2');
      if (stmt.type === 'VariableDeclaration' && stmt.value.type === 'BinaryExpression') {
        expect(stmt.value.operator).toBe('**');
        // Right side should also be a power expression (right-associative)
        expect(stmt.value.right.type).toBe('BinaryExpression');
      }
    });
  });

  describe('Print Statement', () => {
    it('should parse print with single argument', () => {
      const stmt = firstStmt('print("hello")');
      expect(stmt.type).toBe('PrintStatement');
    });

    it('should parse print with multiple arguments', () => {
      const stmt = firstStmt('print("x =", x, "y =", y)');
      if (stmt.type === 'PrintStatement') {
        expect(stmt.expressions).toHaveLength(4);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw ParseError for invalid syntax', () => {
      expect(() => parse('let = 5')).toThrow();
    });

    it('should throw for unclosed braces', () => {
      expect(() => parse('fn foo() {')).toThrow();
    });
  });

  describe('Ternary Expressions', () => {
    function exprOf(source: string) {
      const stmt = firstStmt(source) as { expression?: unknown; value?: unknown };
      return (stmt.expression ?? stmt.value) as Record<string, unknown>;
    }

    it('parses cond ? a : b as a TernaryExpression', () => {
      const expr = exprOf('let x = c ? a : b');
      expect(expr.type).toBe('TernaryExpression');
      expect((expr.condition as { name: string }).name).toBe('c');
      expect((expr.consequent as { name: string }).name).toBe('a');
      expect((expr.alternate as { name: string }).name).toBe('b');
    });

    it('is right-associative', () => {
      // a ? b : c ? d : e  ==  a ? b : (c ? d : e)
      const expr = exprOf('let x = a ? b : c ? d : e');
      expect(expr.type).toBe('TernaryExpression');
      const alt = expr.alternate as Record<string, unknown>;
      expect(alt.type).toBe('TernaryExpression');
      expect((alt.condition as { name: string }).name).toBe('c');
    });

    it('binds looser than assignment, so the whole ternary is the value', () => {
      const stmt = firstStmt('x = a ? b : c') as Record<string, unknown>;
      const assign = stmt.expression as Record<string, unknown>;
      expect(assign.type).toBe('AssignmentExpression');
      expect((assign.value as Record<string, unknown>).type).toBe('TernaryExpression');
    });

    it('binds tighter than nothing else: ?? forms the condition', () => {
      const expr = exprOf('let x = a ?? b ? c : d');
      expect(expr.type).toBe('TernaryExpression');
      expect((expr.condition as Record<string, unknown>).type).toBe(
        'NullishCoalesceExpression'
      );
    });

    it('takes a comparison as its condition', () => {
      const expr = exprOf('let x = a > b ? a : b');
      expect(expr.type).toBe('TernaryExpression');
      expect((expr.condition as Record<string, unknown>).type).toBe('BinaryExpression');
    });

    it('reports a missing colon', () => {
      expect(() => parse('let x = a ? b')).toThrow(ParseError);
      expect(() => parse('let x = a ? b')).toThrow(/Expected ':'/);
      try {
        parse('let x = a ? b');
      } catch (e) {
        expect((e as ParseError).hint).toContain('cond ? whenTrue : whenFalse');
      }
    });

    it('does not disturb ?? or ?.', () => {
      expect(exprOf('let x = a ?? b').type).toBe('NullishCoalesceExpression');
      expect(exprOf('let x = a?.b').type).toBe('OptionalMemberExpression');
    });
  });
});
