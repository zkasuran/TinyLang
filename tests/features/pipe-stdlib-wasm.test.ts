/**
 * Tests for Pipe Operator Enhancements, New Stdlib Modules, and WASM Compiler
 */

import { describe, it, expect } from 'vitest';
import { TinyLang } from '../../src/tinylang';
import { WasmCompiler } from '../../src/compiler/wasm-compiler';

function run(source: string): string[] {
  const output: string[] = [];
  const tl = new TinyLang({ output: (msg) => output.push(msg) });
  tl.run(source);
  return output;
}

function runAndGet(source: string): string {
  return run(source).join('\n');
}

// ============ Pipe Operator Enhancements ============

describe('Pipe Operator - Method Calls', () => {
  it('pipes into .sort() on arrays', () => {
    const out = runAndGet(`
      let result = [3, 1, 2] |> .sort()
      print(result)
    `);
    expect(out).toContain('[1, 2, 3]');
  });

  it('pipes into .reverse() on arrays', () => {
    const out = runAndGet(`
      let result = [1, 2, 3] |> .reverse()
      print(result)
    `);
    expect(out).toContain('[3, 2, 1]');
  });

  it('chains multiple method pipes', () => {
    const out = runAndGet(`
      let result = [3, 1, 2] |> .sort() |> .reverse()
      print(result)
    `);
    expect(out).toContain('[3, 2, 1]');
  });

  it('pipes into .map() with lambda', () => {
    const out = runAndGet(`
      let result = [1, 2, 3] |> .map((x) => x * 2)
      print(result)
    `);
    expect(out).toContain('[2, 4, 6]');
  });

  it('pipes into .filter() with lambda', () => {
    const out = runAndGet(`
      let result = [1, 2, 3, 4, 5] |> .filter((x) => x > 3)
      print(result)
    `);
    expect(out).toContain('[4, 5]');
  });

  it('pipes into .join() on arrays', () => {
    const out = runAndGet(`
      let result = [1, 2, 3] |> .join("-")
      print(result)
    `);
    expect(out).toBe('1-2-3');
  });

  it('pipes into string methods', () => {
    const out = runAndGet(`
      let result = "hello world" |> .upper()
      print(result)
    `);
    expect(out).toBe('HELLO WORLD');
  });

  it('pipes into .trim() on strings', () => {
    const out = runAndGet(`
      let result = "  hello  " |> .trim()
      print(result)
    `);
    expect(out).toBe('hello');
  });
});

describe('Pipe Operator - Lambda', () => {
  it('pipes value into arrow function', () => {
    const out = runAndGet(`
      let result = 5 |> (x) => x * 2
      print(result)
    `);
    expect(out).toBe('10');
  });

  it('pipes through multiple arrow functions', () => {
    const out = runAndGet(`
      let result = 10 |> (x) => x + 5
      let final = result |> (x) => x * 2
      print(final)
    `);
    expect(out).toBe('30');
  });

  it('arrow function in pipe can access outer scope', () => {
    const out = runAndGet(`
      let factor = 3
      let result = 5 |> (x) => x * factor
      print(result)
    `);
    expect(out).toBe('15');
  });
});

describe('Pipe Operator - Partial Application', () => {
  it('pipes value as first argument to function call', () => {
    const out = runAndGet(`
      fn add(a, b) { return a + b }
      let result = 5 |> add(3)
      print(result)
    `);
    expect(out).toBe('8');
  });

  it('pipes value with multiple arguments', () => {
    const out = runAndGet(`
      fn clamp(x, min, max) {
        if (x < min) { return min }
        if (x > max) { return max }
        return x
      }
      print(15 |> clamp(0, 10))
    `);
    expect(out).toBe('10');
  });

  it('chains partial application', () => {
    const out = runAndGet(`
      fn add(a, b) { return a + b }
      fn mul(a, b) { return a * b }
      let result = 5 |> add(3) |> mul(2)
      print(result)
    `);
    expect(out).toBe('16');
  });
});

describe('Pipe Operator - Mixed usage', () => {
  it('combines method pipes with function pipes', () => {
    const out = runAndGet(`
      fn double(x) { return x * 2 }
      let result = 5 |> double
      print(result)
    `);
    expect(out).toBe('10');
  });

  it('uses pipe with stdlib functions', () => {
    const out = runAndGet(`
      let result = -5 |> abs
      print(result)
    `);
    expect(out).toBe('5');
  });
});

// ============ JSON Stdlib ============

describe('Stdlib - JSON', () => {
  it('parses a simple JSON object', () => {
    const out = runAndGet(`
      let obj = jsonParse("{\\"name\\":\\"Alice\\",\\"age\\":30}")
      print(obj.name)
      print(obj.age)
    `);
    expect(out).toBe('Alice\n30');
  });

  it('parses a JSON array', () => {
    const out = runAndGet(`
      let arr = jsonParse("[1, 2, 3]")
      print(arr[0])
      print(arr[1])
      print(arr[2])
    `);
    expect(out).toBe('1\n2\n3');
  });

  it('stringifies an object', () => {
    const out = runAndGet(`
      let obj = {x: 42, y: "hello"}
      let json = jsonStringify(obj)
      print(json)
    `);
    const parsed = JSON.parse(out);
    expect(parsed.x).toBe(42);
    expect(parsed.y).toBe('hello');
  });

  it('stringifies with indentation', () => {
    const out = runAndGet(`
      let obj = {a: 1}
      let json = jsonStringify(obj, 2)
      print(json)
    `);
    expect(out).toContain('{\n');
    expect(out).toContain('"a": 1');
  });

  it('handles null and booleans in JSON', () => {
    const out = runAndGet(`
      let obj = jsonParse("{\\"active\\":true,\\"value\\":null}")
      print(obj.active)
      print(obj.value)
    `);
    expect(out).toBe('true\nnull');
  });

  it('round-trips through parse and stringify', () => {
    const out = runAndGet(`
      let data = {items: [1, 2, 3], name: "test"}
      let json = jsonStringify(data)
      let restored = jsonParse(json)
      print(restored.name)
      print(restored.items[1])
    `);
    expect(out).toBe('test\n2');
  });
});

// ============ Crypto Stdlib ============

describe('Stdlib - Crypto', () => {
  it('generates a UUID', () => {
    const out = runAndGet('print(randomUUID())');
    // UUID v4 format: 8-4-4-4-12
    expect(out).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('hashes a string with sha256', () => {
    const out = runAndGet('print(hash("hello"))');
    expect(out).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('hashes with different algorithm', () => {
    const out = runAndGet('print(hash("hello", "md5"))');
    expect(out).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('base64 encodes a string', () => {
    const out = runAndGet('print(base64Encode("Hello World"))');
    expect(out).toBe('SGVsbG8gV29ybGQ=');
  });

  it('base64 decodes a string', () => {
    const out = runAndGet('print(base64Decode("SGVsbG8gV29ybGQ="))');
    expect(out).toBe('Hello World');
  });

  it('base64 round-trips', () => {
    const out = runAndGet(`
      let original = "TinyLang is awesome!"
      let encoded = base64Encode(original)
      let decoded = base64Decode(encoded)
      print(decoded)
    `);
    expect(out).toBe('TinyLang is awesome!');
  });
});

// ============ Collections Stdlib ============

describe('Stdlib - Collections (Set)', () => {
  it('creates an empty set', () => {
    const out = runAndGet(`
      let s = Set_new()
      print(Set_size(s))
    `);
    expect(out).toBe('0');
  });

  it('adds unique elements', () => {
    const out = runAndGet(`
      let s = Set_new()
      Set_add(s, 1)
      Set_add(s, 2)
      Set_add(s, 1)
      print(Set_size(s))
    `);
    expect(out).toBe('2');
  });

  it('checks membership', () => {
    const out = runAndGet(`
      let s = Set_new()
      Set_add(s, "hello")
      print(Set_has(s, "hello"))
      print(Set_has(s, "world"))
    `);
    expect(out).toBe('true\nfalse');
  });

  it('removes elements', () => {
    const out = runAndGet(`
      let s = Set_new()
      Set_add(s, 1)
      Set_add(s, 2)
      Set_remove(s, 1)
      print(Set_size(s))
      print(Set_has(s, 1))
    `);
    expect(out).toBe('1\nfalse');
  });
});

describe('Stdlib - Collections (Map)', () => {
  it('creates an empty map', () => {
    const out = runAndGet(`
      let m = Map_new()
      print(Map_size(m))
    `);
    expect(out).toBe('0');
  });

  it('sets and gets values', () => {
    const out = runAndGet(`
      let m = Map_new()
      Map_set(m, "name", "TinyLang")
      Map_set(m, "version", "1.0")
      print(Map_get(m, "name"))
      print(Map_get(m, "version"))
    `);
    expect(out).toBe('TinyLang\n1.0');
  });

  it('checks key existence', () => {
    const out = runAndGet(`
      let m = Map_new()
      Map_set(m, "key", 42)
      print(Map_has(m, "key"))
      print(Map_has(m, "missing"))
    `);
    expect(out).toBe('true\nfalse');
  });

  it('deletes keys', () => {
    const out = runAndGet(`
      let m = Map_new()
      Map_set(m, "a", 1)
      Map_set(m, "b", 2)
      Map_delete(m, "a")
      print(Map_size(m))
      print(Map_has(m, "a"))
    `);
    expect(out).toBe('1\nfalse');
  });

  it('gets all keys', () => {
    const out = runAndGet(`
      let m = Map_new()
      Map_set(m, "x", 1)
      Map_set(m, "y", 2)
      let mapKeys = Map_keys(m)
      print(mapKeys)
    `);
    expect(out).toContain('x');
    expect(out).toContain('y');
  });
});

// ============ WASM Compiler ============

describe('WASM Compiler', () => {
  it('compiles a simple function to WAT', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn add(a, b) {
        return a + b
      }
    `);
    expect(result.wat).toContain('(module');
    expect(result.wat).toContain('(func $add');
    expect(result.wat).toContain('(param $a i32)');
    expect(result.wat).toContain('(param $b i32)');
    expect(result.wat).toContain('(result i32)');
    expect(result.wat).toContain('i32.add');
    expect(result.exports).toContain('add');
  });

  it('compiles recursive fibonacci', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn fibonacci(n) {
        if (n <= 1) {
          return n
        }
        return fibonacci(n - 1) + fibonacci(n - 2)
      }
    `);
    expect(result.wat).toContain('(func $fibonacci');
    expect(result.wat).toContain('(call $fibonacci)');
    expect(result.wat).toContain('i32.le_s');
    expect(result.wat).toContain('i32.add');
    expect(result.exports).toContain('fibonacci');
  });

  it('compiles while loops', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn sum(n) {
        let total = 0
        let i = 1
        while (i <= n) {
          total += i
          i += 1
        }
        return total
      }
    `);
    expect(result.wat).toContain('(loop $continue');
    expect(result.wat).toContain('(block $break');
    expect(result.wat).toContain('br_if $break');
    expect(result.wat).toContain('br $continue');
    expect(result.wat).toContain('(local $total i32)');
    expect(result.wat).toContain('(local $i i32)');
  });

  it('compiles factorial', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn factorial(n) {
        if (n <= 1) {
          return 1
        }
        return n * factorial(n - 1)
      }
    `);
    expect(result.wat).toContain('(func $factorial');
    expect(result.wat).toContain('i32.mul');
    expect(result.wat).toContain('(call $factorial)');
  });

  it('compiles multiple functions', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn square(x) {
        return x * x
      }
      fn cube(x) {
        return x * x * x
      }
    `);
    expect(result.exports).toContain('square');
    expect(result.exports).toContain('cube');
    expect(result.wat).toContain('(func $square');
    expect(result.wat).toContain('(func $cube');
  });

  it('compiles comparison operators', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn isPositive(n) {
        if (n > 0) {
          return 1
        }
        return 0
      }
    `);
    expect(result.wat).toContain('i32.gt_s');
  });

  it('compiles unary negation', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn negate(x) {
        return -x
      }
    `);
    expect(result.wat).toContain('(i32.const 0)');
    expect(result.wat).toContain('i32.sub');
  });

  it('exports all functions', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn foo(x) { return x }
      fn bar(x) { return x }
    `);
    expect(result.wat).toContain('(export "foo" (func $foo))');
    expect(result.wat).toContain('(export "bar" (func $bar))');
  });

  it('handles empty function body without return', () => {
    const compiler = new WasmCompiler();
    const result = compiler.compile(`
      fn doNothing() {
        let x = 5
      }
    `);
    expect(result.wat).toContain('(func $doNothing');
    expect(result.wat).not.toContain('(result i32)');
  });
});
