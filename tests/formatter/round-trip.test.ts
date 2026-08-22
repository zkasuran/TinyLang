/**
 * Formatter round-trip tests.
 *
 * The formatter is the only tool in the toolchain that rewrites the user's file,
 * so "formatted output means the same thing as the input" is a correctness
 * requirement, not a nicety. It was not being met: both switches in the
 * formatter ended in `default: return ''`, so any AST node nobody had written a
 * case for was replaced by an empty string. `tinylang fmt examples/17-testing.tiny`
 * deleted an entire try/catch - the throw, the assertion, all of it - and left a
 * blank line. `print(f"x = {x}")` became `print()`. And because a grouping
 * `(...)` leaves no node in the AST and nothing re-inserted it,
 * `(low + high) / 2` was quietly rewritten as `low + high / 2`.
 *
 * The three assertions below are ordered by strength. The last one - run the
 * formatted program and compare its output to the original's - is the one that
 * would have caught every bug above on the day it was introduced.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import {
  Formatter,
  FormatterError,
  astDifference,
  commentTexts,
  commentDifference,
} from '../../src/formatter';
import { Interpreter } from '../../src/interpreter';
import { registerStdlib } from '../../src/stdlib';

const formatter = new Formatter();

function parse(source: string): unknown {
  return new Parser(new Lexer(source).tokenize()).parse();
}

/** Run source through the tree-walk interpreter, collecting its output. */
function run(source: string): string[] {
  const output: string[] = [];
  const program = new Parser(new Lexer(source).tokenize()).parse();
  const interpreter = new Interpreter({ output: (m) => output.push(m) });
  const env = interpreter.getGlobalEnvironment();
  registerStdlib(env, { output: (m) => output.push(m) });
  interpreter.executeInEnvironment(program as never, env);
  return output;
}

/**
 * Assert that formatting `source` preserves its meaning, four ways.
 * Returns the formatted text so callers can pin the exact output too.
 */
function expectPreserved(source: string): string {
  const formatted = formatter.format(source);

  const difference = astDifference(parse(source), parse(formatted));
  expect(
    difference,
    `formatting changed the AST\n${difference}\n--- formatted ---\n${formatted}`
  ).toBeNull();

  const commentLoss = commentDifference(commentTexts(source), commentTexts(formatted));
  expect(
    commentLoss,
    `formatting changed the comments\n${commentLoss}\n--- formatted ---\n${formatted}`
  ).toBeNull();

  expect(formatter.format(formatted), 'formatting is not idempotent').toBe(formatted);

  return formatted;
}

describe('Formatter round-trip safety', () => {
  describe('every example program', () => {
    const examplesDir = path.join(__dirname, '..', '..', 'examples');

    // Every example is checked. There are deliberately no exclusions: five of
    // these files were silently losing code, and an exclusion list is exactly
    // how that goes unnoticed.
    const files = fs
      .readdirSync(examplesDir)
      .filter((f) => f.endsWith('.tiny'))
      .sort();

    it('finds example programs to format', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
      describe(file, () => {
        const source = fs.readFileSync(path.join(examplesDir, file), 'utf-8');

        it('reparses to a structurally identical AST', () => {
          const formatted = formatter.format(source);
          const difference = astDifference(parse(source), parse(formatted));
          expect(difference, `formatting ${file} changed the AST\n${difference}`).toBeNull();
        });

        it('keeps every comment', () => {
          // These files are teaching material: the commentary is the product.
          // `fmt` deleted all 230 lines of it across the 18 examples, and the AST
          // check above cannot see that, because comments are not in the AST.
          const formatted = formatter.format(source);
          const before = commentTexts(source);
          const difference = commentDifference(before, commentTexts(formatted));
          expect(before.length, `${file} has no comments to check`).toBeGreaterThan(0);
          expect(difference, `formatting ${file} changed its comments\n${difference}`).toBeNull();
        });

        it('is idempotent', () => {
          const once = formatter.format(source);
          expect(formatter.format(once)).toBe(once);
        });

        it('is already formatted, so `fmt --check` reports nothing', () => {
          // `fmt --check` flagged all 18 of these, so the one command a
          // contributor would run to see whether their change is formatted was
          // useless: it failed on files nobody had touched. Now that the
          // formatter no longer strips the commentary, the examples are stored in
          // the exact shape it produces, and any file drifting out of that shape
          // fails here rather than being discovered as noise in --check.
          expect(formatter.format(source)).toBe(source);
        });

        it('still produces identical output when run', () => {
          const expected = run(source);
          expect(run(formatter.format(source)), `formatted ${file} behaves differently`).toEqual(
            expected
          );
        });
      });
    }
  });

  describe('statements that used to be deleted outright', () => {
    it('keeps try/catch, including the throw inside it', () => {
      const formatted = expectPreserved(
        'let caught = false\n' +
          'try { throw "boom" } catch err {\n' +
          'caught = true\n' +
          'print(err.message)\n' +
          '}\n' +
          'print(caught)\n'
      );
      expect(formatted).toBe(
        'let caught = false\n' +
          'try {\n' +
          '  throw "boom"\n' +
          '} catch err {\n' +
          '  caught = true\n' +
          '  print(err.message)\n' +
          '}\n' +
          'print(caught)\n'
      );
    });

    it('keeps the exact program from examples/17-testing.tiny that was lost', () => {
      const formatted = expectPreserved(`
test "error throwing works" {
  let caught = false
  try {
    throw "something went wrong"
  } catch err {
    caught = true
    expectToBe(err.message, "something went wrong")
  }
  expectToBeTrue(caught)
}
`);
      expect(formatted).toContain('throw "something went wrong"');
      expect(formatted).toContain('} catch err {');
      expect(formatted).toContain('expectToBe(err.message, "something went wrong")');
    });

    it('keeps array destructuring', () => {
      expect(expectPreserved('let [a, b] = [1, 2]\nprint(a, b)')).toBe(
        'let [a, b] = [1, 2]\nprint(a, b)\n'
      );
    });

    it('keeps object destructuring, including const', () => {
      expect(expectPreserved('const {x, y} = {x: 1, y: 2}\nprint(x, y)')).toBe(
        'const {x, y} = {x: 1, y: 2}\nprint(x, y)\n'
      );
    });

    it('keeps enum declarations, one newline-separated variant per line', () => {
      expect(expectPreserved('enum Color { Red Green Blue }\nprint(Color.Red)')).toBe(
        'enum Color {\n  Red\n  Green\n  Blue\n}\n\nprint(Color.Red)\n'
      );
    });
  });

  describe('expressions that used to be deleted outright', () => {
    it('keeps f-strings', () => {
      expect(expectPreserved('let x = 2\nprint(f"x = {x}, x+1 = {x + 1}")')).toBe(
        'let x = 2\nprint(f"x = {x}, x+1 = {x + 1}")\n'
      );
    });

    it('escapes a literal brace inside an f-string', () => {
      const formatted = expectPreserved('print(f"\\{literal} {1 + 1}")');
      expect(formatted).toBe('print(f"\\{literal} {1 + 1}")\n');
      expect(run(formatted)).toEqual(['{literal} 2']);
    });

    it('keeps optional member and index access', () => {
      expect(expectPreserved('let o = null\nprint(o?.a, o?.[0])')).toBe(
        'let o = null\nprint(o?.a, o?.[0])\n'
      );
    });

    it('keeps nullish coalescing', () => {
      expect(expectPreserved('print(null ?? "fallback")')).toBe('print(null ?? "fallback")\n');
    });

    it('keeps pipes and pipe-method calls', () => {
      expect(
        expectPreserved('print([1, 2, 3] |> .map((x) => x * 2) |> .join(","))')
      ).toBe('print([1, 2, 3] |> .map((x) => x * 2) |> .join(","))\n');
    });

    it('keeps a pipe into a function', () => {
      expect(expectPreserved('fn double(n) { return n * 2 }\nprint(5 |> double)')).toContain(
        'print(5 |> double)'
      );
    });

    it('keeps spread in arrays and calls', () => {
      expect(expectPreserved('let a = [1, 2]\nprint([...a, 3])')).toBe(
        'let a = [1, 2]\nprint([...a, 3])\n'
      );
    });

    it('keeps function expressions', () => {
      expect(expectPreserved('let f = fn(a) { return a + 1 }\nprint(f(1))')).toBe(
        'let f = fn(a) {\n  return a + 1\n}\nprint(f(1))\n'
      );
    });

    it('keeps an immediately-invoked function expression as a statement', () => {
      // At statement level a bare `fn` opens a *declaration*, which then demands
      // a name, so this only survives with parentheses the formatter has to add
      // back. It wraps the whole statement rather than just the callee: the
      // guard is one rule about leftmost position, not a special case per node.
      const formatted = expectPreserved('(fn(a) { print(a) })(7)');
      expect(formatted).toBe('(fn(a) {\n  print(a)\n}(7))\n');
      expect(run(formatted)).toEqual(['7']);
    });

    it('keeps new, this and ranges', () => {
      const formatted = expectPreserved(
        'class P { fn init(n) { this.n = n } fn get() { return this.n } }\n' +
          'let p = new P(3)\nprint(p.get())\nfor i in 0..2 { print(i) }\nfor j in 0..=2 { print(j) }'
      );
      expect(formatted).toContain('let p = new P(3)');
      expect(formatted).toContain('for i in 0..2 {');
      expect(formatted).toContain('for j in 0..=2 {');
      expect(formatted).toContain('this.n = n');
    });

    it('keeps ternaries', () => {
      expect(expectPreserved('print(1 > 0 ? "yes" : "no")')).toBe(
        'print(1 > 0 ? "yes" : "no")\n'
      );
    });
  });

  describe('grouping parentheses (regression: silently re-associated arithmetic)', () => {
    it('keeps parentheses that change the result', () => {
      const formatted = expectPreserved('let low = 0\nlet high = 10\nprint((low + high) / 2)');
      expect(formatted).toContain('print((low + high) / 2)');
      expect(run(formatted)).toEqual(['5']);
    });

    it('drops parentheses that do not change the result', () => {
      expect(expectPreserved('print(1 + (2 * 3))')).toBe('print(1 + 2 * 3)\n');
    });

    it.each([
      ['(1 + 2) * 3', '9'],
      ['1 - (2 - 3)', '2'],
      ['(1 - 2) - 3', '-4'],
      ['2 ** (3 ** 2)', '512'],
      ['(2 ** 3) ** 2', '64'],
      ['-(2 ** 2)', '-4'],
      ['(-2) ** 2', '4'],
      ['(10 - 4) % 4', '2'],
      ['not (false and false)', 'true'],
      ['(1 > 2) == false', 'true'],
      ['(true or false) and false', 'false'],
      ['(null ?? 1) + 1', '2'],
    ])('preserves the value of %s', (expr, expected) => {
      const formatted = expectPreserved(`print(${expr})`);
      expect(run(formatted)).toEqual([expected]);
      expect(run(`print(${expr})`)).toEqual([expected]);
    });

    it('parenthesises an arrow function used as a callee', () => {
      expect(expectPreserved('print(((x) => x * 2)(4))')).toBe('print(((x) => x * 2)(4))\n');
    });

    it('parenthesises an object literal returned from an arrow body', () => {
      const formatted = expectPreserved('let f = (n) => ({v: n})\nprint(f(1).v)');
      expect(formatted).toBe('let f = (n) => ({v: n})\nprint(f(1).v)\n');
      expect(run(formatted)).toEqual(['1']);
    });

    it('parenthesises a range operand that binds too loosely', () => {
      const formatted = expectPreserved('for i in 0..(1 + 1) { print(i) }');
      expect(run(formatted)).toEqual(['0', '1']);
    });

    it('parenthesises a pipe used as a member object', () => {
      const formatted = expectPreserved('print(([1, 2] |> .map((x) => x))[0])');
      expect(run(formatted)).toEqual(['1']);
    });
  });

  describe('number literals the lexer has to be able to read back', () => {
    it.each(['0.0000001', '100000000000000000000000', '1.5', '0.5'])(
      'round-trips %s',
      (literal) => {
        const formatted = expectPreserved(`print(${literal})`);
        expect(run(formatted)).toEqual(run(`print(${literal})`));
      }
    );
  });

  describe('the safety net itself', () => {
    it('throws instead of returning output that changes the meaning', () => {
      // Simulate the class of bug that shipped: an expression that renders to
      // something other than what it means. The verifier must refuse the result
      // rather than hand back a file that would be written over the original.
      const broken = new Formatter();
      (broken as unknown as { renderExpression: () => string }).renderExpression = () => '0';

      expect(() => broken.format('print(1 + 2)')).toThrow(FormatterError);
      expect(() => broken.format('print(1 + 2)')).toThrow(/change the meaning/);
    });

    it('throws instead of returning output that does not parse', () => {
      const broken = new Formatter();
      (broken as unknown as { renderExpression: () => string }).renderExpression = () => ')';

      expect(() => broken.format('print(1)')).toThrow(FormatterError);
      expect(() => broken.format('print(1)')).toThrow(/does not parse/);
    });

    it('reports where the difference is, so the bug is actionable', () => {
      const broken = new Formatter();
      (broken as unknown as { renderExpression: () => string }).renderExpression = () => '0';

      expect(() => broken.format('let x = 1 + 2')).toThrow(/\$\.body\[0\]\.value/);
    });
  });
});
