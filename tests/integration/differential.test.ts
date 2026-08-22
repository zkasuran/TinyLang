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
import { StepLimitExceeded } from '../../src/types/values';

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

/**
 * Assert both backends abort with the same message.
 *
 * For programs whose whole point is that they fail, expectAgreement cannot be
 * used: it compares output, and neither engine produces any. The message is
 * still compared between the two, and pinned to `expectedMessage` so that "both
 * fail" cannot be satisfied by two engines failing for different reasons.
 */
function expectSameError(source: string, expectedMessage: string): void {
  const capture = (run: () => string[]): string => {
    try {
      run();
      return '<no error>';
    } catch (e) {
      return (e as Error).message;
    }
  };

  const fromInterpreter = capture(() => runInterpreter(source));
  expect(fromInterpreter).toBe(expectedMessage);
  expect(capture(() => runVM(source)), 'VM error must match interpreter').toBe(
    fromInterpreter
  );
  expect(
    capture(() => runVM(source, true)),
    'optimized VM error must match interpreter'
  ).toBe(fromInterpreter);
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
          return fn() { n = n + 1; return n }
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

  describe('break and continue (regression: unpatched jump placeholders)', () => {
    // `break`/`continue` used to emit a JMP with a 0xFFFF placeholder operand
    // that nothing ever patched, so the VM jumped to offset 65535 and read past
    // the end of the bytecode.
    it('agrees on break and continue in a while loop with body locals', () => {
      expectAgreement(`
        let i = 0
        let hits = 0
        while i < 10 {
          let v = i
          i = i + 1
          if v == 3 { continue }
          if v == 7 { break }
          hits = hits + 1
        }
        print(hits, i)
      `);
    });

    it('agrees on break in an inner nested loop', () => {
      expectAgreement(`
        let acc = 0
        for a in 0..4 {
          let base = a * 10
          for b in 0..4 {
            let inner = b
            if inner == 2 { break }
            acc = acc + base + inner
          }
        }
        print(acc)
      `);
    });

    it('agrees on continue in a nested loop', () => {
      expectAgreement(`
        let total = 0
        for a in 0..5 {
          let x = a
          if x % 2 == 0 { continue }
          for b in 0..3 {
            let y = b
            if y == 1 { continue }
            total = total + x * 10 + y
          }
        }
        print(total)
      `);
    });

    it('agrees on breaking a while nested inside a for', () => {
      expectAgreement(`
        let out = 0
        for a in 0..3 {
          let n = 0
          while true {
            let step = n
            n = n + 1
            if step > 2 { break }
            out = out + 1
          }
        }
        print(out)
      `);
    });
  });

  describe('default parameters', () => {
    // The VM padded missing arguments with null and the compiler emitted no
    // initialisers at all, so every defaulted parameter came through as null.
    it('agrees when a default is used, overridden, or passed null explicitly', () => {
      const out = expectAgreement(`
        fn greet(name, greeting = "Hello") {
          return greeting + ", " + name
        }
        print(greet("A"))
        print(greet("B", "Hi"))
        print(greet("C", null))
      `);
      // An explicitly passed null is not the same as an omitted argument.
      expect(out).toEqual(['Hello, A', 'Hi, B', 'null, C']);
    });

    it('agrees with several defaulted parameters', () => {
      expectAgreement(`
        fn three(a, b = 2, c = 3) { return str(a) + "/" + str(b) + "/" + str(c) }
        print(three(1))
        print(three(1, 9))
        print(three(1, 9, 8))
      `);
    });

    it('agrees on a closure over a defaulted parameter', () => {
      expectAgreement(`
        fn makeCounter(start = 0) {
          let count = start
          let inc = fn() {
            count += 1
            return count
          }
          return inc
        }
        let c = makeCounter()
        print(c())
        print(c())
        let t = makeCounter(10)
        print(t())
      `);
    });
  });

  describe('string interpolation', () => {
    it('agrees on literals, expressions and collections', () => {
      expectAgreement(`
        let who = "w"
        let n = 21
        let om = {a: 1, b: 2}
        print(f"hi {who}, {n * 2}")
        print(f"{n}")
        print(f"no interp")
        print(f"{who}{who}")
        print(f"arr {[1,2]} obj {om}")
      `);
    });

    it('interpolating a number alone still yields a string', () => {
      const out = expectAgreement(`
        let n = 42
        print(f"{n}" + "!")
      `);
      expect(out).toEqual(['42!']);
    });
  });

  describe('spread', () => {
    it('agrees on spreading arrays and strings in array literals', () => {
      expectAgreement(`
        let f1 = [1, 2]
        let f2 = [3, 4]
        print([...f1, ...f2])
        print([0, ...f1, 99, ...f2])
        print([..."abc"])
        print([...f1])
      `);
    });
  });

  describe('destructuring', () => {
    it('agrees on array and object patterns at top level', () => {
      expectAgreement(`
        let [d1, d2, d3] = [10, 20, 30]
        print(d1, d2, d3)
        let cfg = {host: "h", port: 1}
        let {host, port} = cfg
        print(host, port)
      `);
    });

    it('agrees on destructuring inside a function alongside other locals', () => {
      expectAgreement(`
        fn destr() {
          let [p, q] = [7, 8]
          let {host, port} = {host: "in", port: 2}
          let extra = p + q
          return str(p) + str(q) + host + str(port) + str(extra)
        }
        print(destr())
      `);
    });

    it('agrees that missing elements and keys destructure to null', () => {
      expectAgreement(`
        let [m1, m2, m3] = [1]
        print(m1, m2, m3)
        let {absent} = {present: 1}
        print(absent)
      `);
    });
  });

  describe('try / catch / throw', () => {
    it('agrees on a caught throw', () => {
      expectAgreement(`
        try {
          throw "boom"
        } catch e {
          print("caught:", e.message)
        }
      `);
    });

    it('agrees when returning from inside a try block', () => {
      // `return` skips TRY_END, so the handler has to be discarded when the
      // frame is popped or it leaks into the caller.
      expectAgreement(`
        fn safe(a, b) {
          try {
            if b == 0 { throw "div0" }
            return {v: a / b, e: null}
          } catch err {
            return {v: null, e: err.message}
          }
        }
        print(safe(10, 2).v)
        print(safe(10, 0).e)
      `);
    });

    it('agrees on nested try/catch and rethrow', () => {
      expectAgreement(`
        try {
          try {
            throw "inner"
          } catch e1 {
            print("inner caught:", e1.message)
            throw "rethrown"
          }
        } catch e2 {
          print("outer caught:", e2.message)
        }
      `);
    });

    it('agrees on catching runtime errors, message included', () => {
      // The VM used to return null for an out-of-range index where the
      // interpreter raises an error, so there was nothing to catch.
      expectAgreement(`
        try {
          let a = [1, 2, 3]
          let bad = a[99]
          print("unreachable")
        } catch e {
          print("index err:", e.message)
        }
        try {
          print(1 / 0)
        } catch e {
          print("div err:", e.message)
        }
      `);
    });

    it('agrees on a throw propagating through several calls', () => {
      expectAgreement(`
        fn deep3() { throw "from deep" }
        fn deep2() { return deep3() }
        fn deep1() { return deep2() }
        try {
          deep1()
        } catch e {
          print("propagated:", e.message)
        }
      `);
    });

    it('agrees on try/catch inside a loop', () => {
      expectAgreement(`
        let results = []
        for v in [4, -1, 9, -2] {
          try {
            if v < 0 { throw "neg" }
            push(results, v)
          } catch e {
            push(results, e.message)
          }
        }
        print(results)
      `);
    });

    it('agrees when a throw crosses a native array-method callback', () => {
      // The callback runs in a nested dispatch loop entered from native code,
      // so unwinding to a handler outside it has to happen as a real throw.
      expectAgreement(`
        try {
          print([1, 2, 3].map((x) => {
            if x == 2 { throw "cb" }
            return x
          }))
        } catch e {
          print("callback err:", e.message)
        }
      `);
    });

    it('agrees on break inside a try inside a loop', () => {
      expectAgreement(`
        let bt = 0
        for v in 0..6 {
          try {
            if v == 3 { break }
            bt = bt + 1
          } catch e {
            print("nope")
          }
        }
        print(bt)
      `);
    });
  });

  describe('property vs method resolution', () => {
    it('agrees on length as both a property and a method', () => {
      expectAgreement(`
        let la = [1, 2, 3]
        print(la.length)
        print(la.length())
        print("hey".length)
      `);
    });

    it('agrees on the full string method set', () => {
      expectAgreement(`
        print("a,b,c".split(","))
        print("  x  ".trim())
        print("Ab".upper(), "Ab".lower())
        print("hello".contains("ell"))
        print("hello".replace("l", "L"))
        print("hello".startsWith("he"), "hello".endsWith("lo"))
        print("hello".charAt(1))
        print("hello".indexOf("l"))
        print("hello".slice(1, 3))
        print("ab".repeat(3))
      `);
    });

    it('agrees on object builtin methods', () => {
      expectAgreement(`
        let om = {a: 1, b: 2}
        print(om.keys())
        print(om.values())
        print(om.has("a"), om.has("z"))
      `);
    });
  });

  describe('optional chaining and nullish coalescing', () => {
    it('agrees on ?. and ?? and ?.[]', () => {
      expectAgreement(`
        let maybe = null
        print(maybe?.foo)
        print(maybe?.foo ?? "fallback")
        let real = {foo: 1}
        print(real?.foo)
        print(real.foo ?? 99)
        let nul = {foo: null}
        print(nul.foo ?? "dflt")
        let oarr = [1, 2]
        print(oarr?.[0])
        print(oarr?.[99])
      `);
    });
  });

  describe('class property defaults', () => {
    it('agrees on declared defaults, including inherited ones', () => {
      // Defaults were stored on the class under a `__prop_` prefix, so the
      // program could never see them and read null instead.
      expectAgreement(`
        class Base {
          let kind = "base"
          let legs = 4
          fn init(name) { this.name = name }
          fn describe() { return this.name + "/" + this.kind + "/" + str(this.legs) }
        }
        class Sub extends Base {
          let extra = []
          fn init(name) { this.name = name }
        }
        print(new Base("b").describe())
        print(new Sub("s").describe())
      `);
    });
  });

  describe('compound assignment to elements and properties', () => {
    it('agrees on indexed compound assignment', () => {
      // The compiler emitted a stray DUP that left the index where SET_INDEX
      // expected the target object.
      const out = expectAgreement(`
        let arr = [1, 2, 3]
        arr[1] += 10
        arr[2] *= 3
        arr[0] -= 5
        print(arr)
      `);
      expect(out).toEqual(['[-4, 12, 9]']);
    });

    it('agrees on member compound assignment', () => {
      expectAgreement(`
        let o = {n: 5}
        o.n += 7
        print(o.n)
      `);
    });
  });

  describe('enums', () => {
    it('agrees on enum variant values', () => {
      expectAgreement(`
        enum Color {
          Red
          Green
          Blue
        }
        print(Color.Red, Color.Green, Color.Blue)
      `);
    });
  });

  describe('example programs', () => {
    const examplesDir = path.join(__dirname, '..', '..', 'examples');

    // Every example is compared. There are deliberately no exclusions: an
    // unexplained skip hides exactly the class of bug this file exists to
    // catch. 15-game.tiny was previously excluded as "non-deterministic",
    // which was simply wrong — it calls no random/time/input builtin and
    // hashes identically across repeated runs on both backends.
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
      it(`${file} produces identical output on both backends`, () => {
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

  describe('jumping out of a try block (regression: leaked catch handler)', () => {
    // `break`/`continue` skip the try's TRY_END. If the handler is not
    // uninstalled it stays armed at a stale stack height, so a *later*,
    // unrelated error is captured by a catch block that is no longer live.
    // These cases only mean anything because something throws after the loop.
    it('agrees when an error occurs after breaking out of a try', () => {
      // The later error must reach the *outer* handler. If the inner one leaked
      // it is still on top of the handler stack and would swallow it.
      const out = expectAgreement(`
        try {
          for i in [1, 2, 3] {
            try { print("in try", i); break } catch e { print("stale", e.message) }
          }
          print("after loop")
          let arr = [1, 2]
          print(arr[9])
        } catch outer {
          print("outer caught:", outer.message)
        }
      `);
      expect(out).toEqual([
        'in try 1',
        'after loop',
        'outer caught: Array index 9 is out of bounds. Array has 2 elements (valid indices: 0 to 1).',
      ]);
    });

    it('agrees when a throw follows a continue out of a try', () => {
      expectAgreement(`
        fn f() {
          for i in [1] {
            try { continue } catch e { print("stale", e.message) }
          }
          throw "real error"
        }
        try { f(); print("returned normally") } catch e { print("outer:", e.message) }
      `);
    });

    it('agrees when breaking out of two nested try blocks at once', () => {
      expectAgreement(`
        fn h() {
          for i in [1] {
            try {
              try { break } catch a { print("stale a") }
            } catch b { print("stale b") }
          }
          throw "post"
        }
        try { h() } catch e { print("h outer:", e.message) }
      `);
    });
  });

  describe('assignment evaluation order and semantics', () => {
    it('agrees that the right-hand side is evaluated before the target', () => {
      expectAgreement(`
        let a = [0, 0, 0]
        fn idx() { print("idx"); return 1 }
        fn val() { print("val"); return 7 }
        a[idx()] = val()
        print(a)
      `);
    });

    it('agrees that a compound assignment evaluates its target once', () => {
      expectAgreement(`
        let b = [0, 0, 0]
        fn idx() { print("idx"); return 1 }
        fn val() { print("val"); return 7 }
        b[idx()] += val()
        print(b)
      `);
    });

    it('agrees that x += f() reads x after f() runs', () => {
      const out = expectAgreement(`
        let x = 1
        fn bump() { x = 100; return 5 }
        x += bump()
        print(x)
      `);
      // 105, not 6: the current value is read only after bump() has assigned x.
      expect(out).toEqual(['105']);
    });

    it('agrees that compound assignment rejects non-numbers', () => {
      expectAgreement(`
        let t = "hi"
        try { t += "!"; print("concat ok", t) } catch e { print("concat:", e.message) }
        let z = 4
        try { z /= 0 } catch e { print("div:", e.message) }
        let arr = [1, 2]
        try { arr[5] += 1 } catch e { print("oob:", e.message) }
      `);
    });

    it('agrees on indexed assignment to a non-array', () => {
      expectAgreement(`
        let o = {a: 1}
        try { o["b"] = 2; print("set", o) } catch e { print("obj:", e.message) }
        let s = "abc"
        try { s[0] = "z" } catch e { print("str:", e.message) }
      `);
    });
  });

  describe('this binding', () => {
    it('agrees on this inside a closure nested in a method', () => {
      // `this` lives in the method's environment for the interpreter and is
      // captured lexically; the VM has to propagate the frame's binding into
      // closures created inside the method.
      const out = expectAgreement(`
        class Adder {
          fn init(k) { this.k = k }
          fn addAll(xs) { return xs.map(fn(x) { return x + this.k }) }
          fn addArrow(xs) { return xs.map((x) => x + this.k) }
        }
        let ad = new Adder(5)
        print(ad.addAll([1, 2]))
        print(ad.addArrow([1, 2]))
      `);
      expect(out).toEqual(['[6, 7]', '[6, 7]']);
    });
  });

  describe('diagnostics parity', () => {
    it('agrees on iterating a non-iterable', () => {
      expectAgreement(`
        try { for x in {a: 1} { print(x) } } catch e { print("obj:", e.message) }
        try { for x in 5 { print(x) } } catch e { print("num:", e.message) }
      `);
    });

    it('agrees on reading a property that does not exist', () => {
      expectAgreement(`
        try { print([1,2].push) } catch e { print("array:", e.message) }
        let n = 1
        try { print(n.foo) } catch e { print("number:", e.message) }
        let b = true
        try { print(b.foo) } catch e { print("boolean:", e.message) }
      `);
    });

    it('agrees on properties that do exist', () => {
      expectAgreement(`
        print([1,2,3].length)
        print("abc".length)
      `);
    });
  });

  describe('ranges', () => {
    // The VM's __range only ever counted upwards, so a descending range
    // silently produced an empty array and the loop body never ran, while the
    // interpreter iterated downwards. A silently skipped loop, not an error.
    it('agrees on descending ranges', () => {
      const out = expectAgreement(`
        for i in 5..1 { print(i) }
      `);
      expect(out).toEqual(['5', '4', '3', '2']);
    });

    it('agrees on ascending, empty and single-element ranges', () => {
      expectAgreement(`
        for i in 0..4 { print(i) }
        for i in 3..3 { print("never") }
        for i in 2..3 { print(i) }
      `);
    });

    it('agrees on negative bounds in both directions', () => {
      expectAgreement(`
        for i in -3..1 { print(i) }
        for i in 1..-3 { print(i) }
      `);
    });

    it('agrees on the oversized-range guard', () => {
      expectAgreement(`
        try {
          for i in 0..50000 { print(i) }
        } catch e {
          print("guard:", e.message)
        }
      `);
    });
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


/**
 * Divergences found by auditing the two engines against each other rather than
 * against their own tests. Each block names the engine that was wrong and why.
 */
describe('Differential: engine agreement audit', () => {
  describe('native builtin arity (VM did not check)', () => {
    it('agrees on too many arguments to a fixed-arity builtin', () => {
      // The VM ignored NativeFunctionValue.arity, so this returned 3.
      const out = expectAgreement(`
        try { print(abs(-3, 99)) } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([`caught: 'abs' expects 1 argument(s), but got 2`]);
    });

    it('agrees on too few arguments to a fixed-arity builtin', () => {
      const out = expectAgreement(`
        try { print(abs()) } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([`caught: 'abs' expects 1 argument(s), but got 0`]);
    });

    it('agrees that arity -1 builtins stay variadic', () => {
      expectAgreement(`
        print(max(1, 2, 3))
        print(min(4, 2))
        let a = [1, 2]
        push(a, 3)
        print(a)
      `);
    });

    it('agrees that builtin methods are not arity-checked', () => {
      // The interpreter's tryBuiltinMethod runs before its arity check, so the
      // VM must not be stricter here either.
      expectAgreement(`
        let a = [1, 2]
        print(a.length())
        print("a,b".split(","))
      `);
    });
  });

  describe('redeclaration in the same scope (VM silently overwrote)', () => {
    it('agrees that a second top-level let is an error', () => {
      const out = expectAgreement(`
        try {
          let x = 1
          let x = 2
          print(x)
        } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([`caught: Variable 'x' is already declared in this scope`]);
    });

    it('agrees that shadowing a stdlib name at top level is an error', () => {
      // Must be at top level: a `try` block is a nested scope, where shadowing
      // a global is legitimate in both engines (asserted below).
      expectSameError(
        `let abs = 1\nprint(abs)`,
        `Variable 'abs' is already declared in this scope`
      );
    });

    it('agrees that shadowing a stdlib name in a nested scope is allowed', () => {
      const out = expectAgreement(`
        if true { let abs = 1
          print(abs) }
        print(abs(-2))
      `);
      expect(out).toEqual(['1', '2']);
    });

    it('agrees that an uncaught redeclaration aborts with the same message', () => {
      expectSameError(
        `let x = 1\nlet x = 2\nprint(x)`,
        `Variable 'x' is already declared in this scope`
      );
    });

    it('agrees that a local shadowing a parameter is an error', () => {
      const out = expectAgreement(`
        fn f(a) { let a = 2
          return a }
        try { print(f(1)) } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([`caught: Variable 'a' is already declared in this scope`]);
    });

    it('agrees that redeclaring the loop variable is an error', () => {
      const out = expectAgreement(`
        try {
          for i in 0..2 { let i = 9
            print(i) }
        } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([`caught: Variable 'i' is already declared in this scope`]);
    });

    it('agrees that redeclaring the catch variable is an error', () => {
      const out = expectAgreement(`
        try {
          try { throw "boom" } catch e { let e = 1
            print(e) }
        } catch outer { print("caught:", outer.message) }
      `);
      expect(out).toEqual([`caught: Variable 'e' is already declared in this scope`]);
    });

    it('agrees that duplicate parameters are an error, reported at call time', () => {
      const out = expectAgreement(`
        fn dup(a, a) { return a }
        print("declared")
        try { print(dup(1, 2)) } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([
        'declared',
        `caught: Variable 'a' is already declared in this scope`,
      ]);
    });

    // The other side of the same coin: legitimate rebinding must keep working.
    it('agrees that shadowing in a nested scope is allowed', () => {
      const out = expectAgreement(`
        let z = 1
        if true { let z = 2
          print(z) }
        while z < 2 { let z = 5
          print(z)
          break }
        print(z)
      `);
      expect(out).toEqual(['2', '5', '1']);
    });

    it('agrees that a loop body rebinds its own local every iteration', () => {
      const out = expectAgreement(`
        let sum = 0
        for i in 0..4 {
          let step = i * 2
          sum = sum + step
        }
        print(sum)
        let j = 0
        while j < 3 {
          let step = j + 1
          print(step)
          j = j + 1
        }
      `);
      expect(out).toEqual(['12', '1', '2', '3']);
    });

    it('agrees that a redeclaration in a branch never taken is never reported', () => {
      const out = expectAgreement(`
        if false { let q = 1
          let q = 2 }
        print("fine")
      `);
      expect(out).toEqual(['fine']);
    });

    it('agrees that sibling blocks may each declare the same name', () => {
      const out = expectAgreement(`
        if true { let s = 1
          print(s) }
        if true { let s = 2
          print(s) }
      `);
      expect(out).toEqual(['1', '2']);
    });

    it('agrees that assignment after declaration is not a redeclaration', () => {
      const out = expectAgreement(`
        let v = 1
        v = 2
        v += 3
        print(v)
      `);
      expect(out).toEqual(['5']);
    });
  });

  /**
   * `const` was enforced by the interpreter and completely ignored by the VM:
   *
   *     const RATE = 3.14
   *     RATE = 99          // interpreter: throws. VM: RATE becomes 99.
   *
   * at top level and inside functions alike. As with redeclaration, the report
   * happens when execution *reaches* the assignment - a violation inside
   * `if false { }` is never reported, and one inside `try` is catchable - so the
   * VM raises at that point instead of failing to compile.
   */
  describe('const enforcement (VM ignored it entirely)', () => {
    const MESSAGE = (name: string): string => `Cannot reassign constant '${name}'`;

    it('agrees that reassigning a top-level const is an error', () => {
      expectSameError(`const RATE = 3.14\nRATE = 99\nprint(RATE)`, MESSAGE('RATE'));
    });

    it('agrees that reassigning a const inside a function is an error', () => {
      expectSameError(
        `fn f() {\n  const INNER = 1\n  INNER = 2\n  print(INNER)\n}\nf()`,
        MESSAGE('INNER')
      );
    });

    it('agrees that reassigning a const in a nested scope is an error', () => {
      expectSameError(
        `fn f() {\n  if true {\n    const C = 1\n    C = 2\n  }\n}\nf()`,
        MESSAGE('C')
      );
    });

    it('agrees that a nested scope cannot reassign a top-level const', () => {
      expectSameError(`const C = 1\nif true {\n  C = 2\n}\nprint(C)`, MESSAGE('C'));
    });

    it('agrees that a loop body cannot reassign its own const', () => {
      expectSameError(`for i in 0..3 {\n  const C = i\n  C = 9\n}`, MESSAGE('C'));
    });

    it('agrees that compound assignment to a const is an error', () => {
      expectSameError(`const RATE = 1\nRATE += 1\nprint(RATE)`, MESSAGE('RATE'));
      expectSameError(`fn f() {\n  const R = 1\n  R *= 2\n}\nf()`, MESSAGE('R'));
    });

    it('agrees that a closure cannot reassign a captured const', () => {
      expectSameError(
        `fn outer() {\n  const C = 1\n  fn inner() {\n    C = 2\n  }\n  inner()\n}\nouter()`,
        MESSAGE('C')
      );
    });

    it('agrees that a closure two levels deep cannot reassign it either', () => {
      // The upvalue is captured through an intermediate function, so constness
      // has to travel with the capture rather than being read off the local.
      expectSameError(
        `fn a() {\n  const C = 1\n  fn b() {\n    fn c() {\n      C = 9\n    }\n    c()\n  }\n  b()\n}\na()`,
        MESSAGE('C')
      );
    });

    it('agrees that destructured const bindings are constant', () => {
      expectSameError(`const [a, b] = [1, 2]\na = 5\nprint(b)`, MESSAGE('a'));
      expectSameError(`const {x} = {x: 1}\nx = 5`, MESSAGE('x'));
      expectSameError(`fn f() {\n  const [a] = [1]\n  a = 2\n}\nf()`, MESSAGE('a'));
    });

    it('agrees that an enum binding is constant', () => {
      expectSameError(`enum Color {\n  Red\n  Green\n}\nColor = 1`, MESSAGE('Color'));
      expectSameError(`fn f() {\n  enum E {\n    A\n  }\n  E = 1\n}\nf()`, MESSAGE('E'));
    });

    it('agrees that a const violation in a branch never taken is never reported', () => {
      expect(
        expectAgreement(`const C = 1\nif false {\n  C = 2\n}\nprint("reached")`)
      ).toEqual(['reached']);
      expect(
        expectAgreement(
          `fn f() {\n  const C = 1\n  if false {\n    C = 2\n  }\n  print("reached")\n}\nf()`
        )
      ).toEqual(['reached']);
    });

    it('agrees that a const violation inside try is catchable', () => {
      expect(
        expectAgreement(
          `const C = 1\ntry {\n  C = 2\n} catch e {\n  print("caught:", e.message)\n}\nprint(C)`
        )
      ).toEqual([`caught: ${MESSAGE('C')}`, '1']);
      expect(
        expectAgreement(
          `fn f() {\n  const C = 1\n  try {\n    C = 2\n  } catch e {\n    print("caught:", e.message)\n  }\n  print(C)\n}\nf()`
        )
      ).toEqual([`caught: ${MESSAGE('C')}`, '1']);
    });

    it('agrees that the right-hand side is evaluated before the error', () => {
      // Both engines evaluate the value and only then refuse the store, so a
      // side effect in the value expression is observable before the failure.
      // Pinning it keeps the VM's raise from drifting earlier than the
      // interpreter's check.
      const source = `fn side() {\n  print("evaluated")\n  return 1\n}\nconst C = 0\nC = side()`;

      const outcomeOf = (run: (sink: (m: string) => void) => void) => {
        const output: string[] = [];
        try {
          run((m) => output.push(m));
          return { output, message: '<no error>' };
        } catch (e) {
          return { output, message: (e as Error).message };
        }
      };

      const fromInterpreter = outcomeOf((sink) => {
        const program = new Parser(new Lexer(source).tokenize()).parse();
        const interpreter = new Interpreter({ output: sink });
        const env = interpreter.getGlobalEnvironment();
        registerStdlib(env, { output: sink });
        interpreter.executeInEnvironment(program, env);
      });
      const fromVM = outcomeOf((sink) => {
        const program = new Parser(new Lexer(source).tokenize()).parse();
        new VM({ output: sink }).run(new Compiler().compile(program));
      });

      expect(fromInterpreter).toEqual({ output: ['evaluated'], message: MESSAGE('C') });
      expect(fromVM, 'VM must fail at the same point with the same message').toEqual(
        fromInterpreter
      );
    });

    // The other side of the coin: everything that is *not* a const reassignment
    // must keep working, or "enforcement" is just a new way to reject valid code.
    it('agrees that let is still freely reassignable', () => {
      expect(expectAgreement(`let x = 1\nx = 2\nx += 3\nprint(x)`)).toEqual(['5']);
      expect(
        expectAgreement(`fn f() {\n  let x = 1\n  x = 2\n  x -= 1\n  print(x)\n}\nf()`)
      ).toEqual(['1']);
      expect(expectAgreement(`let [a, b] = [1, 2]\na = 5\nprint(a, b)`)).toEqual(['5 2']);
    });

    it('agrees that a let may shadow a const and be reassigned', () => {
      expect(
        expectAgreement(
          `const C = 1\nfn f() {\n  let C = 5\n  C = 6\n  print(C)\n}\nf()\nprint(C)`
        )
      ).toEqual(['6', '1']);
    });

    it('agrees that a parameter shadowing a const is assignable', () => {
      expect(
        expectAgreement(`const P = 1\nfn f(P) {\n  P = 2\n  return P\n}\nprint(f(5))\nprint(P)`)
      ).toEqual(['2', '1']);
    });

    it('agrees that a const is rebound freshly on each loop iteration', () => {
      expect(expectAgreement(`for i in 0..3 {\n  const C = i\n  print(C)\n}`)).toEqual([
        '0',
        '1',
        '2',
      ]);
    });

    it('agrees that function and class names are not constant', () => {
      expect(expectAgreement(`fn f() {\n  return 1\n}\nf = 2\nprint(f)`)).toEqual(['2']);
      expect(
        expectAgreement(`class K {\n  fn init() {\n    this.v = 1\n  }\n}\nK = 2\nprint(K)`)
      ).toEqual(['2']);
    });

    it('agrees that a const binding still allows mutating what it points at', () => {
      expect(expectAgreement(`const O = {v: 1}\nO.v = 2\nprint(O.v)`)).toEqual(['2']);
      expect(expectAgreement(`const A = [1]\nA[0] = 9\nprint(A)`)).toEqual(['[9]']);
    });
  });

  describe('detached methods and unbound this (VM bound this implicitly)', () => {
    const CLS = `
      class Counter {
        let n = 0
        fn init(v) { this.n = v }
        fn get() { return this.n }
      }
    `;

    it('agrees that reading a method yields the method itself', () => {
      // The VM rendered this as '<unknown>'.
      const out = expectAgreement(CLS + `
        let c = new Counter(3)
        print(c.get)
      `);
      expect(out).toEqual(['<fn get>']);
    });

    it('agrees that calling a detached method fails', () => {
      // The VM attached the receiver when the property was read, so this worked
      // there and threw in the interpreter.
      const out = expectAgreement(CLS + `
        let c = new Counter(3)
        let m = c.get
        try { print(m()) } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([`caught: Variable 'this' is not defined. Did you mean 'trim'?`]);
    });

    it('agrees that a normal method call still binds the receiver', () => {
      const out = expectAgreement(CLS + `
        let c = new Counter(3)
        print(c.get())
        print(c.n)
      `);
      expect(out).toEqual(['3', '3']);
    });

    it('agrees that this outside a method is an undefined variable', () => {
      // The VM pushed null, so `this` read as a legitimate null.
      const out = expectAgreement(`
        try { print(this) } catch e { print("caught:", e.message) }
        fn plain() { return this }
        try { print(plain()) } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([
        `caught: Variable 'this' is not defined. Did you mean 'trim'?`,
        `caught: Variable 'this' is not defined. Did you mean 'trim'?`,
      ]);
    });

    it('agrees that a function nested in a method still sees this', () => {
      const out = expectAgreement(`
        class Holder {
          let v = 7
          fn run() { let inner = fn() { return this.v }
            return inner() }
        }
        print(new Holder().run())
      `);
      expect(out).toEqual(['7']);
    });

    it('agrees on how a plain function value prints', () => {
      const out = expectAgreement(`
        fn named(x) { return x }
        let anon = fn(x) { return x }
        print(named)
        print(anon)
      `);
      expect(out).toEqual(['<fn named>', '<fn <anonymous>>']);
    });

    it('agrees on the undefined-variable message, hint included', () => {
      // The VM omitted the "Did you mean?" suggestion entirely.
      const out = expectAgreement(`
        try { print(abz) } catch e { print("caught:", e.message) }
        try { print(zzzzqqqq) } catch e { print("caught:", e.message) }
      `);
      expect(out).toEqual([
        `caught: Variable 'abz' is not defined. Did you mean 'abs'?`,
        `caught: Variable 'zzzzqqqq' is not defined. Did you forget to declare it with 'let' or 'const'?`,
      ]);
    });
  });

  describe('ternary expressions (previously unreachable dead code)', () => {
    it('agrees on the basic form', () => {
      const out = expectAgreement(`
        print(true ? "yes" : "no")
        print(false ? "yes" : "no")
      `);
      expect(out).toEqual(['yes', 'no']);
    });

    it('agrees on right-associative chaining', () => {
      const out = expectAgreement(`
        fn name(n) { return n == 1 ? "one" : n == 2 ? "two" : "many" }
        print(name(1), name(2), name(9))
      `);
      expect(out).toEqual(['one two many']);
    });

    it('agrees on TinyLang truthiness in the condition', () => {
      const out = expectAgreement(`
        print(0 ? "t" : "f")
        print("" ? "t" : "f")
        print(null ? "t" : "f")
        print([] ? "t" : "f")
        print(1 ? "t" : "f")
        print("x" ? "t" : "f")
      `);
      // An empty array is falsy in TinyLang, and both engines agree on that.
      expect(out).toEqual(['f', 'f', 'f', 'f', 't', 't']);
    });

    it('agrees that only the taken arm is evaluated', () => {
      const out = expectAgreement(`
        let calls = []
        fn note(tag) { push(calls, tag)
          return tag }
        print(true ? note("a") : note("b"))
        print(false ? note("c") : note("d"))
        print(calls)
      `);
      expect(out).toEqual(['a', 'd', '[a, d]']);
    });

    it('agrees when nested inside other expressions', () => {
      const out = expectAgreement(`
        let arr = [10, 20]
        print(arr[true ? 0 : 1])
        print({a: true ? 1 : 2, b: false ? 3 : 4})
        print([true ? 1 : 2, false ? 3 : 4])
        print("v=" + (5 > 0 ? "pos" : "neg"))
        fn pick(a, b) { return a > b ? a : b }
        print(pick(3, 9))
      `);
      expect(out).toEqual(['10', '{a: 1, b: 4}', '[1, 4]', 'v=pos', '9']);
    });

    it('agrees on precedence against assignment, ?? and |>', () => {
      const out = expectAgreement(`
        let x = 0
        x = true ? 7 : 8
        print(x)
        let missing = null
        print(missing ?? 1 ? "t" : "f")
        fn dbl(v) { return v * 2 }
        print(3 |> dbl ? "t" : "f")
      `);
      expect(out).toEqual(['7', 't', 't']);
    });

    it('agrees when an arm contains an assignment', () => {
      const out = expectAgreement(`
        let y = 0
        let z = true ? y = 3 : 4
        print(y, z)
      `);
      expect(out).toEqual(['3 3']);
    });

    it('agrees that ?? and ?. still lex and behave as before', () => {
      const out = expectAgreement(`
        let a = null
        print(a ?? "dflt")
        let o = {x: 1}
        print(o?.x)
        print(a?.x ?? "none")
      `);
      expect(out).toEqual(['dflt', '1', 'none']);
    });

    it('agrees when an arm throws', () => {
      const out = expectAgreement(`
        try { print(true ? 1 / 0 : 2) } catch e { print("caught:", e.message) }
      `);
      expect(out.length).toBe(1);
      expect(out[0].startsWith('caught:')).toBe(true);
    });
  });

  describe('step limit is uncatchable in both engines', () => {
    /**
     * expectAgreement cannot be used here: neither engine returns, both throw.
     * The two are compared on the class and message of the throw instead, with
     * an equal budget so the message (which names the budget) is comparable.
     */
    const LIMIT = 20_000;

    function runToLimit(
      source: string,
      backend: 'interpreter' | 'vm'
    ): { output: string[]; error: unknown } {
      const output: string[] = [];
      const program = new Parser(new Lexer(source).tokenize()).parse();
      try {
        if (backend === 'interpreter') {
          const interpreter = new Interpreter({
            output: (m) => output.push(m),
            maxSteps: LIMIT,
          });
          const env = interpreter.getGlobalEnvironment();
          registerStdlib(env, { output: (m) => output.push(m) });
          interpreter.executeInEnvironment(program, env);
        } else {
          const chunk = new Compiler().compile(program);
          new VM({ output: (m) => output.push(m), maxSteps: LIMIT }).run(chunk);
        }
        return { output, error: null };
      } catch (e) {
        return { output, error: e };
      }
    }

    function expectSameLimitFailure(source: string): void {
      const a = runToLimit(source, 'interpreter');
      const b = runToLimit(source, 'vm');

      expect(a.error, 'interpreter must hit the step limit').toBeInstanceOf(
        StepLimitExceeded
      );
      expect(b.error, 'VM must hit the step limit').toBeInstanceOf(StepLimitExceeded);
      expect((b.error as Error).message, 'same message').toBe(
        (a.error as Error).message
      );
      expect(b.output, 'same output before the limit').toEqual(a.output);
    }

    it('a catch inside the runaway loop cannot swallow the limit', () => {
      // The interpreter used to raise a plain RuntimeError here, so the catch
      // caught it and the loop then spun forever.
      expectSameLimitFailure(`
        let i = 0
        while true {
          try { i = i + 1 } catch e { print("swallowed") }
        }
      `);
    });

    it('a catch outside the runaway loop cannot swallow the limit either', () => {
      expectSameLimitFailure(`
        try {
          let i = 0
          while true { i = i + 1 }
        } catch e { print("outer caught:", e.message) }
        print("continued")
      `);
    });

    it('a runaway loop inside a function is not catchable', () => {
      expectSameLimitFailure(`
        fn spin() {
          let i = 0
          while true {
            try { i = i + 1 } catch e { print("swallowed") }
          }
          return i
        }
        try { print(spin()) } catch e { print("caught:", e.message) }
      `);
    });

    it('a runaway nested loop is not catchable', () => {
      expectSameLimitFailure(`
        let i = 0
        while true {
          let j = 0
          while j < 10 {
            try { j = j + 1 } catch e { print("swallowed") }
          }
          i = i + 1
        }
      `);
    });

    it('ordinary runtime errors are still catchable in both engines', () => {
      const out = expectAgreement(`
        try { let a = [1]
          print(a[9]) } catch e { print("caught:", e.message) }
        try { print(1 / 0) } catch e { print("div:", e.message) }
        print("still running")
      `);
      expect(out.length).toBe(3);
      expect(out[0].startsWith('caught:')).toBe(true);
      expect(out[2]).toBe('still running');
    });
  });

  /**
   * The VM captured upvalues by value: OpCode.CLOSURE copied whatever was in the
   * enclosing local's stack slot into the closure, and STORE_UPVALUE then wrote
   * to that private copy. So a closure could read an enclosing variable but
   * never write one, and two closures over the same variable each got their own
   * snapshot.
   *
   *     fn outer() {
   *       let c = 1
   *       fn inner() { c = 2 }
   *       inner()
   *       print(c)      // interpreter 2, VM 1
   *     }
   *
   * Upvalues are now open while the owning slot is live -- reads and writes go
   * through the stack, so there is one storage location shared by the owning
   * frame and every closure -- and closed when that slot dies, lifting the value
   * out so a closure that outlives its frame keeps working.
   */
  describe('closures writing to enclosing variables (VM captured by value)', () => {
    it('a closure assigning to an enclosing local is seen by the enclosing frame', () => {
      expect(
        expectAgreement(`
          fn outer() {
            let c = 1
            fn inner() { c = 2 }
            inner()
            print(c)
          }
          outer()
        `)
      ).toEqual(['2']);
    });

    it('a counter closure accumulates across calls instead of resetting', () => {
      expect(
        expectAgreement(`
          fn makeCounter() {
            let n = 0
            fn inc() {
              n = n + 1
              return n
            }
            return inc
          }
          let next = makeCounter()
          print(next())
          print(next())
          print(next())
        `)
      ).toEqual(['1', '2', '3']);
    });

    it('two counters from the same factory do not share state', () => {
      expect(
        expectAgreement(`
          fn makeCounter() {
            let n = 0
            fn inc() {
              n = n + 1
              return n
            }
            return inc
          }
          let a = makeCounter()
          let b = makeCounter()
          print(a())
          print(a())
          print(b())
        `)
      ).toEqual(['1', '2', '1']);
    });

    it('two closures over one variable share it: a write through one is read through the other', () => {
      expect(
        expectAgreement(`
          fn pair() {
            let v = 0
            fn set() { v = 42 }
            fn get() { return v }
            print(get())
            set()
            print(get())
          }
          pair()
        `)
      ).toEqual(['0', '42']);
    });

    it('sharing survives the defining frame returning, which is what closing is for', () => {
      expect(
        expectAgreement(`
          fn make() {
            let s = "start"
            fn get() { return s }
            fn set(x) { s = x }
            return [get, set]
          }
          let fns = make()
          let get = fns[0]
          let set = fns[1]
          print(get())
          set("changed")
          print(get())
          set("again")
          print(get())
        `)
      ).toEqual(['start', 'changed', 'again']);
    });

    it('an escaped closure still writes to its captured variable after the frame is gone', () => {
      expect(
        expectAgreement(`
          fn make() {
            let n = 10
            fn bump() {
              n = n + 5
              return n
            }
            return bump
          }
          let bump = make()
          print(bump())
          print(bump())
        `)
      ).toEqual(['15', '20']);
    });

    it('one closure per loop iteration captures that iteration\u2019s binding', () => {
      expect(
        expectAgreement(`
          let fs = []
          for i in 0..4 {
            let captured = i * 10
            fn f() { return captured }
            fs = fs + [f]
          }
          for f in fs {
            print(f())
          }
        `)
      ).toEqual(['0', '10', '20', '30']);
    });

    it('a per-iteration closure can also write to its own binding', () => {
      expect(
        expectAgreement(`
          let fs = []
          for i in 0..3 {
            let n = i
            fn bump() {
              n = n + 100
              return n
            }
            fs = fs + [bump]
          }
          for f in fs {
            print(f())
            print(f())
          }
        `)
      ).toEqual(['100', '200', '101', '201', '102', '202']);
    });

    it('a closure writes through two levels of nesting', () => {
      expect(
        expectAgreement(`
          fn a() {
            let x = 1
            fn b() {
              fn c() { x = 99 }
              c()
            }
            b()
            print(x)
          }
          a()
        `)
      ).toEqual(['99']);
    });

    it('three levels of nesting each read and write the outermost binding', () => {
      expect(
        expectAgreement(`
          fn level1() {
            let acc = ""
            fn level2() {
              acc = acc + "2"
              fn level3() {
                acc = acc + "3"
                fn level4() { acc = acc + "4" }
                level4()
              }
              level3()
            }
            level2()
            print(acc)
          }
          level1()
        `)
      ).toEqual(['234']);
    });

    it('a closure passed to forEach writes to the enclosing accumulator', () => {
      expect(
        expectAgreement(`
          fn total(xs) {
            let sum = 0
            xs.forEach(fn(v) { sum = sum + v })
            return sum
          }
          print(total([1, 2, 3, 4]))
        `)
      ).toEqual(['10']);
    });

    it('a native callback re-entering the VM still closes upvalues per frame', () => {
      expect(
        expectAgreement(`
          fn collect(xs) {
            let fs = []
            xs.forEach(fn(v) {
              let own = v * 2
              fn get() { return own }
              fs = fs + [get]
            })
            return fs
          }
          for f in collect([1, 2, 3]) {
            print(f())
          }
        `)
      ).toEqual(['2', '4', '6']);
    });

    it('a closure captured inside a method writes to the method\u2019s local', () => {
      expect(
        expectAgreement(`
          class Tally {
            fn init() { this.items = [1, 2, 3] }
            fn sum() {
              let s = 0
              this.items.forEach(fn(v) { s = s + v })
              return s
            }
          }
          print(new Tally().sum())
        `)
      ).toEqual(['6']);
    });

    it('a write through an upvalue inside a try block survives the catch', () => {
      expect(
        expectAgreement(`
          fn f() {
            let n = 0
            fn bump() {
              n = n + 1
              throw "boom"
            }
            try { bump() } catch e { print("caught " + e.message) }
            print(n)
          }
          f()
        `)
      ).toEqual(['caught boom', '1']);
    });

    it('an escaped closure survives an error unwinding the frame that made it', () => {
      expect(
        expectAgreement(`
          let saved = null
          fn make() {
            let n = 7
            fn get() { return n }
            saved = get
            throw "abort"
          }
          try { make() } catch e { print("caught") }
          print(saved())
        `)
      ).toEqual(['caught', '7']);
    });

    it('reassigning an enclosing const through a closure is still rejected', () => {
      expectSameError(
        `fn outer() {\n  const C = 1\n  fn inner() { C = 2 }\n  inner()\n}\nouter()`,
        `Cannot reassign constant 'C'`
      );
    });

    it('a compound assignment through a closure reaches the enclosing variable', () => {
      expect(
        expectAgreement(`
          fn outer() {
            let n = 1
            fn inner() { n += 41 }
            inner()
            print(n)
          }
          outer()
        `)
      ).toEqual(['42']);
    });

    it('a closure capturing a parameter writes to the caller\u2019s frame slot', () => {
      expect(
        expectAgreement(`
          fn outer(n) {
            fn inner() { n = n * 2 }
            inner()
            inner()
            print(n)
          }
          outer(3)
        `)
      ).toEqual(['12']);
    });

    it('recursion does not let two invocations share one captured variable', () => {
      expect(
        expectAgreement(`
          fn rec(depth) {
            let mine = depth
            fn bump() { mine = mine + 100 }
            if depth > 0 {
              rec(depth - 1)
            }
            bump()
            print(mine)
          }
          rec(2)
        `)
      ).toEqual(['100', '101', '102']);
    });
  });

  /**
   * OpCode.STORE_GLOBAL is assignment; a top-level declaration compiles to
   * DECLARE_GLOBAL or DECLARE_CONST_GLOBAL. STORE_GLOBAL nevertheless did a
   * plain `globals.set`, so assigning to a name that had never been declared
   * created it:
   *
   *     x = 5
   *     print(x)      // interpreter: not defined, VM: 5
   *
   * which means a misspelling silently became a second variable. `cont = 0` for
   * `count = 0` reported nothing and left `count` alone. The reference
   * implementation's Environment.assign walks the scope chain and throws when it
   * finds nothing, so STORE_GLOBAL now rejects an unbound name using the shared
   * undefinedVariableMessage() and the suggestion comes out identical.
   */
  describe('assignment to an undeclared global (VM created it silently)', () => {
    const NOT_DEFINED = (name: string, suggestion: string): string =>
      `Variable '${name}' is not defined. Did you mean '${suggestion}'?`;

    it('agrees that assigning to an undeclared name is an error', () => {
      expectSameError(`x = 5\nprint(x)`, NOT_DEFINED('x', 'E'));
    });

    it('agrees on the suggestion when the name is a near-miss for a real one', () => {
      expectSameError(`let count = 0\ncont = 5\nprint(count)`, NOT_DEFINED('cont', 'count'));
    });

    it('agrees that compound assignment to an undeclared name is an error', () => {
      expectSameError(`x += 1\nprint(x)`, NOT_DEFINED('x', 'E'));
    });

    it('agrees on a different compound operator too', () => {
      expectSameError(`total *= 2`, NOT_DEFINED('total', 'tan'));
    });

    it('agrees that assigning to an undeclared name inside a function is an error', () => {
      expectSameError(`fn f() {\n  y = 3\n}\nf()`, NOT_DEFINED('y', 'E'));
    });

    it('agrees that a closure assigning to an undeclared name is an error', () => {
      expectSameError(`fn f() {\n  fn g() { hhh = 2 }\n  g()\n}\nf()`, NOT_DEFINED('hhh', 'hash'));
    });

    it('agrees the error is reported only when execution reaches it', () => {
      expect(
        expectAgreement(`
          if false {
            zzz = 1
          }
          print("ok")
        `)
      ).toEqual(['ok']);
    });

    it('agrees the error is catchable, with the same message in the catch', () => {
      expect(
        expectAgreement(`try { qqq = 1 } catch e { print(e.message) }`)
      ).toEqual([NOT_DEFINED('qqq', 'abs')]);
    });

    it('declared globals are still freely assignable', () => {
      expect(expectAgreement(`let a = 1\na = 2\nprint(a)`)).toEqual(['2']);
    });

    it('declared globals still accept compound assignment', () => {
      expect(expectAgreement(`let a = 1\na += 5\na *= 2\nprint(a)`)).toEqual(['12']);
    });

    it('a global declared as a function or class is still assignable', () => {
      expect(expectAgreement(`fn g() { return 1 }\ng = 5\nprint(g)`)).toEqual(['5']);
      expect(
        expectAgreement(`class K { fn init() {} }\nK = 3\nprint(K)`)
      ).toEqual(['3']);
    });

    it('a destructured global is still assignable', () => {
      expect(expectAgreement(`let [a, b] = [1, 2]\na = 9\nprint(a + b)`)).toEqual(['11']);
    });

    it('locals are still freely assignable', () => {
      expect(
        expectAgreement(`fn f() {\n  let n = 1\n  n = 2\n  return n\n}\nprint(f())`)
      ).toEqual(['2']);
    });

    it('a shadowing local is assignable without touching the outer binding', () => {
      expect(
        expectAgreement(`let v = 1\nif true {\n  let v = 2\n  v = 3\n  print(v)\n}\nprint(v)`)
      ).toEqual(['3', '1']);
    });

    it('a loop variable is still bound on every iteration', () => {
      expect(expectAgreement(`for i in 0..3 {\n  print(i)\n}`)).toEqual(['0', '1', '2']);
      expect(
        expectAgreement(`let xs = [1, 2]\nfor v in xs { print(v) }\nfor v in xs { print(v) }`)
      ).toEqual(['1', '2', '1', '2']);
    });

    it('a global written through a closure is still assignable', () => {
      expect(expectAgreement(`let g = 1\nfn f() { g = 2 }\nf()\nprint(g)`)).toEqual(['2']);
    });

    it('element and property assignment are unaffected', () => {
      expect(expectAgreement(`let a = [1, 2]\na[0] = 9\nprint(a[0])`)).toEqual(['9']);
      expect(expectAgreement(`let o = {k: 1}\no.k = 5\nprint(o.k)`)).toEqual(['5']);
    });

    it('reassigning a const global is still the const error, not the undefined one', () => {
      expectSameError(`const C = 1\nC = 2`, `Cannot reassign constant 'C'`);
    });
  });
});
