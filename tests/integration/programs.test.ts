import { describe, it, expect } from 'vitest';
import { TinyLang } from '../../src/tinylang';

describe('Integration Tests - Complete Programs', () => {
  function runProgram(source: string): { output: string[]; success: boolean; error?: unknown } {
    const output: string[] = [];
    const tl = new TinyLang({ output: (msg) => output.push(msg) });
    const result = tl.run(source);
    return { output, success: result.success, error: result.error };
  }

  it('should run Fibonacci program', () => {
    const source = `
      fn fib(n) {
        if n <= 1 { return n }
        let a = 0
        let b = 1
        for i in 2..n + 1 {
          let temp = b
          b = a + b
          a = temp
        }
        return b
      }
      print(fib(0))
      print(fib(1))
      print(fib(10))
      print(fib(20))
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output).toEqual(['0', '1', '55', '6765']);
  });

  it('should run FizzBuzz program', () => {
    const source = `
      for i in 1..16 {
        if i % 15 == 0 {
          print("FizzBuzz")
        } else if i % 3 == 0 {
          print("Fizz")
        } else if i % 5 == 0 {
          print("Buzz")
        } else {
          print(i)
        }
      }
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output[0]).toBe('1');
    expect(output[2]).toBe('Fizz');
    expect(output[4]).toBe('Buzz');
    expect(output[14]).toBe('FizzBuzz');
  });

  it('should run class-based program', () => {
    const source = `
      class Shape {
        let name = ""
        fn init(name) { this.name = name }
        fn describe() { return this.name }
      }
      
      class Circle extends Shape {
        let radius = 0
        fn init(r) {
          this.name = "Circle"
          this.radius = r
        }
        fn area() {
          return PI * this.radius ** 2
        }
      }
      
      let c = new Circle(5)
      print(c.describe())
      print(floor(c.area()))
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output[0]).toBe('Circle');
    expect(output[1]).toBe('78');
  });

  it('should run higher-order function program', () => {
    const source = `
      let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      
      let evens = numbers.filter((n) => n % 2 == 0)
      let doubled = evens.map((n) => n * 2)
      let sum = doubled.reduce((acc, n) => acc + n, 0)
      
      print(evens)
      print(doubled)
      print(sum)
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output[0]).toBe('[2, 4, 6, 8, 10]');
    expect(output[1]).toBe('[4, 8, 12, 16, 20]');
    expect(output[2]).toBe('60');
  });

  it('should run closure-based counter', () => {
    const source = `
      fn makeCounter(start = 0) {
        let count = start
        let inc = fn() { count += 1; return count }
        let dec = fn() { count -= 1; return count }
        let val = fn() { return count }
        return {increment: inc, decrement: dec, value: val}
      }
      
      let c = makeCounter(10)
      print(c.increment())
      print(c.increment())
      print(c.decrement())
      print(c.value())
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    // Asserting the output, not just that it ran, is the whole point here: the
    // closures share one captured `count`, so a backend that captured it by
    // value would still "succeed" while printing 11, 11, 9, 10. This test
    // asserted only `success` for a long time and so missed exactly that bug in
    // the VM, where upvalues were copied instead of referenced.
    expect(output).toEqual(['11', '12', '11', '11']);
  });

  it('should run bubble sort program', () => {
    const source = `
      fn bubbleSort(arr) {
        let n = len(arr)
        let sorted = slice(arr, 0, n)
        for i in 0..n {
          for j in 0..n - i - 1 {
            if sorted[j] > sorted[j + 1] {
              let temp = sorted[j]
              sorted[j] = sorted[j + 1]
              sorted[j + 1] = temp
            }
          }
        }
        return sorted
      }
      
      let data = [64, 34, 25, 12, 22, 11, 90]
      print(bubbleSort(data))
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output[0]).toBe('[11, 12, 22, 25, 34, 64, 90]');
  });

  it('should run string manipulation program', () => {
    const source = `
      let sentence = "the quick brown fox jumps over the lazy dog"
      let words = split(sentence, " ")
      print(len(words))
      print(upper(join(slice(words, 0, 3), " ")))
      print(contains(sentence, "fox"))
      print(replace(sentence, "fox", "cat"))
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output[0]).toBe('9');
    expect(output[1]).toBe('THE QUICK BROWN');
    expect(output[2]).toBe('true');
    expect(output[3]).toBe('the quick brown cat jumps over the lazy dog');
  });

  it('should run nested loops with break', () => {
    const source = `
      let found = false
      for i in 1..10 {
        for j in 1..10 {
          if i * j == 42 {
            print("Found: " + str(i) + " * " + str(j) + " = 42")
            found = true
            break
          }
        }
        if found { break }
      }
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output[0]).toBe('Found: 6 * 7 = 42');
  });

  it('should run pattern matching program', () => {
    const source = `
      fn describe(x) {
        match x {
          when 0 => return "zero"
          when 1 => return "one"
          when 2 => return "two"
          else => return "many"
        }
      }
      print(describe(0))
      print(describe(1))
      print(describe(2))
      print(describe(99))
    `;
    const { output, success } = runProgram(source);
    expect(success).toBe(true);
    expect(output).toEqual(['zero', 'one', 'two', 'many']);
  });
});
