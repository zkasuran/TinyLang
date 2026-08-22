import { describe, it, expect } from 'vitest';
import { Linter } from '../../src/linter';

describe('Linter', () => {
  const linter = new Linter();

  describe('unused-variables', () => {
    it('should detect unused variables', () => {
      const source = `let x = 42`;
      const diagnostics = linter.lint(source);
      const unused = diagnostics.filter(d => d.rule === 'unused-variables');
      expect(unused.length).toBe(1);
      expect(unused[0].message).toContain("'x'");
      expect(unused[0].message).toContain('never used');
    });

    it('should not flag used variables', () => {
      const source = `let x = 42\nprint(x)`;
      const diagnostics = linter.lint(source);
      const unused = diagnostics.filter(d => d.rule === 'unused-variables');
      expect(unused.length).toBe(0);
    });

    it('should not flag variables used in expressions', () => {
      const source = `let x = 10\nlet y = x + 5\nprint(y)`;
      const diagnostics = linter.lint(source);
      const unused = diagnostics.filter(d => d.rule === 'unused-variables');
      expect(unused.length).toBe(0);
    });
  });

  describe('unreachable-code', () => {
    it('should detect code after return', () => {
      const source = `fn foo() {\n  return 1\n  let x = 2\n}`;
      const diagnostics = linter.lint(source);
      const unreachable = diagnostics.filter(d => d.rule === 'unreachable-code');
      expect(unreachable.length).toBe(1);
      expect(unreachable[0].message).toContain('return');
    });

    it('should detect code after break', () => {
      const source = `while true {\n  break\n  print("unreachable")\n}`;
      const diagnostics = linter.lint(source);
      const unreachable = diagnostics.filter(d => d.rule === 'unreachable-code');
      expect(unreachable.length).toBe(1);
      expect(unreachable[0].message).toContain('break');
    });

    it('should not flag reachable code', () => {
      const source = `fn foo() {\n  let x = 1\n  return x\n}`;
      const diagnostics = linter.lint(source);
      const unreachable = diagnostics.filter(d => d.rule === 'unreachable-code');
      expect(unreachable.length).toBe(0);
    });
  });

  describe('no-empty-blocks', () => {
    it('should detect empty function body', () => {
      const source = `fn empty() {}`;
      const diagnostics = linter.lint(source);
      const empty = diagnostics.filter(d => d.rule === 'no-empty-blocks');
      expect(empty.length).toBe(1);
      expect(empty[0].message).toContain('empty');
    });

    it('should detect empty while block', () => {
      const source = `while true {}`;
      const diagnostics = linter.lint(source);
      const empty = diagnostics.filter(d => d.rule === 'no-empty-blocks');
      expect(empty.length).toBe(1);
    });

    it('should not flag non-empty blocks', () => {
      const source = `fn greet() { print("hi") }`;
      const diagnostics = linter.lint(source);
      const empty = diagnostics.filter(d => d.rule === 'no-empty-blocks');
      expect(empty.length).toBe(0);
    });
  });

  describe('prefer-const', () => {
    it('should suggest const for never-reassigned let', () => {
      const source = `let x = 42\nprint(x)`;
      const diagnostics = linter.lint(source);
      const preferConst = diagnostics.filter(d => d.rule === 'prefer-const');
      expect(preferConst.length).toBe(1);
      expect(preferConst[0].message).toContain("'x'");
      expect(preferConst[0].message).toContain('const');
    });

    it('should not suggest const for reassigned variables', () => {
      const source = `let x = 1\nx = 2\nprint(x)`;
      const diagnostics = linter.lint(source);
      const preferConst = diagnostics.filter(d => d.rule === 'prefer-const');
      expect(preferConst.length).toBe(0);
    });

    it('should not flag const declarations', () => {
      const source = `const x = 42\nprint(x)`;
      const diagnostics = linter.lint(source);
      const preferConst = diagnostics.filter(d => d.rule === 'prefer-const');
      expect(preferConst.length).toBe(0);
    });
  });

  describe('no-shadow', () => {
    it('should detect variable shadowing in inner scope', () => {
      const source = `let x = 1\nfn foo() {\n  let x = 2\n  print(x)\n}`;
      const diagnostics = linter.lint(source);
      const shadow = diagnostics.filter(d => d.rule === 'no-shadow');
      expect(shadow.length).toBe(1);
      expect(shadow[0].message).toContain("'x'");
      expect(shadow[0].message).toContain('shadows');
    });

    it('should not flag non-shadowing variables', () => {
      const source = `let x = 1\nfn foo() {\n  let y = 2\n  print(y)\n}`;
      const diagnostics = linter.lint(source);
      const shadow = diagnostics.filter(d => d.rule === 'no-shadow');
      expect(shadow.length).toBe(0);
    });
  });

  describe('auto-fix', () => {
    it('should fix let to const for prefer-const', () => {
      const source = `let x = 42\nprint(x)`;
      const { fixedSource } = linter.lintAndFix(source);
      expect(fixedSource).toContain('const x = 42');
      expect(fixedSource).not.toContain('let x');
    });

    it('should not modify code without fixable issues', () => {
      const source = `const x = 42\nprint(x)`;
      const { fixedSource } = linter.lintAndFix(source);
      expect(fixedSource).toBe(source);
    });
  });
});
