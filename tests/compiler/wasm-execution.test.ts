/**
 * End-to-end tests for the WASM target.
 *
 * These do not inspect the emitted text and stop there. Every positive case is
 * assembled with wat2wasm (the `wabt` package), validated, instantiated by
 * Node's WebAssembly, and called - and the numeric result is asserted.
 *
 * That matters because the compiler used to substitute `(i32.const 0)` for any
 * construct it could not translate and carry on. The result assembled,
 * validated, instantiated and returned a plausible number, so text-level
 * assertions and "does it assemble" checks both passed while the function had
 * silently dropped the actual computation. Only executing it and comparing
 * against the real answer catches that.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { WasmCompiler, summarizeWasmResult } from '../../src/compiler/wasm-compiler';

const wabtInit = require('wabt');

interface WabtModule {
  parseWat(
    filename: string,
    source: string
  ): { validate(): void; toBinary(opts: object): { buffer: Uint8Array } };
}

let wabt: WabtModule;

beforeAll(async () => {
  wabt = (await wabtInit()) as WabtModule;
});

/** Compile, assemble, validate and instantiate. Throws if any step fails. */
function instantiate(source: string): {
  exports: Record<string, CallableFunction>;
  compiled: string[];
  skipped: { name: string; reasons: string[] }[];
} {
  const result = new WasmCompiler().compile(source);
  const parsed = wabt.parseWat('test.wat', result.wat);
  parsed.validate();
  const { buffer } = parsed.toBinary({});
  const instance = new WebAssembly.Instance(new WebAssembly.Module(buffer));
  return {
    exports: instance.exports as unknown as Record<string, CallableFunction>,
    compiled: result.compiled,
    skipped: result.skipped,
  };
}

describe('WASM target: emitted module actually runs', () => {
  it('runs recursive fibonacci and returns the real answer', () => {
    const { exports, compiled, skipped } = instantiate(`
      fn fibonacci(n) {
        if (n <= 1) { return n }
        return fibonacci(n - 1) + fibonacci(n - 2)
      }
    `);
    expect(skipped).toEqual([]);
    expect(compiled).toEqual(['fibonacci']);
    expect(exports.fibonacci(0)).toBe(0);
    expect(exports.fibonacci(1)).toBe(1);
    expect(exports.fibonacci(10)).toBe(55);
    expect(exports.fibonacci(20)).toBe(6765);
  });

  it('runs recursive factorial', () => {
    const { exports } = instantiate(`
      fn factorial(n) {
        if (n <= 1) { return 1 }
        return n * factorial(n - 1)
      }
    `);
    expect(exports.factorial(1)).toBe(1);
    expect(exports.factorial(5)).toBe(120);
    expect(exports.factorial(10)).toBe(3628800);
  });

  it('runs a while loop with compound assignment', () => {
    const { exports } = instantiate(`
      fn withLoop(n) {
        let total = 0
        let i = 0
        while (i < n) {
          total += i
          i += 1
        }
        return total
      }
    `);
    expect(exports.withLoop(0)).toBe(0);
    expect(exports.withLoop(10)).toBe(45);
    expect(exports.withLoop(100)).toBe(4950);
  });

  it('runs if/else returning from both branches', () => {
    const { exports } = instantiate(`
      fn withCompare(a, b) {
        if (a > b) { return a } else { return b }
      }
    `);
    expect(exports.withCompare(3, 9)).toBe(9);
    expect(exports.withCompare(9, 3)).toBe(9);
    expect(exports.withCompare(4, 4)).toBe(4);
  });

  it('runs every supported arithmetic operator', () => {
    const { exports } = instantiate(`
      fn add(a, b) { return a + b }
      fn sub(a, b) { return a - b }
      fn mul(a, b) { return a * b }
      fn div(a, b) { return a / b }
      fn mod(a, b) { return a % b }
      fn neg(a) { return -a }
    `);
    expect(exports.add(7, 5)).toBe(12);
    expect(exports.sub(7, 5)).toBe(2);
    expect(exports.mul(7, 5)).toBe(35);
    expect(exports.div(17, 5)).toBe(3); // integer division: i32.div_s
    expect(exports.mod(17, 5)).toBe(2);
    expect(exports.neg(5)).toBe(-5);
  });

  it('runs every supported comparison operator', () => {
    const { exports } = instantiate(`
      fn lt(a, b) { if (a < b) { return 1 } else { return 0 } }
      fn lte(a, b) { if (a <= b) { return 1 } else { return 0 } }
      fn gt(a, b) { if (a > b) { return 1 } else { return 0 } }
      fn gte(a, b) { if (a >= b) { return 1 } else { return 0 } }
      fn eq(a, b) { if (a == b) { return 1 } else { return 0 } }
      fn ne(a, b) { if (a != b) { return 1 } else { return 0 } }
    `);
    expect([exports.lt(1, 2), exports.lt(2, 1), exports.lt(2, 2)]).toEqual([1, 0, 0]);
    expect([exports.lte(1, 2), exports.lte(2, 1), exports.lte(2, 2)]).toEqual([1, 0, 1]);
    expect([exports.gt(1, 2), exports.gt(2, 1), exports.gt(2, 2)]).toEqual([0, 1, 0]);
    expect([exports.gte(1, 2), exports.gte(2, 1), exports.gte(2, 2)]).toEqual([0, 1, 1]);
    expect([exports.eq(2, 2), exports.eq(2, 3)]).toEqual([1, 0]);
    expect([exports.ne(2, 2), exports.ne(2, 3)]).toEqual([0, 1]);
  });

  it('runs and/or with non-0/1 operands as boolean logic', () => {
    const { exports } = instantiate(`
      fn both(a, b) { if (a and b) { return 1 } else { return 0 } }
      fn either(a, b) { if (a or b) { return 1 } else { return 0 } }
      fn inverted(a) { if (not a) { return 1 } else { return 0 } }
    `);
    // A raw i32.and would make both(1, 2) evaluate to 0, i.e. false.
    expect(exports.both(1, 2)).toBe(1);
    expect(exports.both(1, 0)).toBe(0);
    expect(exports.both(0, 0)).toBe(0);
    expect(exports.either(1, 2)).toBe(1);
    expect(exports.either(0, 4)).toBe(1);
    expect(exports.either(0, 0)).toBe(0);
    expect(exports.inverted(0)).toBe(1);
    expect(exports.inverted(3)).toBe(0);
  });

  it('runs cross-function calls', () => {
    const { exports, compiled } = instantiate(`
      fn square(x) { return x * x }
      fn sumSquares(a, b) { return square(a) + square(b) }
    `);
    expect(compiled).toEqual(['square', 'sumSquares']);
    expect(exports.sumSquares(3, 4)).toBe(25);
  });

  it('runs /= as a division, not an assignment', () => {
    // `/=` used to fall through to a plain assignment, turning `x /= 2` into
    // `x = 2`, so halve(10) returned 2.
    const { exports } = instantiate(`
      fn halve(x) {
        x /= 2
        return x
      }
    `);
    expect(exports.halve(10)).toBe(5);
    expect(exports.halve(9)).toBe(4);
  });

  it('emits a void function with no result type and calls it', () => {
    const { exports, skipped } = instantiate(`
      fn doNothing() {
        let x = 5
      }
    `);
    expect(skipped).toEqual([]);
    expect(exports.doNothing()).toBeUndefined();
  });
});

describe('WASM target: unsupported constructs are skipped, never faked', () => {
  /**
   * The original report: this compiled to
   *   (func $usesString (param $name i32) (result i32)
   *     (i32.const 0) (local.get $name) i32.add return)
   *   (export "usesString" (func $usesString))
   * which assembled, validated, instantiated and returned 1 - a working
   * looking export with the string operation silently dropped.
   */
  it('does not export a function that used a string', () => {
    const result = new WasmCompiler().compile(
      `fn usesString(name) { return "hello " + name }`
    );
    expect(result.compiled).toEqual([]);
    expect(result.exports).toEqual([]);
    expect(result.skipped.map(s => s.name)).toEqual(['usesString']);
    expect(result.skipped[0].reasons.join(' ')).toContain('StringLiteral');

    // Nothing named usesString appears anywhere in the module: no body, no
    // export, no placeholder.
    expect(result.wat).not.toContain('usesString');
    expect(result.wat).not.toContain('(func');
    expect(result.wat).not.toContain('(export');
  });

  it.each([
    ['array literal', `fn f() { let a = [1, 2]\n return a[0] }`],
    ['object literal', `fn f() { let o = {a: 1}\n return o.a }`],
    ['reference to a global', `let g = 1\nfn f() { return g }`],
    ['for loop', `fn f(n) { let t = 0\n for i in 0..n { t += i }\n return t }`],
    ['print', `fn f(n) { print(n)\n return n }`],
    ['exponentiation', `fn f(a, b) { return a ** b }`],
    ['non-integer literal', `fn f() { return 1.5 }`],
    ['call to a stdlib function', `fn f(n) { return abs(n) }`],
    ['possible fall-through', `fn f(n) { if (n > 0) { return 1 } }`],
    ['a local shadowing a parameter', `fn f(a) { let a = 2\n return a }`],
    [
      'the same local declared in two blocks',
      `fn f(n) { if (n > 0) { let x = 1 } else { let x = 2 }\n return n }`,
    ],
    ['a class', `class C { fn m() { return 1 } }\nfn f() { return 1 }\nfn g() { return C }`],
  ])('skips a function that uses %s', (_label, source) => {
    const result = new WasmCompiler().compile(source);
    expect(result.skipped.length).toBeGreaterThan(0);
    // Whatever was rejected must not be reachable from the module.
    for (const fn of result.skipped) {
      expect(result.exports).not.toContain(fn.name);
      expect(result.wat).not.toContain(`(func $${fn.name} `);
      expect(result.wat).not.toContain(`(export "${fn.name}"`);
      expect(fn.reasons.length).toBeGreaterThan(0);
      for (const reason of fn.reasons) {
        expect(reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('skips a caller whose callee could not be compiled', () => {
    const result = new WasmCompiler().compile(`
      fn bad(s) { return "x" + s }
      fn good(n) { return bad(n) + 1 }
    `);
    expect(result.compiled).toEqual([]);
    const byName = new Map(result.skipped.map(s => [s.name, s.reasons]));
    expect([...byName.keys()].sort()).toEqual(['bad', 'good']);
    expect(byName.get('good')!.join(' ')).toContain(
      `calls 'bad', which could not be compiled`
    );
  });

  it('skips a call with the wrong number of arguments', () => {
    const result = new WasmCompiler().compile(`
      fn g(a, b) { return a + b }
      fn f(n) { return g(n) }
    `);
    expect(result.compiled).toEqual(['g']);
    expect(result.skipped.map(s => s.name)).toEqual(['f']);
  });

  it('keeps the good functions when only some are skipped, and they still run', () => {
    const source = `
      fn fib(n) {
        if (n <= 1) { return n }
        return fib(n - 1) + fib(n - 2)
      }
      fn broken(s) { return "x" + s }
    `;
    const result = new WasmCompiler().compile(source);
    expect(result.compiled).toEqual(['fib']);
    expect(result.skipped.map(s => s.name)).toEqual(['broken']);

    const { exports } = instantiate(source);
    expect(exports.broken).toBeUndefined();
    expect(exports.fib(20)).toBe(6765);
  });

  it('reports top-level statements that were left out', () => {
    const result = new WasmCompiler().compile(`
      let g = 1
      fn f(n) { return n + 1 }
      print(f(1))
    `);
    expect(result.compiled).toEqual(['f']);
    expect(result.ignoredTopLevel).toEqual(['VariableDeclaration', 'PrintStatement']);
    expect(result.errors.some(e => e.includes('Top-level'))).toBe(true);
  });

  it('rejects a duplicate function definition rather than emitting both', () => {
    const result = new WasmCompiler().compile(`
      fn f(n) { return n }
      fn f(n) { return n + 1 }
    `);
    expect(result.compiled).toEqual([]);
    expect(result.skipped.map(s => s.name)).toEqual(['f']);
  });

  it('every emitted module assembles and validates, even a mixed one', () => {
    // A skipped function must never leave a dangling call or export behind.
    const sources = [
      `fn a(n) { return n }\nfn b(s) { return "x" + s }\nfn c(n) { return a(n) * 2 }`,
      `fn a(n) { return n }\nfn b(n) { return a(n) + q(n) }`,
      `let g = 1\nfn a(n) { return n + g }\nfn b(n) { return n }`,
    ];
    for (const source of sources) {
      const result = new WasmCompiler().compile(source);
      const parsed = wabt.parseWat('mixed.wat', result.wat);
      expect(() => parsed.validate()).not.toThrow();
      const { buffer } = parsed.toBinary({});
      const instance = new WebAssembly.Instance(new WebAssembly.Module(buffer));
      const exportNames = Object.keys(instance.exports).sort();
      expect(exportNames).toEqual([...result.compiled].sort());
      for (const fn of result.skipped) {
        expect(exportNames).not.toContain(fn.name);
      }
    }
  });
});


describe('WASM target: what the wasm command reports and exits with', () => {
  const report = (source: string) =>
    summarizeWasmResult(new WasmCompiler().compile(source), 'prog.tiny');

  it('succeeds quietly when every function compiled', () => {
    const r = report(`fn f(n) { return n + 1 }`);
    expect(r.exitCode).toBe(0);
    expect(r.writeOutput).toBe(true);
    expect(r.lines.map(l => l.text)).toEqual(['Compiled and exported: f']);
  });

  it('fails and writes nothing when no function compiled', () => {
    const r = report(`fn f(name) { return "hi " + name }`);
    expect(r.exitCode).toBe(1);
    expect(r.writeOutput).toBe(false);
    expect(r.lines.some(l => l.text.includes('Nothing was compiled to WASM'))).toBe(true);
  });

  it('fails when some functions compiled and some did not', () => {
    const r = report(`fn f(n) { return n }\nfn g(s) { return "x" + s }`);
    expect(r.exitCode).toBe(1);
    expect(r.writeOutput).toBe(true);
    expect(r.lines.some(l => l.text === 'Compiled and exported: f')).toBe(true);
    expect(
      r.lines.some(l => l.text === 'Incomplete: 1 function(s) compiled, 1 could not be.')
    ).toBe(true);
  });

  it('never labels a function that could not be compiled a "warning"', () => {
    const r = report(`fn f(n) { return n }\nfn g(s) { return "x" + s }`);
    const skipLines = r.lines.filter(l => l.text.includes('g:'));
    expect(skipLines.length).toBeGreaterThan(0);
    for (const line of skipLines) {
      expect(line.level).toBe('error');
    }
    for (const line of r.lines) {
      expect(line.text.toLowerCase()).not.toContain('warning');
    }
  });

  it('a note about ignored top-level statements alone does not fail the build', () => {
    const r = report(`let g = 1\nfn f(n) { return n }\nprint(1)`);
    expect(r.exitCode).toBe(0);
    expect(r.lines.some(l => l.level === 'note' && l.text.includes('top-level'))).toBe(true);
  });
});
