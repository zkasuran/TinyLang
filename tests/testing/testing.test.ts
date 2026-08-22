import { describe, it, expect } from 'vitest';
import { TestRunner } from '../../src/testing';
import { TinyLang } from '../../src/tinylang';

describe('Testing Framework', () => {
  const runner = new TestRunner();

  describe('parsing test blocks', () => {
    it('should parse test blocks correctly', () => {
      const source = `test "basic test" {\n  let x = 1\n  expectToBe(x, 1)\n}`;
      const results = runner.runTests(source);
      expect(results.length).toBe(1);
      expect(results[0].description).toBe('basic test');
    });

    it('should handle multiple test blocks', () => {
      const source = `
test "test one" {
  expectToBe(1, 1)
}

test "test two" {
  expectToBe(2, 2)
}
`;
      const results = runner.runTests(source);
      expect(results.length).toBe(2);
      expect(results[0].description).toBe('test one');
      expect(results[1].description).toBe('test two');
    });
  });

  describe('running passing tests', () => {
    it('should report passed for correct assertions', () => {
      const source = `test "addition" {\n  expectToBe(1 + 1, 2)\n}`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(true);
    });

    it('should report passed for multiple assertions', () => {
      const source = `
test "multiple assertions" {
  expectToBe(1, 1)
  expectToBeGreaterThan(5, 3)
  expectToBeLessThan(1, 10)
  expectToBeTrue(true)
  expectToBeFalse(false)
  expectToBeNull(null)
}
`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(true);
    });

    it('should support expectToContain for arrays', () => {
      const source = `
test "array contains" {
  let arr = [1, 2, 3]
  expectToContain(arr, 2)
}
`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(true);
    });

    it('should support expectToContain for strings', () => {
      const source = `
test "string contains" {
  expectToContain("hello world", "world")
}
`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(true);
    });
  });

  describe('running failing tests', () => {
    it('should report failed with error message', () => {
      const source = `test "failing" {\n  expectToBe(1, 2)\n}`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(false);
      expect(results[0].error).toContain('Expected');
      expect(results[0].error).toContain('1');
      expect(results[0].error).toContain('2');
    });

    it('should report specific assertion error messages', () => {
      const source = `test "greater than fails" {\n  expectToBeGreaterThan(1, 5)\n}`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(false);
      expect(results[0].error).toContain('greater than');
    });
  });

  describe('test isolation', () => {
    it('should run tests independently', () => {
      const source = `
test "first test" {
  let x = 1
  expectToBe(x, 1)
}

test "second test" {
  let x = 2
  expectToBe(x, 2)
}
`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(true);
    });
  });

  describe('tests use top-level declarations', () => {
    it('should have access to functions defined outside tests', () => {
      const source = `
fn add(a, b) {
  return a + b
}

test "can use add function" {
  expectToBe(add(2, 3), 5)
}
`;
      const results = runner.runTests(source);
      expect(results[0].passed).toBe(true);
    });
  });

  describe('normal execution skips test blocks', () => {
    it('should skip test blocks during normal execution', () => {
      const output: string[] = [];
      const tl = new TinyLang({ output: (msg) => output.push(msg) });
      const source = `
print("before")
test "should not run" {
  print("inside test")
}
print("after")
`;
      const result = tl.run(source);
      expect(result.success).toBe(true);
      expect(output).toEqual(['before', 'after']);
    });
  });

  describe('test duration', () => {
    it('should report duration for each test', () => {
      const source = `test "quick test" {\n  expectToBe(1, 1)\n}`;
      const results = runner.runTests(source);
      expect(results[0].duration).toBeGreaterThanOrEqual(0);
    });
  });
});
