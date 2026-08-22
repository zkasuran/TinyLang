import { describe, it, expect } from 'vitest';
import { Compiler, Chunk, OpCode, optimize } from '../../src/compiler';
import { VM } from '../../src/vm';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import { createNumber, stringify } from '../../src/types/values';

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

describe('VM', () => {
  describe('Stack Operations', () => {
    it('should push constants onto the stack', () => {
      const chunk = new Chunk('test');
      const idx = chunk.addConstant(createNumber(42));
      chunk.write(OpCode.CONST, 1);
      chunk.write16(idx, 1);
      chunk.write(OpCode.HALT, 1);

      const vm = new VM();
      const result = vm.run(chunk);
      expect(result).toEqual(createNumber(42));
    });

    it('should handle multiple constants', () => {
      const chunk = new Chunk('test');
      const idx1 = chunk.addConstant(createNumber(10));
      const idx2 = chunk.addConstant(createNumber(20));
      chunk.write(OpCode.CONST, 1);
      chunk.write16(idx1, 1);
      chunk.write(OpCode.CONST, 1);
      chunk.write16(idx2, 1);
      chunk.write(OpCode.ADD, 1);
      chunk.write(OpCode.HALT, 1);

      const vm = new VM();
      const result = vm.run(chunk);
      expect(result).toEqual(createNumber(30));
    });
  });

  describe('Arithmetic Operations', () => {
    it('should perform addition', () => {
      const { output } = runVM('print(1 + 2)');
      expect(output).toEqual(['3']);
    });

    it('should perform subtraction', () => {
      const { output } = runVM('print(10 - 3)');
      expect(output).toEqual(['7']);
    });

    it('should perform multiplication', () => {
      const { output } = runVM('print(6 * 7)');
      expect(output).toEqual(['42']);
    });

    it('should perform division', () => {
      const { output } = runVM('print(15 / 3)');
      expect(output).toEqual(['5']);
    });

    it('should perform modulo', () => {
      const { output } = runVM('print(17 % 5)');
      expect(output).toEqual(['2']);
    });

    it('should perform power', () => {
      const { output } = runVM('print(2 ** 10)');
      expect(output).toEqual(['1024']);
    });

    it('should handle negation', () => {
      const { output } = runVM('print(-42)');
      expect(output).toEqual(['-42']);
    });

    it('should handle operator precedence', () => {
      const { output } = runVM('print(2 + 3 * 4)');
      expect(output).toEqual(['14']);
    });

    it('should throw on division by zero', () => {
      expect(() => runVM('print(1 / 0)')).toThrow('Division by zero');
    });
  });

  describe('String Operations', () => {
    it('should concatenate strings', () => {
      const { output } = runVM('print("hello" + " " + "world")');
      expect(output).toEqual(['hello world']);
    });

    it('should concatenate string with number', () => {
      const { output } = runVM('print("count: " + 42)');
      expect(output).toEqual(['count: 42']);
    });

    it('should repeat strings with multiplication', () => {
      const { output } = runVM('print("ha" * 3)');
      expect(output).toEqual(['hahaha']);
    });
  });

  describe('Boolean and Comparison Operations', () => {
    it('should compare numbers', () => {
      const { output } = runVM('print(1 < 2)\nprint(2 > 1)\nprint(1 == 1)\nprint(1 != 2)');
      expect(output).toEqual(['true', 'true', 'true', 'true']);
    });

    it('should handle logical not', () => {
      const { output } = runVM('print(not true)\nprint(not false)');
      expect(output).toEqual(['false', 'true']);
    });

    it('should short-circuit AND', () => {
      const { output } = runVM('print(true and true)\nprint(false and true)');
      expect(output).toEqual(['true', 'false']);
    });

    it('should short-circuit OR', () => {
      const { output } = runVM('print(false or true)\nprint(true or false)');
      expect(output).toEqual(['true', 'true']);
    });
  });

  describe('Control Flow', () => {
    it('should execute if branch when condition is true', () => {
      const { output } = runVM('if 1 < 2 { print("yes") }');
      expect(output).toEqual(['yes']);
    });

    it('should execute else branch when condition is false', () => {
      const { output } = runVM('if 1 > 2 { print("no") } else { print("yes") }');
      expect(output).toEqual(['yes']);
    });

    it('should handle else-if chains', () => {
      const { output } = runVM(`
        let x = 2
        if x == 1 { print("one") }
        else if x == 2 { print("two") }
        else { print("other") }
      `);
      expect(output).toEqual(['two']);
    });

    it('should execute while loops', () => {
      const { output } = runVM(`
        let i = 0
        while i < 5 {
          print(i)
          i += 1
        }
      `);
      expect(output).toEqual(['0', '1', '2', '3', '4']);
    });

    it('should execute for loops over arrays', () => {
      const { output } = runVM(`
        for item in [10, 20, 30] {
          print(item)
        }
      `);
      expect(output).toEqual(['10', '20', '30']);
    });

    it('should handle match statements', () => {
      const { output } = runVM(`
        let x = 2
        match x {
          when 1 => print("one")
          when 2 => print("two")
          when 3 => print("three")
        }
      `);
      expect(output).toEqual(['two']);
    });
  });

  describe('Functions', () => {
    it('should call functions with return values', () => {
      const { output } = runVM(`
        fn square(n) {
          return n * n
        }
        print(square(5))
      `);
      expect(output).toEqual(['25']);
    });

    it('should handle multiple parameters', () => {
      const { output } = runVM(`
        fn add(a, b, c) {
          return a + b + c
        }
        print(add(1, 2, 3))
      `);
      expect(output).toEqual(['6']);
    });

    it('should handle recursion', () => {
      const { output } = runVM(`
        fn fib(n) {
          if n <= 1 { return n }
          return fib(n - 1) + fib(n - 2)
        }
        print(fib(10))
      `);
      expect(output).toEqual(['55']);
    });

    it('should handle closures', () => {
      const { output } = runVM(`
        fn makeAdder(x) {
          fn add(y) {
            return x + y
          }
          return add
        }
        let add5 = makeAdder(5)
        print(add5(3))
        print(add5(10))
      `);
      expect(output).toEqual(['8', '15']);
    });
  });

  describe('Arrays', () => {
    it('should create and index arrays', () => {
      const { output } = runVM(`
        let arr = [10, 20, 30, 40, 50]
        print(arr[0])
        print(arr[2])
        print(arr[4])
      `);
      expect(output).toEqual(['10', '30', '50']);
    });

    it('should get array length', () => {
      const { output } = runVM(`
        let arr = [1, 2, 3, 4, 5]
        print(arr.length)
      `);
      expect(output).toEqual(['5']);
    });

    it('should handle nested arrays', () => {
      const { output } = runVM(`
        let matrix = [[1, 2], [3, 4]]
        print(matrix[0][0])
        print(matrix[1][1])
      `);
      expect(output).toEqual(['1', '4']);
    });
  });

  describe('Objects', () => {
    it('should create and access objects', () => {
      const { output } = runVM(`
        let person = {name: "Alice", age: 30}
        print(person.name)
        print(person.age)
      `);
      expect(output).toEqual(['Alice', '30']);
    });

    it('should set object properties', () => {
      const { output } = runVM(`
        let obj = {x: 1}
        obj.x = 42
        print(obj.x)
      `);
      expect(output).toEqual(['42']);
    });
  });

  describe('Classes', () => {
    it('should instantiate classes', () => {
      const { output } = runVM(`
        class Point {
          fn init(x, y) {
            this.x = x
            this.y = y
          }
          fn toStr() {
            return "(" + this.x + ", " + this.y + ")"
          }
        }
        let p = new Point(3, 4)
        print(p.toStr())
      `);
      expect(output).toEqual(['(3, 4)']);
    });

    it('should handle method calls', () => {
      const { output } = runVM(`
        class Calculator {
          fn init() {
            this.result = 0
          }
          fn add(n) {
            this.result += n
            return this
          }
          fn getResult() {
            return this.result
          }
        }
        let calc = new Calculator()
        calc.add(5)
        calc.add(3)
        print(calc.getResult())
      `);
      expect(output).toEqual(['8']);
    });
  });

  describe('Native Functions', () => {
    it('should call stdlib functions', () => {
      const { output } = runVM(`
        print(len([1, 2, 3]))
      `);
      expect(output).toEqual(['3']);
    });

    it('should call math functions', () => {
      const { output } = runVM(`
        print(abs(-5))
        print(max(3, 7))
        print(min(3, 7))
      `);
      expect(output).toEqual(['5', '7', '3']);
    });
  });

  describe('Optimized Execution', () => {
    it('should run optimized bytecode correctly', () => {
      const chunk = compileSource('print(2 + 3)');
      const optimized = optimize(chunk);
      const output: string[] = [];
      const vm = new VM({ output: (msg) => output.push(msg) });
      vm.run(optimized);
      expect(output).toEqual(['5']);
    });

    it('should produce correct results with constant folding', () => {
      const chunk = compileSource('print(10 * 20 + 5)');
      const optimized = optimize(chunk);
      const output: string[] = [];
      const vm = new VM({ output: (msg) => output.push(msg) });
      vm.run(optimized);
      expect(output).toEqual(['205']);
    });
  });

  describe('Error Handling', () => {
    it('should throw on undefined variables', () => {
      expect(() => runVM('print(undefined_var)')).toThrow(/not defined/);
    });

    it('should throw on calling non-function', () => {
      expect(() => runVM('let x = 42\nx()')).toThrow(/not callable/);
    });
  });

  describe('Serialization Roundtrip', () => {
    it('should serialize and deserialize simple programs', () => {
      const source = 'let x = 10\nlet y = 20\nprint(x + y)';
      const chunk = compileSource(source);
      const buffer = chunk.serialize();
      const restored = Chunk.deserialize(buffer);

      const output: string[] = [];
      const vm = new VM({ output: (msg) => output.push(msg) });
      vm.run(restored);
      expect(output).toEqual(['30']);
    });
  });

  describe('Stdlib Globals', () => {
    it('should have str() type conversion available', () => {
      const { output } = runVM('print(str(42))');
      expect(output).toEqual(['42']);
    });

    it('should have num() type conversion available', () => {
      const { output } = runVM('print(num("5"))');
      expect(output).toEqual(['5']);
    });

    it('should have bool() type conversion available', () => {
      const { output } = runVM('print(bool(1))');
      expect(output).toEqual(['true']);
    });

    it('should have keys() available', () => {
      const { output } = runVM('let k = keys({a: 1, b: 2})\nprint(len(k))');
      expect(output).toEqual(['2']);
    });

    it('should have values() available', () => {
      const { output } = runVM('let v = values({x: 1, y: 2})\nprint(len(v))');
      expect(output).toEqual(['2']);
    });

    it('should have entries() available', () => {
      const { output } = runVM('let e = entries({x: 1})\nprint(len(e))');
      expect(output).toEqual(['1']);
    });

    it('should have flatten() available', () => {
      const { output } = runVM('let f = flatten([[1,2],[3,4]])\nprint(len(f))');
      expect(output).toEqual(['4']);
    });

    it('should have zip() available', () => {
      const { output } = runVM('let z = zip([1,2],[3,4])\nprint(len(z))');
      expect(output).toEqual(['2']);
    });

    it('should have enumerate() available', () => {
      const { output } = runVM('let e = enumerate([10,20,30])\nprint(len(e))');
      expect(output).toEqual(['3']);
    });

    it('should have unique() available', () => {
      const { output } = runVM('let u = unique([1,2,2,3,3])\nprint(len(u))');
      expect(output).toEqual(['3']);
    });

    it('should have format() available', () => {
      const { output } = runVM('print(format("{} world", "hello"))');
      expect(output).toEqual(['hello world']);
    });

    it('should have clone() available', () => {
      const { output } = runVM('let c = clone([1,2,3])\nprint(len(c))');
      expect(output).toEqual(['3']);
    });

    it('should have padStart() available', () => {
      const { output } = runVM('print(padStart("5", 3, "0"))');
      expect(output).toEqual(['005']);
    });

    it('should have padEnd() available', () => {
      const { output } = runVM('print(padEnd("hi", 5, "."))');
      expect(output).toEqual(['hi...']);
    });

    it('should have isNull() available', () => {
      const { output } = runVM('print(isNull(null))');
      expect(output).toEqual(['true']);
    });

    it('should have isArray() available', () => {
      const { output } = runVM('print(isArray([1,2]))');
      expect(output).toEqual(['true']);
    });

    it('should have isString() available', () => {
      const { output } = runVM('print(isString("hi"))');
      expect(output).toEqual(['true']);
    });

    it('should have isNumber() available', () => {
      const { output } = runVM('print(isNumber(5))');
      expect(output).toEqual(['true']);
    });

    it('should have isFunction() available', () => {
      const { output } = runVM('print(isFunction(len))');
      expect(output).toEqual(['true']);
    });

    it('should have typeof() available', () => {
      const { output } = runVM('print(typeof(42))');
      expect(output).toEqual(['number']);
    });

    it('should have unshift() available', () => {
      const { output } = runVM('let a = [2,3]\nunshift(a, 1)\nprint(len(a))');
      expect(output).toEqual(['3']);
    });
  });
});
