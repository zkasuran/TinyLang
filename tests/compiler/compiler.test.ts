import { describe, it, expect } from 'vitest';
import { Compiler, Chunk, OpCode, disassemble, optimize } from '../../src/compiler';
import { VM } from '../../src/vm';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import { TinyLang } from '../../src/tinylang';
import { stringify } from '../../src/types/values';

function compileSource(source: string): Chunk {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const program = parser.parse();
  const compiler = new Compiler();
  return compiler.compile(program);
}

function runVM(source: string): { output: string[]; result: string } {
  const chunk = compileSource(source);
  const output: string[] = [];
  const vm = new VM({ output: (msg) => output.push(msg) });
  const result = vm.run(chunk);
  return { output, result: stringify(result) };
}

function expectVMOutput(source: string, expected: string[]) {
  const { output } = runVM(source);
  expect(output).toEqual(expected);
}

function expectVMResult(source: string, expected: string) {
  const { result } = runVM(source);
  expect(result).toBe(expected);
}

describe('Compiler', () => {
  describe('Compilation', () => {
    it('should compile a simple program to a chunk', () => {
      const chunk = compileSource('let x = 42');
      expect(chunk).toBeInstanceOf(Chunk);
      expect(chunk.code.length).toBeGreaterThan(0);
      expect(chunk.constants.length).toBeGreaterThan(0);
    });

    it('should compile number literals', () => {
      const chunk = compileSource('42');
      expect(chunk.constants).toContainEqual({ type: 'number', value: 42 });
    });

    it('should compile string literals', () => {
      const chunk = compileSource('"hello"');
      expect(chunk.constants).toContainEqual({ type: 'string', value: 'hello' });
    });

    it('should compile binary expressions', () => {
      const chunk = compileSource('1 + 2');
      // Should have CONST 1, CONST 2, ADD
      expect(chunk.code).toContain(OpCode.ADD);
    });

    it('should compile function declarations', () => {
      const chunk = compileSource('fn add(a, b) { return a + b }');
      expect(chunk.code).toContain(OpCode.CLOSURE);
    });

    it('should compile class declarations', () => {
      const chunk = compileSource('class Dog { fn bark() { print("woof") } }');
      expect(chunk.code).toContain(OpCode.CLASS);
      expect(chunk.code).toContain(OpCode.METHOD);
    });
  });

  describe('Disassembler', () => {
    it('should produce readable output', () => {
      const chunk = compileSource('let x = 1 + 2');
      const output = disassemble(chunk, 'test');
      expect(output).toContain('== test ==');
      expect(output).toContain('CONST');
      expect(output).toContain('ADD');
    });

    it('should show constant values', () => {
      const chunk = compileSource('42');
      const output = disassemble(chunk);
      expect(output).toContain('42');
    });

    it('should show function names', () => {
      const chunk = compileSource('fn hello() { return 1 }');
      const output = disassemble(chunk);
      expect(output).toContain('hello');
    });
  });

  describe('Optimizer', () => {
    it('should fold constant arithmetic', () => {
      const chunk = compileSource('1 + 2');
      const optimized = optimize(chunk);
      // The optimized chunk should have fewer instructions
      // Original: CONST, CONST, ADD, POP, HALT = many bytes
      // Optimized: CONST (3), POP, HALT = fewer bytes
      expect(optimized.code.length).toBeLessThan(chunk.code.length);
    });

    it('should fold constant multiplication', () => {
      const chunk = compileSource('3 * 4');
      const optimized = optimize(chunk);
      // Should have a constant 12 in the pool
      expect(optimized.constants).toContainEqual({ type: 'number', value: 12 });
    });

    it('should fold string concatenation', () => {
      const chunk = compileSource('"hello" + " world"');
      const optimized = optimize(chunk);
      expect(optimized.constants).toContainEqual({ type: 'string', value: 'hello world' });
    });

    it('should fold negative numbers', () => {
      const chunk = compileSource('-42');
      const optimized = optimize(chunk);
      expect(optimized.constants).toContainEqual({ type: 'number', value: -42 });
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize a chunk', () => {
      const chunk = compileSource('let x = 1 + 2\nprint(x)');
      const buffer = chunk.serialize();

      // Check magic bytes
      expect(buffer[0]).toBe(0x54); // T
      expect(buffer[1]).toBe(0x49); // I
      expect(buffer[2]).toBe(0x4E); // N
      expect(buffer[3]).toBe(0x59); // Y

      const deserialized = Chunk.deserialize(buffer);
      expect(deserialized.code).toEqual(chunk.code);
      expect(deserialized.lines).toEqual(chunk.lines);
    });

    it('should reject invalid magic bytes', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x01]);
      expect(() => Chunk.deserialize(buffer)).toThrow('Invalid .tinyc file');
    });
  });
});

describe('VM Execution', () => {
  describe('Arithmetic', () => {
    it('should evaluate addition', () => {
      expectVMOutput('print(1 + 2)', ['3']);
    });

    it('should evaluate subtraction', () => {
      expectVMOutput('print(10 - 3)', ['7']);
    });

    it('should evaluate multiplication', () => {
      expectVMOutput('print(4 * 5)', ['20']);
    });

    it('should evaluate division', () => {
      expectVMOutput('print(10 / 2)', ['5']);
    });

    it('should evaluate modulo', () => {
      expectVMOutput('print(10 % 3)', ['1']);
    });

    it('should evaluate power', () => {
      expectVMOutput('print(2 ** 3)', ['8']);
    });

    it('should evaluate negation', () => {
      expectVMOutput('print(-5)', ['-5']);
    });

    it('should evaluate complex expressions', () => {
      expectVMOutput('print(2 + 3 * 4)', ['14']);
    });

    it('should handle string concatenation', () => {
      expectVMOutput('print("hello" + " " + "world")', ['hello world']);
    });
  });

  describe('Variables', () => {
    it('should declare and use global variables', () => {
      expectVMOutput('let x = 42\nprint(x)', ['42']);
    });

    it('should declare and use multiple variables', () => {
      expectVMOutput('let x = 10\nlet y = 20\nprint(x + y)', ['30']);
    });

    it('should handle variable reassignment', () => {
      expectVMOutput('let x = 1\nx = 2\nprint(x)', ['2']);
    });

    it('should handle compound assignment', () => {
      expectVMOutput('let x = 10\nx += 5\nprint(x)', ['15']);
    });
  });

  describe('Comparison and Logic', () => {
    it('should evaluate equality', () => {
      expectVMOutput('print(1 == 1)', ['true']);
      expectVMOutput('print(1 == 2)', ['false']);
    });

    it('should evaluate inequality', () => {
      expectVMOutput('print(1 != 2)', ['true']);
    });

    it('should evaluate less than', () => {
      expectVMOutput('print(1 < 2)', ['true']);
      expectVMOutput('print(2 < 1)', ['false']);
    });

    it('should evaluate greater than', () => {
      expectVMOutput('print(2 > 1)', ['true']);
    });

    it('should evaluate logical not', () => {
      expectVMOutput('print(not true)', ['false']);
      expectVMOutput('print(not false)', ['true']);
    });

    it('should evaluate logical and', () => {
      expectVMOutput('print(true and true)', ['true']);
      expectVMOutput('print(true and false)', ['false']);
    });

    it('should evaluate logical or', () => {
      expectVMOutput('print(false or true)', ['true']);
      expectVMOutput('print(false or false)', ['false']);
    });
  });

  describe('Control Flow', () => {
    it('should handle if statements', () => {
      expectVMOutput('if true { print("yes") }', ['yes']);
    });

    it('should handle if/else statements', () => {
      expectVMOutput('if false { print("no") } else { print("yes") }', ['yes']);
    });

    it('should handle while loops', () => {
      expectVMOutput(
        'let i = 0\nwhile i < 3 { print(i)\ni += 1 }',
        ['0', '1', '2']
      );
    });

    it('should handle for loops', () => {
      expectVMOutput(
        'for x in [1, 2, 3] { print(x) }',
        ['1', '2', '3']
      );
    });
  });

  describe('Functions', () => {
    it('should handle function declarations and calls', () => {
      expectVMOutput('fn greet() { print("hello") }\ngreet()', ['hello']);
    });

    it('should handle function parameters', () => {
      expectVMOutput('fn add(a, b) { return a + b }\nprint(add(2, 3))', ['5']);
    });

    it('should handle nested functions', () => {
      expectVMOutput(
        'fn outer() {\n  fn inner() { return 42 }\n  return inner()\n}\nprint(outer())',
        ['42']
      );
    });

    it('should handle closures', () => {
      expectVMOutput(
        'fn makeCounter() {\n  let count = 0\n  fn increment() {\n    count += 1\n    return count\n  }\n  return increment\n}\nlet counter = makeCounter()\nprint(counter())\nprint(counter())',
        ['1', '2']
      );
    });

    it('should handle recursive functions', () => {
      expectVMOutput(
        'fn factorial(n) {\n  if n <= 1 { return 1 }\n  return n * factorial(n - 1)\n}\nprint(factorial(5))',
        ['120']
      );
    });
  });

  describe('Arrays', () => {
    it('should create arrays', () => {
      expectVMOutput('let arr = [1, 2, 3]\nprint(arr)', ['[1, 2, 3]']);
    });

    it('should access array elements', () => {
      expectVMOutput('let arr = [10, 20, 30]\nprint(arr[1])', ['20']);
    });

    it('should get array length', () => {
      expectVMOutput('let arr = [1, 2, 3]\nprint(arr.length)', ['3']);
    });
  });

  describe('Objects', () => {
    it('should create objects', () => {
      expectVMOutput('let obj = {x: 1, y: 2}\nprint(obj.x)', ['1']);
    });

    it('should set object properties', () => {
      expectVMOutput('let obj = {x: 1}\nobj.x = 42\nprint(obj.x)', ['42']);
    });
  });

  describe('Classes', () => {
    it('should define and instantiate classes', () => {
      expectVMOutput(
        'class Dog {\n  fn init(name) {\n    this.name = name\n  }\n  fn bark() {\n    print("Woof! I am " + this.name)\n  }\n}\nlet d = new Dog("Rex")\nd.bark()',
        ['Woof! I am Rex']
      );
    });

    it('should handle class methods', () => {
      expectVMOutput(
        'class Counter {\n  fn init() {\n    this.count = 0\n  }\n  fn increment() {\n    this.count += 1\n    return this.count\n  }\n}\nlet c = new Counter()\nprint(c.increment())\nprint(c.increment())',
        ['1', '2']
      );
    });
  });

  describe('Print', () => {
    it('should handle multiple print arguments', () => {
      expectVMOutput('print(1, 2, 3)', ['1 2 3']);
    });

    it('should print different types', () => {
      expectVMOutput('print("hello")', ['hello']);
      expectVMOutput('print(true)', ['true']);
      expectVMOutput('print(null)', ['null']);
    });
  });

  describe('Interpreter Equivalence', () => {
    it('should produce same output as tree-walk interpreter', () => {
      const programs = [
        'print(1 + 2 * 3)',
        'let x = 10\nlet y = 20\nprint(x + y)',
        'fn double(n) { return n * 2 }\nprint(double(21))',
        'if 5 > 3 { print("yes") } else { print("no") }',
        'let sum = 0\nlet i = 1\nwhile i <= 5 { sum += i\ni += 1 }\nprint(sum)',
      ];

      for (const src of programs) {
        const tl = new TinyLang();
        const interpResult = tl.run(src);

        const vmResult = runVM(src);

        expect(vmResult.output).toEqual(interpResult.output);
      }
    });
  });
});

describe('TinyLang Compile API', () => {
  it('should compile source to chunk', () => {
    const tl = new TinyLang();
    const chunk = tl.compile('let x = 1 + 2');
    expect(chunk).toBeInstanceOf(Chunk);
  });

  it('should run compiled chunks', () => {
    const tl = new TinyLang();
    const chunk = tl.compile('print(42)');
    const result = tl.runCompiled(chunk);
    expect(result.success).toBe(true);
    expect(result.output).toEqual(['42']);
  });

  it('should compile and run in one step', () => {
    const tl = new TinyLang();
    const result = tl.compileAndRun('print("hello world")');
    expect(result.success).toBe(true);
    expect(result.output).toEqual(['hello world']);
  });
});
