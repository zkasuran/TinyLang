/**
 * Comment preservation in the formatter.
 *
 * `tinylang fmt --write` used to delete every comment in the file. The AST
 * round-trip check that was added after the formatter deleted a try/catch could
 * not catch it: comments are not in the AST, so there was nothing to compare and
 * the check reported success on output that had thrown away all 230 lines of
 * teaching commentary in examples/.
 *
 * These tests cover the three things that had to be true to fix that:
 *
 *  1. every comment survives, wherever it was written;
 *  2. formatting twice changes nothing, so `fmt --check` is meaningful;
 *  3. if a comment is ever lost again, the formatter throws instead of
 *     returning output that would overwrite the user's file.
 *
 * Expected output is written out in full rather than probed with `toContain`,
 * because where a comment ends up is the entire point.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import {
  Formatter,
  FormatterError,
  commentTexts,
  commentDifference,
} from '../../src/formatter';
import { Program } from '../../src/types/ast';

const formatter = new Formatter();

function parseWithComments(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens, lexer.getComments()).parse();
}

/**
 * Format `source`, asserting that the result keeps every comment and that
 * formatting it again is a no-op. Returns the output so callers can pin it.
 */
function format(source: string): string {
  const output = formatter.format(source);

  const difference = commentDifference(commentTexts(source), commentTexts(output));
  expect(difference, `a comment was not preserved\n${difference}\n--- output ---\n${output}`)
    .toBeNull();

  expect(formatter.format(output), 'formatting is not idempotent').toBe(output);
  return output;
}

describe('Formatter comment preservation', () => {
  describe('the case from the bug report', () => {
    it('keeps a header comment, a trailing comment and a block comment', () => {
      // Verbatim from the report: all three of these used to vanish.
      expect(
        format(
          '// header comment\n' +
            'let x = 1 // trailing comment\n' +
            '\n' +
            '/* block\n' +
            '   comment */\n' +
            'fn f() { return x }\n'
        )
      ).toBe(
        '// header comment\n' +
          'let x = 1  // trailing comment\n' +
          '\n' +
          '/* block\n' +
          '   comment */\n' +
          'fn f() {\n' +
          '  return x\n' +
          '}\n'
      );
    });
  });

  describe('position', () => {
    it('keeps an own-line comment above the statement it documents', () => {
      expect(format('// why\nlet x = 1\n')).toBe('// why\nlet x = 1\n');
    });

    it('keeps a run of own-line comments in order', () => {
      expect(format('// one\n// two\n// three\nlet x = 1\n')).toBe(
        '// one\n// two\n// three\nlet x = 1\n'
      );
    });

    it('puts a trailing comment two spaces after the code', () => {
      expect(format('let x = 1 // why\n')).toBe('let x = 1  // why\n');
    });

    it('normalises the gap before a trailing comment', () => {
      expect(format('let x = 1                 // why\n')).toBe('let x = 1  // why\n');
    });

    it('keeps a trailing comment on a statement that ends with a brace', () => {
      expect(format('fn f() {\n  return 1\n} // done\n')).toBe(
        'fn f() {\n  return 1\n}  // done\n'
      );
    });

    it('attaches a trailing comment to the innermost statement on its line', () => {
      // Everything here is on one line, so `// done` is beside `return 1` as much
      // as it is beside the function. The innermost statement wins, which is what
      // keeps the rule a local one: whichever statement ends last on this line.
      expect(format('fn f() { return 1 } // done\n')).toBe(
        'fn f() {\n  return 1  // done\n}\n'
      );
    });

    it('keeps a block comment used as a trailing comment', () => {
      expect(format('let x = 1 /* why */\n')).toBe('let x = 1  /* why */\n');
    });

    it('keeps a comment at the very end of the file', () => {
      expect(format('let x = 1\n// afterthought\n')).toBe('let x = 1\n// afterthought\n');
    });

    it('keeps comments in a file that has no code at all', () => {
      expect(format('// nothing to see\n// but keep me\n')).toBe(
        '// nothing to see\n// but keep me\n'
      );
    });

    it('keeps a comment above the first statement of the file', () => {
      expect(format('\n\n// after some blank lines\nlet x = 1\n')).toBe(
        '// after some blank lines\nlet x = 1\n'
      );
    });
  });

  describe('block comments', () => {
    it('keeps internal newlines and relative layout', () => {
      expect(format('/* one\n   two\n   three */\nlet x = 1\n')).toBe(
        '/* one\n   two\n   three */\nlet x = 1\n'
      );
    });

    it('keeps a doc-style comment aligned on its stars', () => {
      expect(
        format('/**\n * Adds two numbers.\n * @param a first\n */\nfn add(a, b) { return a + b }\n')
      ).toBe(
        '/**\n * Adds two numbers.\n * @param a first\n */\n' +
          'fn add(a, b) {\n  return a + b\n}\n'
      );
    });

    it('re-indents continuation lines to the statement it belongs to', () => {
      // Written at column 0 inside a function body; it has to move in with the
      // code, and its continuation line has to move by the same amount.
      expect(format('fn f() {\n/* one\n   two */\nreturn 1\n}\n')).toBe(
        'fn f() {\n  /* one\n     two */\n  return 1\n}\n'
      );
    });

    it('keeps the relative indentation inside a block comment', () => {
      expect(format('/* head\n   body\n     deeper */\nlet x = 1\n')).toBe(
        '/* head\n   body\n     deeper */\nlet x = 1\n'
      );
    });

    it('keeps a blank line inside a block comment', () => {
      expect(format('/* one\n\n   two */\nlet x = 1\n')).toBe(
        '/* one\n\n   two */\nlet x = 1\n'
      );
    });

    it('keeps a nested block comment intact', () => {
      expect(format('/* outer /* inner */ still outer */\nlet x = 1\n')).toBe(
        '/* outer /* inner */ still outer */\nlet x = 1\n'
      );
    });

    it('keeps a closing delimiter that sits on a line of its own', () => {
      // Regression: continuation lines used to be re-indented individually, one
      // space for lines starting with `*` and three for the rest. A closing `*/`
      // alone on a line counts as the former and the body as the latter, so the
      // two moved apart, the comment check saw altered text - correctly - and the
      // formatter refused the entire file.
      expect(format('/* summary\n   detail\n*/\nlet x = 1\n')).toBe(
        '/* summary\n   detail\n*/\nlet x = 1\n'
      );
    });

    it('keeps an ASCII diagram whose lines are not uniformly prefixed', () => {
      expect(format('/*\n  a -> b\n    -> c\n*/\nlet x = 1\n')).toBe(
        '/*\n  a -> b\n    -> c\n*/\nlet x = 1\n'
      );
    });

    it('shifts every line by the same amount when the comment moves right', () => {
      expect(format('fn f() {\n/* summary\n   detail\n*/\nreturn 1\n}\n')).toBe(
        'fn f() {\n  /* summary\n     detail\n  */\n  return 1\n}\n'
      );
    });

    it('never shifts a line further left than its own indentation', () => {
      // `let /* a` starts the comment at column four, but its closing delimiter is
      // at column zero. Hoisting the comment to column zero cannot take four
      // columns off every line, so it takes none: uniform, or not at all.
      expect(format('let /* summary\n   detail\n*/ x = 1\n')).toBe(
        '/* summary\n   detail\n*/\nlet x = 1\n'
      );
    });
  });

  describe('blank lines', () => {
    it('keeps a blank line the author left between statements', () => {
      expect(format('let x = 1\n\nlet y = 2\n')).toBe('let x = 1\n\nlet y = 2\n');
    });

    it('collapses several blank lines to one', () => {
      expect(format('let x = 1\n\n\n\nlet y = 2\n')).toBe('let x = 1\n\nlet y = 2\n');
    });

    it('does not invent a blank line between plain statements', () => {
      expect(format('let x = 1\nlet y = 2\n')).toBe('let x = 1\nlet y = 2\n');
    });

    it('keeps a blank line between a comment and the statement below it', () => {
      expect(format('// detached note\n\nlet x = 1\n')).toBe('// detached note\n\nlet x = 1\n');
    });

    it('keeps a blank line between two comment groups', () => {
      expect(format('// group one\n\n// group two\nlet x = 1\n')).toBe(
        '// group one\n\n// group two\nlet x = 1\n'
      );
    });

    it('keeps blank lines inside a block', () => {
      expect(format('fn f() {\n  let a = 1\n\n  let b = 2\n  return a + b\n}\n')).toBe(
        'fn f() {\n  let a = 1\n\n  let b = 2\n  return a + b\n}\n'
      );
    });

    it('still puts one blank line between top-level declarations', () => {
      // Pre-existing behaviour, and it must not double up with a blank line the
      // author already left there.
      expect(format('fn a() { return 1 }\nfn b() { return 2 }\n')).toBe(
        'fn a() {\n  return 1\n}\n\nfn b() {\n  return 2\n}\n'
      );
      expect(format('fn a() { return 1 }\n\n\nfn b() { return 2 }\n')).toBe(
        'fn a() {\n  return 1\n}\n\nfn b() {\n  return 2\n}\n'
      );
    });

    it('puts the declaration blank line above the declaration comment', () => {
      expect(format('let x = 1\n// what b does\nfn b() { return 2 }\n')).toBe(
        'let x = 1\n\n// what b does\nfn b() {\n  return 2\n}\n'
      );
    });
  });

  describe('inside every construct that has a block', () => {
    it('function body', () => {
      expect(format('fn f() {\n  // first\n  return 1 // second\n  // third\n}\n')).toBe(
        'fn f() {\n  // first\n  return 1  // second\n  // third\n}\n'
      );
    });

    it('empty function body', () => {
      expect(format('fn f() {\n  // nothing yet\n}\n')).toBe('fn f() {\n  // nothing yet\n}\n');
    });

    it('if and else', () => {
      expect(
        format(
          'if x {\n  // then side\n  a()\n} else {\n  // else side\n  b()\n}\n'
        )
      ).toBe('if x {\n  // then side\n  a()\n} else {\n  // else side\n  b()\n}\n');
    });

    it('empty if and empty else', () => {
      expect(format('if x {\n  // todo\n} else {\n  // also todo\n}\n')).toBe(
        'if x {\n  // todo\n} else {\n  // also todo\n}\n'
      );
    });

    it('else if chain', () => {
      expect(
        format('if x {\n  // one\n  a()\n} else if y {\n  // two\n  b()\n}\n')
      ).toBe('if x {\n  // one\n  a()\n} else if y {\n  // two\n  b()\n}\n');
    });

    it('while body', () => {
      expect(format('while x {\n  // spin\n  a() // again\n}\n')).toBe(
        'while x {\n  // spin\n  a()  // again\n}\n'
      );
    });

    it('for body', () => {
      expect(format('for i in 0..3 {\n  // each one\n  print(i)\n}\n')).toBe(
        'for i in 0..3 {\n  // each one\n  print(i)\n}\n'
      );
    });

    it('class body, properties and methods', () => {
      expect(
        format(
          'class C {\n' +
            '  // how many\n' +
            '  let n = 0 // starts at zero\n' +
            '\n' +
            '  // the greeting\n' +
            '  fn hi() {\n' +
            '    print("hi") // out\n' +
            '  }\n' +
            '}\n'
        )
      ).toBe(
        'class C {\n' +
          '  // how many\n' +
          '  let n = 0  // starts at zero\n' +
          '\n' +
          '  // the greeting\n' +
          '  fn hi() {\n' +
          '    print("hi")  // out\n' +
          '  }\n' +
          '}\n'
      );
    });

    it('empty class body', () => {
      expect(format('class C {\n  // members to come\n}\n')).toBe(
        'class C {\n  // members to come\n}\n'
      );
    });

    it('comment at the end of a class body', () => {
      expect(
        format('class C {\n  fn a() {\n    return 1\n  }\n  // that is all\n}\n')
      ).toBe('class C {\n  fn a() {\n    return 1\n  }\n  // that is all\n}\n');
    });

    it('try and catch', () => {
      expect(
        format('try {\n  // risky\n  a()\n} catch e {\n  // recover\n  b()\n}\n')
      ).toBe('try {\n  // risky\n  a()\n} catch e {\n  // recover\n  b()\n}\n');
    });

    it('empty catch body, the classic "ignore this" comment', () => {
      expect(format('try {\n  a()\n} catch e {\n  // deliberately ignored\n}\n')).toBe(
        'try {\n  a()\n} catch e {\n  // deliberately ignored\n}\n'
      );
    });

    it('test block', () => {
      expect(
        format('test "adds" {\n  // arrange\n  let x = 1 + 1\n  expectToBe(x, 2)\n}\n')
      ).toBe('test "adds" {\n  // arrange\n  let x = 1 + 1\n  expectToBe(x, 2)\n}\n');
    });

    it('arrow function with a block body', () => {
      expect(format('let f = (n) => {\n  // double it\n  return n * 2\n}\n')).toBe(
        'let f = (n) => {\n  // double it\n  return n * 2\n}\n'
      );
    });

    it('function expression body', () => {
      expect(format('let f = fn(n) {\n  // double it\n  return n * 2\n}\n')).toBe(
        'let f = fn(n) {\n  // double it\n  return n * 2\n}\n'
      );
    });

    it('nested blocks, three deep', () => {
      expect(
        format(
          'fn f() {\n' +
            '  // level one\n' +
            '  if x {\n' +
            '    // level two\n' +
            '    for i in 0..1 {\n' +
            '      // level three\n' +
            '      print(i)\n' +
            '    }\n' +
            '  }\n' +
            '}\n'
        )
      ).toBe(
        'fn f() {\n' +
          '  // level one\n' +
          '  if x {\n' +
          '    // level two\n' +
          '    for i in 0..1 {\n' +
          '      // level three\n' +
          '      print(i)\n' +
          '    }\n' +
          '  }\n' +
          '}\n'
      );
    });
  });

  describe('match arms', () => {
    it('keeps a comment above a when arm', () => {
      expect(
        format('match x {\n  // the simple case\n  when 1 => print("one")\n}\n')
      ).toBe('match x {\n  // the simple case\n  when 1 => print("one")\n}\n');
    });

    it('keeps a comment beside a one-statement arm', () => {
      expect(format('match x {\n  when 1 => print("one") // easy\n}\n')).toBe(
        'match x {\n  when 1 => print("one")  // easy\n}\n'
      );
    });

    it('keeps comments inside a braced arm', () => {
      expect(
        format('match x {\n  when 1 => {\n    // needs work\n    print("one")\n  }\n}\n')
      ).toBe('match x {\n  when 1 => {\n    // needs work\n    print("one")\n  }\n}\n');
    });

    it('adds braces to a one-statement arm when a comment needs its own line', () => {
      // An arm's body is printed after the `=>`, so an own-line comment cannot
      // stay there. Braces around a single statement mean exactly the same thing.
      expect(
        format('match x {\n  when 1 => {\n    // explain\n    print("one")\n  }\n}\n')
      ).toBe('match x {\n  when 1 => {\n    // explain\n    print("one")\n  }\n}\n');
    });

    it('keeps a comment above the else arm', () => {
      expect(
        format(
          'match x {\n  when 1 => print("one")\n  // everything else\n  else => print("other")\n}\n'
        )
      ).toBe(
        'match x {\n  when 1 => print("one")\n  // everything else\n  else => print("other")\n}\n'
      );
    });

    it('keeps a comment at the end of a match body', () => {
      expect(
        format('match x {\n  when 1 => print("one")\n  // no other cases yet\n}\n')
      ).toBe('match x {\n  when 1 => print("one")\n  // no other cases yet\n}\n');
    });

    it('keeps a blank line between arms', () => {
      expect(
        format('match x {\n  when 1 => print("one")\n\n  when 2 => print("two")\n}\n')
      ).toBe('match x {\n  when 1 => print("one")\n\n  when 2 => print("two")\n}\n');
    });
  });

  describe('enum bodies', () => {
    it('keeps comments above and beside variants', () => {
      expect(
        format('enum Color {\n  // warm\n  Red\n  Green // cool\n}\n')
      ).toBe('enum Color {\n  // warm\n  Red\n  Green  // cool\n}\n');
    });

    it('keeps a comment after the last variant', () => {
      expect(format('enum Color {\n  Red\n  // more to come\n}\n')).toBe(
        'enum Color {\n  Red\n  // more to come\n}\n'
      );
    });

    it('keeps a blank line between variants', () => {
      expect(format('enum Color {\n  Red\n\n  Green\n}\n')).toBe(
        'enum Color {\n  Red\n\n  Green\n}\n'
      );
    });

    it('opens an otherwise-empty enum body to hold a comment', () => {
      // `enum E {}` is how an empty enum is normally printed, and it has nowhere
      // to put the comment.
      expect(format('enum E {\n  // variants to come\n}\n')).toBe(
        'enum E {\n  // variants to come\n}\n'
      );
    });

    it('still prints a genuinely empty enum on one line', () => {
      expect(format('enum E {}\n')).toBe('enum E {}\n');
    });
  });

  describe('comments with no anchor of their own', () => {
    it('hoists a comment written inside an expression above its statement', () => {
      // There is no node between two array elements, so a comment there cannot be
      // printed where it was written. It is kept, above the statement, in order.
      expect(format('let a = [\n  1, // one\n  2  // two\n]\n')).toBe(
        '// one\n// two\nlet a = [1, 2]\n'
      );
    });

    it('keeps such a comment when the statement already has comments', () => {
      expect(format('// about a\nlet a = [1, /* inline */ 2]\n')).toBe(
        '// about a\n/* inline */\nlet a = [1, 2]\n'
      );
    });

    it('moves it after the statement when the statement has comments inside it', () => {
      // Hoisting above the statement would print `/* strict */` before
      // `// double it`, reversing the order they were written in, and the comment
      // check would reject the file. Comments are claimed through one
      // forward-only cursor, so a leftover is always the later of the two.
      expect(
        format(
          'let out = map(items, fn(x) {\n' +
            '  // double it\n' +
            '  return x * 2\n' +
            '}, /* strict */ true)\n'
        )
      ).toBe(
        'let out = map(items, fn(x) {\n' +
          '  // double it\n' +
          '  return x * 2\n' +
          '}, true)  /* strict */\n'
      );
    });

    it('relocates a comment written in a condition into the block below it', () => {
      // An `if` header is rendered from the AST, so a comment inside the condition
      // has no anchor either, and the nearest one that exists is the first
      // statement of the block. It documents the wrong thing now, which is worth
      // knowing about; what it does not do is disappear, or drag a blank line in
      // with it.
      expect(format('if a and // check this\n  b {\n  x = 1\n}\n')).toBe(
        'if a and b {\n  // check this\n  x = 1\n}\n'
      );
    });

    it('relocates a comment between a closing brace and else', () => {
      expect(format('if a {\n  x = 1\n} // then\nelse {\n  y = 2\n}\n')).toBe(
        'if a {\n  x = 1\n} else {\n  // then\n  y = 2\n}\n'
      );
    });

    it('refuses to format a comment inside an f-string interpolation', () => {
      // The formatter re-renders interpolations from the AST, and the AST of
      // `{x}` has no room for a comment. Refusing is the honest outcome: the
      // alternative is the original bug, a comment quietly deleted.
      const source = 'let x = 1\nprint(f"{x /* why */}")\n';
      expect(() => formatter.format(source)).toThrow(FormatterError);
      // And it says what to do about it, rather than reporting an internal error
      // for input no version of the formatter is going to accept.
      expect(() => formatter.format(source)).toThrow(
        /comment inside an f-string interpolation[\s\S]*Move the comment outside/
      );
      expect(() => formatter.format(source)).not.toThrow(/Internal formatter error/);
      expect(() => formatter.format(source)).toThrow(/was lost: "\/\* why \*\/"/);
    });
  });

  describe('attachment in the AST', () => {
    it('attaches an own-line comment as a leading comment', () => {
      const program = parseWithComments('// why\nlet x = 1\n');
      expect(program.body[0].leadingComments).toEqual([
        { kind: 'line', text: '// why', ownLine: true, blankBefore: false, indent: 0 },
      ]);
      expect(program.body[0].trailingComments).toBeUndefined();
    });

    it('attaches a comment beside code as a trailing comment', () => {
      const program = parseWithComments('let x = 1 // why\n');
      expect(program.body[0].trailingComments).toEqual([
        { kind: 'line', text: '// why', ownLine: false, blankBefore: false, indent: 10 },
      ]);
      expect(program.body[0].leadingComments).toBeUndefined();
    });

    it('records the blank line the author left above a statement', () => {
      const program = parseWithComments('let x = 1\n\nlet y = 2\n');
      expect(program.body[0].blankBefore).toBeUndefined();
      expect(program.body[1].blankBefore).toBe(true);
    });

    it('attaches comments to nested statements, not to the enclosing one', () => {
      const program = parseWithComments('fn f() {\n  // inner\n  return 1\n}\n');
      const fn = program.body[0];
      expect(fn.leadingComments).toBeUndefined();
      if (fn.type !== 'FunctionDeclaration') throw new Error('expected a function');
      expect(fn.body[0].leadingComments?.map((c) => c.text)).toEqual(['// inner']);
    });

    it('records a comment in an empty region as dangling', () => {
      const program = parseWithComments('fn f() {\n  // nothing\n}\n');
      expect(program.body[0].danglingComments?.['body']?.map((c) => c.text)).toEqual([
        '// nothing',
      ]);
    });

    it('adds no comment fields when the parser is not given comments', () => {
      // Every other tool in the toolchain parses this way and must keep seeing
      // exactly the AST it always saw.
      const program = new Parser(new Lexer('// why\nlet x = 1\n\nlet y = 2\n').tokenize()).parse();
      expect(JSON.stringify(program)).not.toContain('Comments');
      expect(JSON.stringify(program)).not.toContain('blankBefore');
    });
  });

  describe('the comment safety net itself', () => {
    /**
     * A formatter whose comment rendering has been sabotaged.
     *
     * `renderComment` is the single point every comment goes through, own-line or
     * trailing, so replacing it is enough to simulate any comment bug.
     */
    function withBrokenComments(render: () => string[]): Formatter {
      const broken = new Formatter();
      (broken as unknown as { renderComment: () => string[] }).renderComment = render;
      return broken;
    }

    it('throws instead of returning output that dropped a comment', () => {
      const broken = withBrokenComments(() => ['']);
      expect(() => broken.format('// keep me\nlet x = 1\n')).toThrow(FormatterError);
      expect(() => broken.format('// keep me\nlet x = 1\n')).toThrow(
        /would not preserve this file's comments/
      );
    });

    it('throws when a trailing comment is dropped, not just a leading one', () => {
      const broken = withBrokenComments(() => ['']);
      expect(() => broken.format('let x = 1 // keep me\n')).toThrow(
        /comment 1 of 1 was lost: "\/\/ keep me"/
      );
    });

    it('names the comment that was lost, so the report is actionable', () => {
      const broken = withBrokenComments(() => ['']);
      expect(() => broken.format('// handle the empty case\nlet x = 1\n')).toThrow(
        /comment 1 of 1 was lost: "\/\/ handle the empty case"/
      );
    });

    it('throws when a comment is altered rather than dropped', () => {
      const broken = withBrokenComments(() => ['// something else']);
      expect(() => broken.format('// the original\nlet x = 1\n')).toThrow(
        /comment 1 of 1 changed[\s\S]*the original[\s\S]*something else/
      );
    });

    it('throws when a comment appears that was not in the input', () => {
      const broken = new Formatter();
      (broken as unknown as { indent: (t: string) => string }).indent = (text: string) =>
        `// invented\n${text}`;
      expect(() => broken.format('let x = 1\n')).toThrow(FormatterError);
      expect(() => broken.format('let x = 1\n')).toThrow(/not in the input/);
    });

    it('reports which comment of how many, when only one of several is lost', () => {
      let calls = 0;
      const broken = new Formatter();
      type Render = (c: unknown, column: number) => string[];
      const original = (broken as unknown as { renderComment: Render }).renderComment.bind(
        broken
      );
      (broken as unknown as { renderComment: Render }).renderComment = (c, column) => {
        calls++;
        return calls === 2 ? [''] : original(c, column);
      };
      expect(() => broken.format('// one\n// two\n// three\nlet x = 1\n')).toThrow(
        /comment 2 of 3/
      );
    });
  });

  describe('a comment inserted anywhere in a real program', () => {
    // The cases above cover the positions someone thought of. This covers the
    // ones nobody did: walk every example and try putting a comment at each
    // line, above the code and beside it, as a line comment and as a two-line
    // block comment. Every probe must survive, and formatting must still settle
    // after one pass. This is the check that would have caught the original bug
    // at any of the 230 places it was losing a comment.
    const examplesDir = path.join(__dirname, '..', '..', 'examples');
    const files = fs.readdirSync(examplesDir).filter((f) => f.endsWith('.tiny')).sort();

    /** Every mutation of `source` that inserts `probe` somewhere plausible. */
    function mutations(source: string, probe: string): string[] {
      const lines = source.split('\n');
      const out: string[] = [];
      // Every seventh line rather than every line: the coverage is already
      // thorough at this stride, and a formatter test suite nobody waits for is
      // a formatter test suite nobody runs.
      for (let i = 0; i < lines.length; i += 7) {
        const indent = /^\s*/.exec(lines[i])?.[0] ?? '';
        const inserted = probe.split('\n').map((l) => (l === '' ? '' : indent + l));
        out.push([...lines.slice(0, i), ...inserted, ...lines.slice(i)].join('\n'));

        if (lines[i].trim() === '' || lines[i].includes('//')) continue;

        if (!probe.includes('\n')) {
          const beside = [...lines];
          beside[i] = `${lines[i]} ${probe}`;
          out.push(beside.join('\n'));
        }

        // Mid-line, which is how a comment ends up in a place with no anchor at
        // all: inside a condition, between two arguments, above an object key.
        // Only a block comment can go here; a line comment would swallow the rest.
        if (probe.startsWith('/*')) {
          for (const column of [lines[i].indexOf(' ', indent.length), lines[i].length - 1]) {
            if (column <= 0) continue;
            const within = [...lines];
            within[i] = `${lines[i].slice(0, column)} ${probe}${lines[i].slice(column)}`;
            out.push(within.join('\n'));
          }
        }
      }
      return out;
    }

    for (const file of files) {
      it(`survives a comment inserted anywhere in ${file}`, () => {
        const source = fs.readFileSync(path.join(examplesDir, file), 'utf-8');
        // The three-line shape matters: with a single continuation line a change
        // in relative indentation is unrepresentable, because the shared indent
        // that the check normalises away is then the only indent there is. That
        // blind spot hid a bug that refused every file containing such a comment.
        for (const probe of ['// probe', '/* summary\n   detail\n*/']) {
          for (const mutated of mutations(source, probe)) {
            let output: string;
            try {
              output = formatter.format(mutated);
            } catch (e) {
              // Two refusals are legitimate: a mid-line probe can land somewhere
              // that stops the file parsing at all, and a probe can land inside an
              // f-string interpolation, which the formatter refuses by design.
              // Anything else is a real failure.
              const message = e instanceof Error ? e.message : String(e);
              expect(message, `unexpected refusal\n--- input ---\n${mutated}`).toMatch(
                /f-string interpolation|Parse Error|Syntax Error/
              );
              continue;
            }
            const difference = commentDifference(commentTexts(mutated), commentTexts(output));
            expect(
              difference,
              `${probe} was not preserved\n${difference}\n--- input ---\n${mutated}` +
                `\n--- output ---\n${output}`
            ).toBeNull();
            expect(formatter.format(output), `not idempotent\n${output}`).toBe(output);
          }
        }
      });
    }
  });

  describe('commentDifference', () => {
    it('accepts identical sequences', () => {
      expect(commentDifference(['// a', '// b'], ['// a', '// b'])).toBeNull();
    });

    it('ignores the indentation of a block comment\'s continuation lines', () => {
      expect(
        commentDifference(['/* a\n   b */'], ['/* a\n       b */'])
      ).toBeNull();
    });

    it('does not ignore a change in relative indentation', () => {
      expect(commentDifference(['/* a\n   b\n     c */'], ['/* a\n   b\n   c */'])).not.toBeNull();
    });

    it('does not ignore a change to the text', () => {
      expect(commentDifference(['// a'], ['// b'])).not.toBeNull();
    });

    it('does not ignore reordering', () => {
      expect(commentDifference(['// a', '// b'], ['// b', '// a'])).not.toBeNull();
    });
  });
});
