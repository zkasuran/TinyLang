import { describe, it, expect } from 'vitest';
import { Formatter } from '../../src/formatter';

describe('Formatter', () => {
  const formatter = new Formatter();

  function format(source: string): string {
    return formatter.format(source);
  }

  describe('basic formatting', () => {
    it('should format a simple program', () => {
      const input = `let   x   =   42`;
      const output = format(input);
      expect(output).toBe('let x = 42\n');
    });

    it('should be idempotent', () => {
      const input = `let x = 42\nlet y = x + 1\nprint(y)`;
      const first = format(input);
      const second = format(first);
      expect(first).toBe(second);
    });

    it('should be idempotent for complex programs', () => {
      const input = `
fn fibonacci(n) {
  if n <= 1 {
    return n
  }
  return fibonacci(n - 1) + fibonacci(n - 2)
}
let result = fibonacci(10)
print(result)
`;
      const first = format(input);
      const second = format(first);
      expect(first).toBe(second);
    });
  });

  describe('variable declarations', () => {
    it('should format let declarations', () => {
      const output = format('let   x=42');
      expect(output).toBe('let x = 42\n');
    });

    it('should format const declarations', () => {
      const output = format('const   PI=3.14');
      expect(output).toBe('const PI = 3.14\n');
    });
  });

  describe('function declarations', () => {
    it('should format function declarations with brace on same line', () => {
      const output = format('fn add(a, b) { return a + b }');
      expect(output).toBe('fn add(a, b) {\n  return a + b\n}\n');
    });

    it('should format function with default params', () => {
      const output = format('fn greet(name = "World") { print(name) }');
      expect(output).toBe('fn greet(name = "World") {\n  print(name)\n}\n');
    });
  });

  describe('class declarations', () => {
    it('should format class with methods', () => {
      const input = `class Animal { fn speak() { print("...") } }`;
      const output = format(input);
      expect(output).toContain('class Animal {\n');
      expect(output).toContain('  fn speak() {\n');
      expect(output).toContain('    print("...")\n');
    });

    it('should format class with extends', () => {
      const input = `class Dog extends Animal { fn speak() { print("Woof") } }`;
      const output = format(input);
      expect(output).toContain('class Dog extends Animal {\n');
    });
  });

  describe('if statements', () => {
    it('should format if statement', () => {
      const output = format('if x > 0 { print(x) }');
      expect(output).toBe('if x > 0 {\n  print(x)\n}\n');
    });

    it('should format if-else', () => {
      const output = format('if x > 0 { print("pos") } else { print("neg") }');
      expect(output).toContain('} else {\n');
    });
  });

  describe('while statements', () => {
    it('should format while loops', () => {
      const output = format('while x > 0 { x = x - 1 }');
      expect(output).toBe('while x > 0 {\n  x = x - 1\n}\n');
    });
  });

  describe('for statements', () => {
    it('should format for loops', () => {
      const output = format('for i in items { print(i) }');
      expect(output).toBe('for i in items {\n  print(i)\n}\n');
    });
  });

  describe('match statements', () => {
    it('should format match statements', () => {
      const input = `match x {\n  when 1 => print("one")\n  when 2 => print("two")\n}`;
      const output = format(input);
      expect(output).toContain('match x {\n');
      expect(output).toContain('  when 1 => print("one")\n');
      expect(output).toContain('  when 2 => print("two")\n');
    });
  });

  describe('expressions', () => {
    it('should format binary expressions with spacing', () => {
      const output = format('let x = 1 + 2 * 3');
      expect(output).toBe('let x = 1 + 2 * 3\n');
    });

    it('should format call expressions', () => {
      const output = format('foo(1, 2, 3)');
      expect(output).toBe('foo(1, 2, 3)\n');
    });

    it('should format member access', () => {
      const output = format('obj.prop');
      expect(output).toBe('obj.prop\n');
    });

    it('should format arrow functions', () => {
      const output = format('let add = (a, b) => a + b');
      expect(output).toBe('let add = (a, b) => a + b\n');
    });
  });

  describe('arrays and objects', () => {
    it('should format short arrays on one line', () => {
      const output = format('let arr = [1, 2, 3]');
      expect(output).toBe('let arr = [1, 2, 3]\n');
    });

    it('should format short objects on one line', () => {
      const output = format('let obj = {x: 1, y: 2}');
      expect(output).toBe('let obj = {x: 1, y: 2}\n');
    });
  });

  describe('indentation', () => {
    it('should properly indent nested blocks', () => {
      const input = `fn outer() { if true { let x = 1 } }`;
      const output = format(input);
      expect(output).toContain('  if true {\n');
      expect(output).toContain('    let x = 1\n');
      expect(output).toContain('  }\n');
    });

    it('should respect custom indent size', () => {
      const fmt = new Formatter({ indentSize: 4 });
      const output = fmt.format('fn foo() { return 1 }');
      expect(output).toContain('    return 1\n');
    });
  });

  describe('blank lines', () => {
    it('should add blank lines between top-level declarations', () => {
      const input = `fn foo() { return 1 }\nfn bar() { return 2 }`;
      const output = format(input);
      expect(output).toContain('}\n\nfn bar');
    });
  });

  describe('test declarations', () => {
    it('should format test blocks', () => {
      const input = `test "addition" { let x = 1 + 1 }`;
      const output = format(input);
      expect(output).toContain('test "addition" {\n');
      expect(output).toContain('  let x = 1 + 1\n');
    });
  });

  describe('print statements', () => {
    it('should format print with parentheses', () => {
      const output = format('print("hello", "world")');
      expect(output).toBe('print("hello", "world")\n');
    });
  });

  describe('return statements', () => {
    it('should format return with value', () => {
      const output = format('fn f() { return 42 }');
      expect(output).toContain('  return 42\n');
    });
  });
});
