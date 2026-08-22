/**
 * Differential tests: interpreter vs. VM
 *
 * The tree-walk interpreter is the reference implementation. Any program must
 * produce byte-identical output through the bytecode compiler + VM.
 *
 * These tests exist because the VM previously shipped three correctness bugs
 * that a full suite of hand-written, VM-only assertions failed to catch:
 *
 *   1. `for` loop bodies were compiled without a scope, so a `let` inside the
 *      body leaked a stack slot every iteration and silently corrupted every
 *      subsequent local index (fib_iter(20) returned 53 instead of 6765).
 *   2. Array `map`/`filter` were stubs that ignored their callback and returned
 *      a copy of the receiver; `forEach`/`reduce`/`sort`/`join` returned null.
 *   3. A parse error whose preceding token was a NEWLINE spun forever because
 *      error recovery did not guarantee forward progress.
 *
 * Asserting the two backends against each other catches this entire class of
 * bug, which per-backend assertions structurally cannot.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import { Interpreter } from '../../src/interpreter';
import { registerStdlib } from '../../src/stdlib';
import { Compiler, optimize } from '../../src/compiler';
import { VM } from '../../src/vm';
import { Environment, stringify } from '../../src/types/values';

/** Run source through the tree-walk interpreter (the reference). */
function runInterpreter(source: string): string[] {
  const output: string[] = [];
  const program = new Parser(new Lexer(source).tokenize()).parse();
  const interpreter = new Interpreter({ output: (m) => output.push(m) });
  const env = interpreter.getGlobalEnvironment();
  registerStdlib(env, { output: (m) => output.push(m) });
  interpreter.executeInEnvironment(program, env);
  return output;
}

/** Run source through the bytecode compiler + VM. */
function runVM(source: string, useOptimizer = false): string[] {
  const output: string[] = [];
  const program = new Parser(new Lexer(source).tokenize()).parse();
  let chunk = new Compiler().compile(program);
  if (useOptimizer) {
    chunk = optimize(chunk);
  }
  const vm = new VM({ output: (m) => output.push(m) });
  vm.run(chunk);
  return output;
}

/**
 * Assert both backends agree. Also runs the VM with the optimizer enabled so
 * optimization passes cannot change observable behaviour.
 */
function expectAgreement(source: string): string[] {
  const expected = runInterpreter(source);
  expect(runVM(source), 'VM output must match interpreter').toEqual(expected);
  expect(
    runVM(source, true),
    'optimized VM output must match interpreter'
  ).toEqual(expected);
  return expected;
}

describe('Differential: interpreter vs VM', () => {
  describe('loop scoping (regression: leaked stack slots)', () => {
    it('agrees on a let declared inside a for body', () => {
      const out = expectAgreement(`
        let b = 1
        for i in 0..3 {
          let temp = b
          b = temp + 10
        }
        print(b)
      `);
      expect(out).toEqual(['31']);
    });

    it('agrees on iterative fibonacci (two mutated accumulators)', () => {
      const out = expectAgreement(`
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
        print(fib(10))
        print(fib(20))
        print(fib(30))
      `);
      expect(out).toEqual(['55', '6765', '832040']);
    });

    it('agrees with several locals per iteration', () => {
      expectAgreement(`
        let total = 0
        for i in 1..5 {
          let doubled = i * 2
          let tripled = i * 3
          total = total + doubled + tripled
        }
        print(total)
      `);
    });

    it('agrees on nested loops that both declare locals', () => {
      expectAgreement(`
        let acc = 0
        for i in 0..3 {
          let outer = i * 10
          for j in 0..3 {
            let inner = j
            acc = acc + outer + inner
          }
        }
        print(acc)
      `);
    });

    it('agrees on a while loop mutating an outer local', () => {
      expectAgreement(`
        let n = 1
        let steps = 0
        while n < 100 {
          let prev = n
          n = prev * 2
          steps = steps + 1
        }
        print(n)
        print(steps)
      `);
    });

    it('agrees on break and continue inside a scoped body', () => {
      expectAgreement(`
        let hits = 0
        for i in 0..10 {
          let v = i
          if v == 3 { continue }
          if v == 7 { break }
          hits = hits + 1
        }
        print(hits)
      `);
    });
  });

  describe('higher-order array methods (regression: stubbed callbacks)', () => {
    it('agrees on map', () => {
      const out = expectAgreement(`print([1,2,3].map((x) => x * 2))`);
      expect(out).toEqual(['[2, 4, 6]']);
    });

    it('agrees on filter', () => {
      const out = expectAgreement(
        `print([1,2,3,4,5,6].filter((x) => x % 2 == 0))`
      );
      expect(out).toEqual(['[2, 4, 6]']);
    });

    it('agrees on reduce with a seed', () => {
      const out = expectAgreement(
        `print([1,2,3,4,5].reduce((a, b) => a + b, 0))`
      );
      expect(out).toEqual(['15']);
    });

    it('agrees on reduce without a seed', () => {
      expectAgreement(`print([4,5,6].reduce((a, b) => a + b))`);
    });

    it('agrees on forEach side effects and ordering', () => {
      const out = expectAgreement(`
        ["a","b","c"].forEach((v, i) => {
          print(str(i) + ":" + v)
        })
      `);
      expect(out).toEqual(['0:a', '1:b', '2:c']);
    });

    it('agrees on a chained pipeline', () => {
      const out = expectAgreement(
        `print([1,2,3,4,5,6].filter((x) => x % 2 == 0).map((x) => x * x))`
      );
      expect(out).toEqual(['[4, 16, 36]']);
    });

    it('agrees on multi-line fluent chaining', () => {
      const out = expectAgreement(`
        let r = [1, 2, 3, 4, 5, 6]
          .filter((x) => x % 2 == 0)
          .map((x) => x * x)
        print(r)
      `);
      expect(out).toEqual(['[4, 16, 36]']);
    });

    it('agrees on sort, reverse, join, includes, indexOf', () => {
      expectAgreement(`
        let nums = [5, 2, 8, 1]
        print(nums.sort())
        print(nums.reverse())
        print(nums.join("-"))
        print(nums.includes(8))
        print(nums.indexOf(2))
      `);
    });

    it('agrees on push, pop, shift, unshift, length', () => {
      expectAgreement(`
        let s = [1, 2]
        s.push(3)
        print(s)
        print(s.pop())
        s.unshift(0)
        print(s)
        print(s.shift())
        print(s.length())
      `);
    });

    it('agrees on slice', () => {
      expectAgreement(`
        let a = [1,2,3,4,5]
        print(a.slice(1, 4))
        print(a.slice(2))
      `);
    });

    it('agrees when a callback closes over an outer variable', () => {
      expectAgreement(`
        let factor = 3
        print([1,2,3].map((x) => x * factor))
      `);
    });

    it('agrees on a callback that calls a named function', () => {
      expectAgreement(`
        fn square(x) { return x * x }
        print([1,2,3,4].map((x) => square(x)))
      `);
    });

    it('agrees on nested higher-order calls', () => {
      expectAgreement(`
        print([[1,2],[3,4]].map((row) => row.reduce((a, b) => a + b, 0)))
      `);
    });
  });

  describe('core semantics', () => {
    it('agrees on arithmetic and precedence', () => {
      expectAgreement(`
        print(2 + 3 * 4)
        print((2 + 3) * 4)
        print(2 ** 3 ** 2)
        print(17 % 5)
        print(-7 + 2)
      `);
    });

    it('agrees on string operations', () => {
      expectAgreement(`
        print("a" + "b" + "c")
        print(upper("hi"))
        print(len("hello"))
        print("  pad  ".trim())
      `);
    });

    it('agrees on closures and counters', () => {
      expectAgreement(`
        fn counter() {
          let n = 0
          return fn() { n = n + 1  return n }
        }
        let c = counter()
        print(c())
        print(c())
        print(c())
      `);
    });

    it('agrees on recursion', () => {
      expectAgreement(`
        fn fact(n) {
          if n <= 1 { return 1 }
          return n * fact(n - 1)
        }
        print(fact(10))
      `);
    });

    it('agrees on classes and inheritance', () => {
      expectAgreement(`
        class Animal {
          let name = ""
          fn init(n) { this.name = n }
          fn speak() { return this.name + " makes a sound" }
        }
        class Dog extends Animal {
          fn init(n) { this.name = n }
          fn speak() { return this.name + " barks" }
        }
        print(new Animal("Cat").speak())
        print(new Dog("Rex").speak())
      `);
    });

    it('agrees on conditionals', () => {
      expectAgreement(`
        fn grade(s) {
          if s >= 90 { return "A" }
          else if s >= 80 { return "B" }
          else { return "C" }
        }
        print(grade(95))
        print(grade(85))
        print(grade(70))
      `);
    });

    it('agrees on match statements', () => {
      expectAgreement(`
        fn name(n) {
          match n {
            when 1 => return "one"
            when 2 => return "two"
            else => return "many"
          }
        }
        print(name(1))
        print(name(2))
        print(name(9))
      `);
    });

    it('agrees on string interpolation', () => {
      expectAgreement(`
        let who = "world"
        let n = 21
        print(f"hello {who}, {n * 2}")
      `);
    });

    it('agrees on objects and property access', () => {
      expectAgreement(`
        let p = {name: "Ada", age: 36}
        print(p.name)
        print(p.age)
      `);
    });

    it('agrees on array indexing and mutation', () => {
      expectAgreement(`
        let a = [1,2,3]
        a[1] = 99
        print(a)
        print(a[0] + a[2])
      `);
    });

    it('agrees on compound assignment', () => {
      expectAgreement(`
        let x = 10
        x += 5
        x -= 3
        x *= 2
        print(x)
      `);
    });

    it('agrees on boolean logic and truthiness', () => {
      expectAgreement(`
        print(true and false)
        print(true or false)
        print(not true)
        print(1 < 2 and 3 >= 3)
      `);
    });
  });

  describe('example programs', () => {
    const examplesDir = path.join(__dirname, '..', '..', 'examples');

    // Programs excluded from differential comparison, each with a reason.
    // These must be justified: an unexplained exclusion hides a real bug.
    const skip = new Set<string>([
      // Non-deterministic between runs, so outputs cannot be compared.
      '15-game.tiny',
    ]);

    const files = fs.existsSync(examplesDir)
      ? fs
          .readdirSync(examplesDir)
          .filter((f) => f.endsWith('.tiny'))
          .sort()
      : [];

    it('finds example programs to compare', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
      const testFn = skip.has(file) ? it.skip : it;
      testFn(`${file} produces identical output on both backends`, () => {
        const source = fs.readFileSync(path.join(examplesDir, file), 'utf-8');

        let expected: string[];
        try {
          expected = runInterpreter(source);
        } catch (e) {
          // If the reference implementation cannot run it, there is nothing to
          // compare. Surface it rather than passing silently.
          throw new Error(
            `interpreter failed on ${file}: ${(e as Error).message}`
          );
        }

        expect(runVM(source), `VM diverged on ${file}`).toEqual(expected);
      });
    }
  });

  describe('determinism', () => {
    it('produces stable object key ordering across backends', () => {
      // The VM previously reversed insertion order when building objects.
      expectAgreement(`
        let o = {first: 1, second: 2, third: 3}
        print(o)
        print(keys(o))
      `);
    });

    it('produces identical output on repeated VM runs', () => {
      const src = `
        let a = []
        for i in 0..5 {
          let v = i * i
          push(a, v)
        }
        print(a)
      `;
      expect(runVM(src)).toEqual(runVM(src));
    });
  });
});
