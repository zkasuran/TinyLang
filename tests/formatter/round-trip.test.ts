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

  describe('fluent method chains (regression: hand-broken chains were collapsed)', () => {
    // The formatter was width-blind for chains, so it joined a deliberately
    // broken chain onto one line however long the result was. In
    // examples/09-functional.tiny that produced a 98-column line. The parser has
    // explicit support for this shape (a NEWLINE before `.` continues the
    // expression), so collapsing it both hurt the examples and threw away an
    // authoring choice the language went out of its way to allow.
    //
    // `expectPreserved` already asserts same-AST, same-comments and idempotency
    // for every case below, which covers the round-trip requirement; the extra
    // assertions pin the exact layout and the runtime behaviour.

    /** Long enough that the flat form is over the 80-column default. */
    const longChain =
      'let names = people.filter((p) => p.city == "NYC").filter((p) => p.age > 28).map((p) => p.name)';

    it('leaves a chain that fits on one line', () => {
      expect(expectPreserved('let x = a.b(1).c(2)')).toBe('let x = a.b(1).c(2)\n');
    });

    it('joins a chain that was broken by hand but fits', () => {
      // The collapsing direction is still correct when the result fits.
      expect(expectPreserved('let x = a\n  .b(1)\n  .c(2)')).toBe('let x = a.b(1).c(2)\n');
    });

    it('breaks a chain that exceeds maxLineWidth, one call per line', () => {
      expect(expectPreserved(longChain)).toBe(
        'let names = people\n' +
          '  .filter((p) => p.city == "NYC")\n' +
          '  .filter((p) => p.age > 28)\n' +
          '  .map((p) => p.name)\n'
      );
    });

    it('is idempotent on the broken form and round-trips to the same AST', () => {
      // The property most likely to break: the broken form must be a fixed
      // point, not something the next pass rejoins and re-splits.
      const broken = formatter.format(longChain);
      expect(broken).toContain('\n  .map(');

      const again = expectPreserved(broken);
      expect(again, 'the broken form is not a fixed point').toBe(broken);
      expect(astDifference(parse(longChain), parse(broken))).toBeNull();
    });

    it('does not break a single long call', () => {
      // There is no natural break point in one call, so a long one is left
      // alone rather than split at an arbitrary place.
      const single =
        'let x = someObject.aVeryLongMethodNameThatGoesOn("an argument here", "another one", 12345)';
      const formatted = expectPreserved(single);
      expect(formatted).toBe(single + '\n');
      expect(formatted).not.toContain('\n  .');
    });

    it('does not touch plain member access, however long', () => {
      // `a.b.c` has no calls and is not a chain; there is nothing to break.
      const members =
        'let x = someNamespace.someModule.someSection.someGroup.someEntry.someField.someLeaf';
      expect(expectPreserved(members)).toBe(members + '\n');
    });

    it('produces identical interpreter output once broken', () => {
      const source =
        'let people = [{city: "NYC", age: 30, name: "Ada"}, {city: "LA", age: 41, name: "Bo"}]\n' +
        longChain +
        '\nprint(names)';
      const formatted = expectPreserved(source);
      expect(formatted).toContain('\n  .map((p) => p.name)');
      expect(run(formatted), 'broken chain behaves differently').toEqual(run(source));
    });

    describe('inside other constructs', () => {
      // Each of these puts a closing token (`)`, `{`) or an operator directly
      // after the final link. The parser only treats a newline as a
      // continuation when the next significant token is a lone `.`, so the
      // rendering must never put a newline before that closing token.
      // Long enough (98 columns) to be over the limit at every nesting depth
      // used below, so each case really does take the breaking path.
      const chain =
        'nums.filter((value) => value > 0).map((value) => value * 2).reduce((acc, value) => acc + value, 0)';

      /**
       * Format, assert the chain actually broke, and return the output.
       *
       * The explicit "it broke" assertion is the point: an earlier draft of
       * these tests used a chain that fit within 80 columns, so every one of
       * them passed while exercising only the flat path they were written to
       * avoid. Asserting the break makes that failure mode visible.
       */
      function expectBroken(source: string): string {
        const formatted = expectPreserved(source);
        expect(formatted, 'chain did not break, so this case proves nothing').toMatch(
          /\n\s+\.filter\(/
        );
        return formatted;
      }

      it('round-trips as a call argument', () => {
        const formatted = expectBroken(`let nums = [1, 2, 3]\nprint(${chain})`);
        expect(run(formatted)).toEqual(['12']);
      });

      it('round-trips as a non-final call argument', () => {
        // The `,` after the final link must stay on the final link's line.
        const formatted = expectBroken(`let nums = [1, 2, 3]\nprint(${chain}, "done")`);
        expect(run(formatted)).toEqual(['12 done']);
      });

      it('round-trips inside an if condition', () => {
        // The `{` opening the block must stay on the final link's line.
        const formatted = expectBroken(
          `let nums = [1, 2, 3]\nif ${chain} > 5 {\n  print("big")\n}`
        );
        expect(run(formatted)).toEqual(['big']);
      });

      it('round-trips as a return value', () => {
        const formatted = expectBroken(
          `fn total(nums) {\n  return ${chain}\n}\nprint(total([1, 2, 3]))`
        );
        expect(formatted).toContain('  return nums\n    .filter(');
        expect(run(formatted)).toEqual(['12']);
      });

      it('round-trips inside an array literal', () => {
        // The chain forces the enclosing literal multi-line too, because its
        // own single-line form now contains a newline.
        const formatted = expectBroken(`let nums = [1, 2, 3]\nprint([${chain}])`);
        expect(run(formatted)).toEqual(['[12]']);
      });

      it('round-trips as an object literal value', () => {
        const formatted = expectBroken(`let nums = [1, 2, 3]\nprint({t: ${chain}}.t)`);
        expect(run(formatted)).toEqual(['12']);
      });

      it('round-trips when nested two blocks deep', () => {
        // The continuation indent is absolute, so a chain in a nested block must
        // indent past the block, not back to column 2.
        const formatted = expectBroken(
          'fn outer(nums) {\n' +
            '  if true {\n' +
            `    let longVariableNameHere = ${chain} + 100000\n` +
            '    return longVariableNameHere\n' +
            '  }\n' +
            '  return 0\n' +
            '}\n' +
            'print(outer([1, 2, 3]))'
        );
        expect(formatted).toContain('    let longVariableNameHere = nums\n      .filter(');
        // The trailing `+ 100000` stays on the final link's line.
        expect(formatted).toContain('.reduce((acc, value) => acc + value, 0) + 100000\n');
        expect(run(formatted)).toEqual(['100012']);
      });
    });

    it('measures the chain, not the finished line (a known imprecision)', () => {
      // `currentLineWidth` counts the indentation plus the text it is handed, and
      // nothing knows how wide the statement prefix already is. So the decision
      // is made on the chain alone: here the chain is 75 columns and stays flat,
      // even though `let result = ` pushes the finished line to 88.
      //
      // This is inherited rather than introduced - `formatArrayLiteral` and
      // `formatObjectLiteral` have always measured the same way - and it is why
      // examples/04-arrays.tiny still has an 88-column chain. Pinning it here so
      // the limit is a documented property rather than a surprise; fixing it
      // means threading the prefix column through `formatExpression`, which
      // would change array and object breaking too.
      // Copied from examples/04-arrays.tiny, which is why that file still has a
      // line over the limit.
      const source =
        'let result = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((x) => x % 2 == 0).map((x) => x * x)';
      expect(source.length).toBe(88);

      const formatted = expectPreserved(source + '\nprint(result)');
      expect(formatted).toBe(source + '\nprint(result)\n');
      expect(run(formatted)).toEqual(['[4, 16, 36, 64, 100]']);
    });

    it('never starts a line with `?.`, which the parser cannot read back', () => {
      // `nextSignificantIsDot` requires a lone `.`, so `items\n  ?.filter(f)` is
      // a parse error. An optional step is folded into the receiver and stays on
      // the first line; the plain `.` links above it still break.
      const source =
        'let x = aMuchLongerReceiverName?.aFirstMethodCall().aSecondMethodCall().aThirdMethodCall()';
      const formatted = expectPreserved(source);
      expect(formatted).toBe(
        'let x = aMuchLongerReceiverName?.aFirstMethodCall()\n' +
          '  .aSecondMethodCall()\n' +
          '  .aThirdMethodCall()\n'
      );
      expect(formatted).not.toContain('?.\n');
      expect(formatted).not.toContain('\n  ?.');
    });

    it('leaves pipe expressions alone, however long', () => {
      // PipeMethodExpression is a separate node with its own rendering, and it is
      // deliberately untouched. A continuation line may not *begin* with `|>`
      // (`v\n  |> .map(g)` is a parse error), so the only layout the parser
      // accepts leaves `|>` dangling at the end of each line - a different and
      // worse shape than the leading-`.` style this change is about. No example
      // has an over-width pipe, so there is no evidence the same problem affects
      // them; if that changes, the dangling-`|>` question has to be settled
      // first.
      const source =
        'let outcome = sourceCollection |> .filterEntries((value) => value > 0) |> .mapEntries((value) => value * 2)';
      expect(source.length).toBeGreaterThan(80);

      const formatted = expectPreserved(source);
      expect(formatted).toBe(source + '\n');
      // The only newline is the final one; the pipe chain itself is unbroken.
      expect(formatted.trimEnd()).not.toContain('\n');
    });
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
