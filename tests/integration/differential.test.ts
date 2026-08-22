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
