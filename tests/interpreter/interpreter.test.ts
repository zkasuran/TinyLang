import { describe, it, expect } from 'vitest';
import { TinyLang } from '../../src/tinylang';

describe('Interpreter', () => {
  function run(source: string) {
    const output: string[] = [];
    const tl = new TinyLang({ output: (msg) => output.push(msg) });
    const result = tl.run(source);
    return { result, output };
  }

  function expectOutput(source: string, expected: string[]) {
    const { output } = run(source);
    expect(output).toEqual(expected);
  }

  function expectResult(source: string, expected: string) {
    const { result } = run(source);
    expect(result.success).toBe(true);
    expect(result.result).toBe(expected);
  }

  function expectError(source: string) {
    const { result } = run(source);
    expect(result.success).toBe(false);
  }

  describe('Literals', () => {
    it('should evaluate numbers', () => {
      expectResult('42', '42');
      expectResult('3.14', '3.14');
    });

    it('should evaluate strings', () => {
      expectResult('"hello"', 'hello');
    });

    it('should evaluate booleans', () => {
      expectResult('true', 'true');
      expectResult('false', 'false');
    });

    it('should evaluate null', () => {
      expectResult('null', 'null');
    });

    it('should evaluate arrays', () => {
      expectResult('[1, 2, 3]', '[1, 2, 3]');
    });

    it('should evaluate objects', () => {
      expectResult('{name: "Alice"}', '{name: Alice}');
    });
  });

  describe('Arithmetic', () => {
    it('should add numbers', () => {
      expectResult('2 + 3', '5');
    });

    it('should subtract numbers', () => {
      expectResult('10 - 4', '6');
    });

    it('should multiply numbers', () => {
      expectResult('3 * 7', '21');
    });

    it('should divide numbers', () => {
      expectResult('15 / 3', '5');
    });

    it('should calculate modulo', () => {
      expectResult('17 % 5', '2');
    });

    it('should calculate power', () => {
      expectResult('2 ** 10', '1024');
    });

    it('should respect precedence', () => {
      expectResult('2 + 3 * 4', '14');
      expectResult('(2 + 3) * 4', '20');
    });

    it('should handle unary minus', () => {
      expectResult('-5', '-5');
      expectResult('-(-3)', '3');
    });

    it('should concatenate strings', () => {
      expectResult('"hello" + " " + "world"', 'hello world');
    });

    it('should repeat strings with *', () => {
      expectResult('"ha" * 3', 'hahaha');
    });

    it('should error on division by zero', () => {
      expectError('10 / 0');
    });
  });

  describe('Variables', () => {
    it('should declare and use variables', () => {
      expectOutput('let x = 42\nprint(x)', ['42']);
    });

    it('should reassign let variables', () => {
      expectOutput('let x = 1\nx = 2\nprint(x)', ['2']);
    });

    it('should prevent const reassignment', () => {
      expectError('const x = 1\nx = 2');
    });

    it('should support compound assignment', () => {
      expectOutput('let x = 10\nx += 5\nprint(x)', ['15']);
    });

    it('should error on undeclared variables', () => {
      expectError('print(undeclared)');
    });
  });

  describe('Functions', () => {
    it('should define and call functions', () => {
      expectOutput('fn add(a, b) { return a + b }\nprint(add(3, 4))', ['7']);
    });

    it('should support default parameters', () => {
      expectOutput('fn greet(name = "World") { return name }\nprint(greet())', ['World']);
    });

    it('should support closures', () => {
      const source = `
        fn counter() {
          let n = 0
          return fn() {
            n += 1
            return n
          }
        }
        let c = counter()
        print(c())
        print(c())
        print(c())
      `;
      expectOutput(source, ['1', '2', '3']);
    });

    it('should support recursion', () => {
      const source = `
        fn fact(n) {
          if n <= 1 { return 1 }
          return n * fact(n - 1)
        }
        print(fact(5))
      `;
      expectOutput(source, ['120']);
    });

    it('should support arrow functions', () => {
      expectOutput('let double = (x) => x * 2\nprint(double(5))', ['10']);
    });
  });

  describe('Control Flow', () => {
    it('should execute if statement', () => {
      expectOutput('if true { print("yes") }', ['yes']);
      expectOutput('if false { print("no") }', []);
    });

    it('should execute if-else', () => {
      expectOutput('if false { print("a") } else { print("b") }', ['b']);
    });

    it('should execute while loops', () => {
      const source = `
        let i = 0
        while i < 3 {
          print(i)
          i += 1
        }
      `;
      expectOutput(source, ['0', '1', '2']);
    });

    it('should execute for loops', () => {
      expectOutput('for i in [10, 20, 30] { print(i) }', ['10', '20', '30']);
    });

    it('should handle break', () => {
      const source = `
        for i in [1, 2, 3, 4, 5] {
          if i == 3 { break }
          print(i)
        }
      `;
      expectOutput(source, ['1', '2']);
    });

    it('should handle continue', () => {
      const source = `
        for i in [1, 2, 3, 4, 5] {
          if i == 3 { continue }
          print(i)
        }
      `;
      expectOutput(source, ['1', '2', '4', '5']);
    });

    it('should evaluate ranges', () => {
      expectOutput('for i in 1..4 { print(i) }', ['1', '2', '3']);
    });
  });

  describe('Match Statement', () => {
    it('should match values', () => {
      const source = `
        let x = 2
        match x {
          when 1 => print("one")
          when 2 => print("two")
          when 3 => print("three")
        }
      `;
      expectOutput(source, ['two']);
    });

    it('should use default case', () => {
      const source = `
        let x = 99
        match x {
          when 1 => print("one")
          else => print("other")
        }
      `;
      expectOutput(source, ['other']);
    });
  });

  describe('Classes', () => {
    it('should create instances', () => {
      const source = `
        class Dog {
          let name = ""
          fn init(name) {
            this.name = name
          }
          fn bark() {
            print(this.name + " says woof!")
          }
        }
        let d = new Dog("Rex")
        d.bark()
      `;
      expectOutput(source, ['Rex says woof!']);
    });

    it('should support inheritance', () => {
      const source = `
        class Animal {
          let name = ""
          fn init(name) { this.name = name }
          fn speak() { print(this.name + " makes a sound") }
        }
        class Cat extends Animal {
          fn init(name) { this.name = name }
          fn speak() { print(this.name + " meows") }
        }
        let c = new Cat("Whiskers")
        c.speak()
      `;
      expectOutput(source, ['Whiskers meows']);
    });
  });

  describe('Built-in Methods', () => {
    it('should support array methods', () => {
      expectOutput('print([3,1,2].sort())', ['[1, 2, 3]']);
      expectOutput('print([1,2,3].reverse())', ['[3, 2, 1]']);
      expectOutput('print([1,2,3].map((x) => x * 2))', ['[2, 4, 6]']);
      expectOutput('print([1,2,3,4].filter((x) => x > 2))', ['[3, 4]']);
    });

    it('should support string methods', () => {
      expectOutput('print("hello".upper())', ['HELLO']);
      expectOutput('print("  hi  ".trim())', ['hi']);
      expectOutput('print("hello".contains("ell"))', ['true']);
    });

    it('should support array.length and string.length', () => {
      expectOutput('print([1,2,3].length)', ['3']);
      expectOutput('print("hello".length)', ['5']);
    });
  });

  describe('Standard Library', () => {
    it('should provide math functions', () => {
      expectOutput('print(abs(-5))', ['5']);
      expectOutput('print(floor(3.7))', ['3']);
      expectOutput('print(ceil(3.2))', ['4']);
      expectOutput('print(sqrt(16))', ['4']);
    });

    it('should provide string functions', () => {
      expectOutput('print(len("hello"))', ['5']);
      expectOutput('print(upper("hi"))', ['HI']);
    });

    it('should provide type functions', () => {
      expectOutput('print(type(42))', ['number']);
      expectOutput('print(type("hi"))', ['string']);
      expectOutput('print(type(true))', ['boolean']);
      expectOutput('print(type([1,2]))', ['array']);
    });

    it('should provide range function', () => {
      expectOutput('print(range(5))', ['[0, 1, 2, 3, 4]']);
      expectOutput('print(range(1, 4))', ['[1, 2, 3]']);
    });

    it('should provide math constants', () => {
      expectOutput('print(floor(PI * 100))', ['314']);
    });
  });

  describe('Error Messages', () => {
    it('should show friendly error for undefined variable', () => {
      const { result } = run('print(xyz)');
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not defined');
    });

    it('should show error for type mismatch', () => {
      const { result } = run('"hello" - 5');
      expect(result.success).toBe(false);
    });

    it('should detect infinite loops', () => {
      const { result } = run('while true { }');
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('limit');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty program', () => {
      const { result } = run('');
      expect(result.success).toBe(true);
    });

    it('should handle comments-only program', () => {
      const { result } = run('// just a comment');
      expect(result.success).toBe(true);
    });

    it('should handle nested function calls', () => {
      expectOutput('print(str(abs(-42)))', ['42']);
    });

    it('should handle complex expressions', () => {
      expectResult('(2 + 3) * (4 - 1) ** 2', '45');
    });
  });
});
