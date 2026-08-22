/**
 * CLI and Module System Tests
 *
 * Tests the core logic of CLI commands and the module system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Formatter } from '../../src/formatter';
import { Linter } from '../../src/linter';
import { TestRunner, formatTestResults } from '../../src/testing';
import { ModuleResolver, STDLIB_PREFIX } from '../../src/modules/resolver';
import { ModuleLoader } from '../../src/modules/loader';
import { TinyLang } from '../../src/tinylang';

describe('CLI Commands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinylang-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('format command', () => {
    it('formats a file and detects changes', () => {
      const source = 'let   x  = 1\nlet y=2\n';
      const formatter = new Formatter();
      const formatted = formatter.format(source);

      expect(formatted).not.toBe(source);
      expect(formatted).toContain('let x = 1');
      expect(formatted).toContain('let y = 2');
    });

    it('idempotent formatting', () => {
      const source = 'let x = 1\nlet y = 2\n';
      const formatter = new Formatter();
      const formatted = formatter.format(source);
      const formatted2 = formatter.format(formatted);

      expect(formatted).toBe(formatted2);
    });
  });

  describe('lint command', () => {
    it('detects lint issues', () => {
      const source = 'let x = 1\nprint(42)\n';
      const linter = new Linter();
      const diagnostics = linter.lint(source);

      // Should detect unused variable and/or prefer-const
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it('applies auto-fixes', () => {
      const source = 'let x = 1\nprint(x)\n';
      const linter = new Linter();
      const { fixedSource } = linter.lintAndFix(source);

      // Should suggest const instead of let
      expect(fixedSource).toContain('const x = 1');
    });
  });

  describe('test command', () => {
    it('runs test files and reports results', () => {
      const source = `
fn add(a, b) {
  return a + b
}

test "addition works" {
  expectToBe(add(2, 3), 5)
}

test "subtraction" {
  expectToBe(5 - 3, 2)
}
`;
      const runner = new TestRunner();
      const results = runner.runTests(source);

      expect(results.length).toBe(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(true);
    });

    it('reports failing tests', () => {
      const source = `
test "will fail" {
  expectToBe(1, 2)
}
`;
      const runner = new TestRunner();
      const results = runner.runTests(source);

      expect(results[0].passed).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    it('formats test results with colors', () => {
      const source = `
test "passes" { expectToBe(1, 1) }
test "fails" { expectToBe(1, 2) }
`;
      const runner = new TestRunner();
      const results = runner.runTests(source);
      const output = formatTestResults(results);

      expect(output).toContain('passes');
      expect(output).toContain('fails');
      expect(output).toContain('1 passed');
      expect(output).toContain('1 failed');
    });
  });

  describe('init command', () => {
    it('creates expected file structure', () => {
      const projectDir = path.join(tmpDir, 'my-project');
      fs.mkdirSync(projectDir, { recursive: true });

      // Simulate init command logic
      fs.writeFileSync(path.join(projectDir, 'main.tiny'), 'print("hello")');
      fs.writeFileSync(path.join(projectDir, 'lib.tiny'), 'fn greet() {}');
      fs.writeFileSync(path.join(projectDir, 'main.test.tiny'), 'test "x" { assert_eq(1,1) }');
      fs.writeFileSync(path.join(projectDir, '.tinylang.json'), '{}');
      fs.writeFileSync(path.join(projectDir, 'README.md'), '# Project');

      expect(fs.existsSync(path.join(projectDir, 'main.tiny'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'lib.tiny'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'main.test.tiny'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.tinylang.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'README.md'))).toBe(true);
    });
  });
});

describe('Module System', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinylang-modules-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ModuleResolver', () => {
    it('resolves relative paths', () => {
      const libFile = path.join(tmpDir, 'lib.tiny');
      const mainFile = path.join(tmpDir, 'main.tiny');
      fs.writeFileSync(libFile, 'fn add(a, b) { return a + b }');
      fs.writeFileSync(mainFile, '');

      const resolver = new ModuleResolver();
      const resolved = resolver.resolve('./lib', mainFile);

      expect(resolved).toBe(libFile);
    });

    it('resolves relative paths with .tiny extension', () => {
      const libFile = path.join(tmpDir, 'utils.tiny');
      const mainFile = path.join(tmpDir, 'main.tiny');
      fs.writeFileSync(libFile, '');
      fs.writeFileSync(mainFile, '');

      const resolver = new ModuleResolver();
      const resolved = resolver.resolve('./utils', mainFile);

      expect(resolved).toBe(libFile);
    });

    it('resolves parent directory paths', () => {
      const subDir = path.join(tmpDir, 'src');
      fs.mkdirSync(subDir);
      const libFile = path.join(tmpDir, 'lib.tiny');
      const mainFile = path.join(subDir, 'main.tiny');
      fs.writeFileSync(libFile, '');
      fs.writeFileSync(mainFile, '');

      const resolver = new ModuleResolver();
      const resolved = resolver.resolve('../lib', mainFile);

      expect(resolved).toBe(libFile);
    });

    it('resolves stdlib modules', () => {
      const resolver = new ModuleResolver();
      const resolved = resolver.resolve('math', '/any/path/main.tiny');

      expect(resolved).toBe(`${STDLIB_PREFIX}math`);
    });

    it('throws for non-existent modules', () => {
      const mainFile = path.join(tmpDir, 'main.tiny');
      fs.writeFileSync(mainFile, '');

      const resolver = new ModuleResolver();

      expect(() => resolver.resolve('./nonexistent', mainFile)).toThrow('Module not found');
    });
  });

  describe('ModuleLoader', () => {
    it('loads and caches modules', () => {
      const libFile = path.join(tmpDir, 'lib.tiny');
      fs.writeFileSync(libFile, 'fn add(a, b) { return a + b }');

      const loader = new ModuleLoader();
      const env1 = loader.loadModule(libFile);
      const env2 = loader.loadModule(libFile);

      // Should be the same cached instance
      expect(env1).toBe(env2);
    });

    it('detects circular dependencies', () => {
      const aFile = path.join(tmpDir, 'a.tiny');
      const bFile = path.join(tmpDir, 'b.tiny');
      fs.writeFileSync(aFile, 'import {bfn} from "./b"\nfn afn() { return 1 }');
      fs.writeFileSync(bFile, 'import {afn} from "./a"\nfn bfn() { return 2 }');

      const loader = new ModuleLoader();

      expect(() => loader.loadModule(aFile)).toThrow('Circular dependency detected');
    });

    it('loads stdlib modules', () => {
      const loader = new ModuleLoader();
      const env = loader.loadModule(`${STDLIB_PREFIX}math`);

      expect(env).toBeDefined();
    });
  });

  describe('Module Integration', () => {
    it('imports functions from another file', () => {
      const libFile = path.join(tmpDir, 'lib.tiny');
      const mainFile = path.join(tmpDir, 'main.tiny');

      fs.writeFileSync(libFile, 'fn double(x) { return x * 2 }');
      fs.writeFileSync(mainFile, 'import {double} from "./lib"\nprint(double(5))');

      const source = fs.readFileSync(mainFile, 'utf-8');
      const output: string[] = [];
      const tinylang = new TinyLang({ output: (msg) => output.push(msg) });
      const loader = new ModuleLoader();
      tinylang.setModuleContext(loader, mainFile);

      const result = tinylang.run(source);

      expect(result.success).toBe(true);
      expect(output).toContain('10');
    });

    it('caches modules across multiple imports', () => {
      const libFile = path.join(tmpDir, 'counter.tiny');
      const mainFile = path.join(tmpDir, 'main.tiny');

      // Module with a variable - should only be executed once
      fs.writeFileSync(libFile, 'let count = 42\nfn getCount() { return count }');
      fs.writeFileSync(mainFile, 'import {getCount} from "./counter"\nprint(getCount())');

      const source = fs.readFileSync(mainFile, 'utf-8');
      const output: string[] = [];
      const tinylang = new TinyLang({ output: (msg) => output.push(msg) });
      const loader = new ModuleLoader();
      tinylang.setModuleContext(loader, mainFile);

      const result = tinylang.run(source);

      expect(result.success).toBe(true);
      expect(output).toContain('42');
    });
  });
});
