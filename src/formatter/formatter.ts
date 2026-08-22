/**
 * TinyLang Formatter - AST-based Pretty Printer
 *
 * Produces clean, consistently formatted TinyLang source code.
 *
 * Three properties matter more than the aesthetics, and all three are enforced
 * rather than hoped for:
 *
 *  1. Meaning preservation. Every formatted result is re-lexed, re-parsed and
 *     compared against the AST it came from; if anything differs the formatter
 *     throws instead of returning output. `fmt --write` overwrites the user's
 *     file, so silently dropping or re-associating code is unacceptable. This
 *     used to happen: the statement and expression switches ended in
 *     `default: return ''`, so try/catch, throw, destructuring, enums,
 *     f-strings, spreads, pipes, optional chaining and nullish coalescing all
 *     formatted to an empty string and vanished. Separately, grouping
 *     parentheses leave no AST node, and nothing re-inserted them, so
 *     `(low + high) / 2` was rewritten to `low + high / 2`.
 *
 *  2. Comment preservation. Every comment in the input appears in the output,
 *     once, unaltered and in the same order. This needs its own check: comments
 *     are not part of the AST, so the round-trip in (1) is blind to them, and
 *     the formatter used to delete every comment in the file while passing that
 *     check with nothing to report. The comparison is by comment text, not by
 *     position, because a comment may legitimately have to move - see
 *     ./comments.ts for exactly what is and is not allowed to change.
 *
 *     Together (1) and (2) give the only guarantee worth making to a tool that
 *     rewrites a file in place: it returns output only when that output means
 *     what the input meant *and* still says everything the input said.
 *
 *     What (2) does not promise is that a comment stays where it was written.
 *     Expressions are rendered from the AST, and the AST has no room between two
 *     array elements or inside an `if` condition, so a comment written there is
 *     moved to the nearest anchor that does exist - above the statement, after
 *     it, or into the block that follows. Its text and its order survive; its
 *     column, and sometimes what it appears to be documenting, do not. The one
 *     position with no anchor at any distance is inside an f-string
 *     interpolation, and that is refused outright rather than quietly dropped.
 *
 *  3. Idempotency: format(format(code)) === format(code). Rendering is a pure
 *     function of the AST plus the comment and blank-line layout attached to it,
 *     and formatting reproduces that layout, so a second pass has nothing left
 *     to change.
 *
 * Both switches below are exhaustive over their AST unions and end in a `never`
 * guard, the same pattern the bytecode compiler uses. A new node type is a
 * compile error here, not a silent deletion at runtime.
 */

import { Lexer } from '../lexer';
import { Parser } from '../parser';
import {
  Program,
  Statement,
  Expression,
  VariableDeclaration,
  DestructuringDeclaration,
  FunctionDeclaration,
  ClassDeclaration,
  EnumDeclaration,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  PrintStatement,
  MatchStatement,
  ExpressionStatement,
  ImportStatement,
  TestDeclaration,
  TryCatchStatement,
  ThrowStatement,
  BinaryExpression,
  UnaryExpression,
  LogicalExpression,
  AssignmentExpression,
  CallExpression,
  MemberExpression,
  IndexExpression,
  OptionalMemberExpression,
  OptionalIndexExpression,
  NullishCoalesceExpression,
  ArrowFunction,
  FunctionExpression,
  NewExpression,
  RangeExpression,
  TernaryExpression,
  SpreadExpression,
  PipeExpression,
  PipeMethodExpression,
  InterpolatedString,
  ArrayLiteral,
  ObjectLiteral,
  Parameter,
  Comment,
  CommentAnchor,
  MatchCase,
} from '../types/ast';
import { FormatOptions, DEFAULT_FORMAT_OPTIONS } from './config';
import { FormatterError } from './errors';
import { astDifference } from './equivalence';
import {
  commentTexts,
  commentDifference,
  commonIndent,
  hasInterpolatedComment,
} from './comments';

/**
 * Expression binding strength, mirroring the parser's descent exactly.
 *
 * A grouping `(...)` produces no AST node, so the only way to know whether a
 * subexpression needs parentheses is to compare how tightly it binds against
 * how tightly its position requires it to bind. Every level here corresponds to
 * one parse function in src/parser/parser.ts; keep them in step.
 */
enum Prec {
  /** A full expression, as parsed by parseExpression. */
  Lowest = 0,
  Assignment = 1,
  Ternary = 2,
  Pipe = 3,
  Nullish = 4,
  Or = 5,
  And = 6,
  Equality = 7,
  Comparison = 8,
  Range = 9,
  Additive = 10,
  Multiplicative = 11,
  Power = 12,
  Unary = 13,
  /** Call, member, index and their optional forms. */
  Postfix = 14,
  /** Literals, identifiers and other self-delimiting forms. */
  Primary = 15,
}

const BINARY_PRECEDENCE: Readonly<Record<string, Prec>> = {
  '==': Prec.Equality,
  '!=': Prec.Equality,
  '<': Prec.Comparison,
  '<=': Prec.Comparison,
  '>': Prec.Comparison,
  '>=': Prec.Comparison,
  '+': Prec.Additive,
  '-': Prec.Additive,
  '*': Prec.Multiplicative,
  '/': Prec.Multiplicative,
  '%': Prec.Multiplicative,
  '**': Prec.Power,
};

export class Formatter {
  private options: FormatOptions;
  private indentLevel: number = 0;

  constructor(options?: Partial<FormatOptions>) {
    this.options = { ...DEFAULT_FORMAT_OPTIONS, ...options };
  }

  /**
   * Format a TinyLang source string.
   *
   * @throws FormatterError if the result cannot be shown to mean what the input
   * meant and to contain the same comments. Callers may rely on this: output that
   * is returned has been verified on both counts.
   */
  format(source: string, options?: Partial<FormatOptions>): string {
    const opts = options ? { ...this.options, ...options } : this.options;
    const prevOptions = this.options;
    this.options = opts;
    this.indentLevel = 0;

    try {
      const program = parseSource(source);
      const body = this.formatProgram(program);
      const result = opts.insertFinalNewline ? body + '\n' : body;
      this.verifyRoundTrip(program, result);
      this.verifyComments(source, result);
      return result;
    } finally {
      this.options = prevOptions;
    }
  }

  /**
   * Prove that `output` parses back to the AST it was rendered from.
   *
   * Exhaustive switches catch node types the formatter has never heard of. This
   * catches everything else: a missing pair of parentheses, a dropped escape, a
   * construct whose printed form the parser reads back differently. Without it
   * the formatter can only promise to handle the mistakes someone anticipated.
   */
  private verifyRoundTrip(program: Program, output: string): void {
    let reparsed: Program;
    try {
      reparsed = parseSource(output);
    } catch (e) {
      throw new FormatterError(
        'Internal formatter error: the formatted output does not parse. ' +
          'Refusing to return it, because it would corrupt the file.\n' +
          `Parse error: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const difference = astDifference(program, reparsed);
    if (difference !== null) {
      throw new FormatterError(
        'Internal formatter error: formatting would change the meaning of this ' +
          'code. Refusing to return the result.\n' +
          `First difference at ${difference}`
      );
    }
  }

  /**
   * Prove that `output` still contains every comment `source` did.
   *
   * This is the check the AST round trip structurally cannot perform. Comments
   * are absent from the AST, so when the formatter deleted all of them - a
   * header, an explanation of an algorithm, 230 lines of teaching commentary
   * across the examples - astDifference had nothing to compare and reported
   * success. Comparing the comment text of the input against the comment text of
   * the output is the only way to notice, and it is done before the result is
   * handed back, never after.
   */
  private verifyComments(source: string, output: string): void {
    const difference = commentDifference(commentTexts(source), commentTexts(output));
    if (difference === null) return;

    // One cause is not a defect and never will be fixable: an interpolation is
    // re-rendered from the AST of the expression inside it, and that AST has no
    // room for a comment. Say so, rather than asking for a bug report about a
    // file the formatter is never going to accept.
    if (hasInterpolatedComment(source)) {
      throw new FormatterError(
        'Cannot format this file: it has a comment inside an f-string ' +
          'interpolation, which the formatter cannot put back - the text between ' +
          '{ and } is re-rendered from the expression it contains. Move the ' +
          'comment outside the string.\n' +
          difference
      );
    }

    throw new FormatterError(
      'Internal formatter error: formatting would not preserve this file\'s ' +
        'comments. Refusing to return the result.\n' +
        difference
    );
  }

  private formatProgram(program: Program): string {
    const parts: string[] = [];
    let prevWasDeclaration = false;

    for (let i = 0; i < program.body.length; i++) {
      const stmt = program.body[i];
      const isDeclaration = stmt.type === 'FunctionDeclaration' ||
        stmt.type === 'ClassDeclaration' ||
        stmt.type === 'TestDeclaration' ||
        stmt.type === 'EnumDeclaration';

      // A blank line between top-level declarations, and wherever the author left
      // one. Exactly one either way: two rules asking for a blank line still only
      // produce one, which is what keeps a second formatting pass a no-op.
      if (i > 0 && (isDeclaration || prevWasDeclaration || leadingBlank(stmt))) {
        parts.push('');
      }

      parts.push(...this.statementLines(stmt));
      prevWasDeclaration = isDeclaration;
    }

    // A file whose only content is comments still has to keep them.
    if (program.body.length === 0) {
      parts.push(
        ...this.ownLineCommentLines(program.danglingComments?.['body'] ?? [])
      );
    }

    return parts.join('\n');
  }

  // ============ Comments ============

  /**
   * Lines for a statement: its own-line comments, its code, its trailing comment.
   */
  private statementLines(stmt: Statement): string[] {
    return this.anchoredLines(stmt, this.formatStatement(stmt).split('\n'));
  }

  /**
   * Lines for anything a comment can be attached to, given the lines of the
   * thing itself.
   *
   * `blankBefore` on the anchor is the blank line between the *last* leading
   * comment and the code. The blank line above the whole group belongs to
   * whatever is printing the list, which is why it is not emitted here.
   */
  private anchoredLines(anchor: CommentAnchor, codeLines: string[]): string[] {
    const leading = anchor.leadingComments ?? [];
    const lines = this.ownLineCommentLines(leading);
    if (leading.length > 0 && anchor.blankBefore) lines.push('');
    lines.push(...this.withTrailingComments(codeLines, anchor.trailingComments));
    return lines;
  }

  /**
   * Render own-line comments, keeping the blank lines the author put *between*
   * them. The blank line above the first one is the caller's business.
   */
  private ownLineCommentLines(comments: Comment[]): string[] {
    const lines: string[] = [];
    for (let i = 0; i < comments.length; i++) {
      if (i > 0 && comments[i].blankBefore) lines.push('');
      lines.push(...this.commentLines(comments[i]));
    }
    return lines;
  }

  /**
   * Append trailing comments to already-rendered code.
   *
   * The first goes on the same line, two spaces after the code, unless it
   * occupied a line of its own in the source - which is how a comment written
   * just above a closing brace gets back to just above that closing brace.
   */
  private withTrailingComments(codeLines: string[], trailing?: Comment[]): string[] {
    if (trailing === undefined || trailing.length === 0) return codeLines;

    const lines = [...codeLines];
    let next = 0;
    // Block comments are self-delimiting, so several can share the code's line; a
    // line comment runs to the end of the line and has to be the last thing on it.
    while (next < trailing.length && !trailing[next].ownLine) {
      const last = lines.length - 1;
      const rendered = this.renderComment(trailing[next], lines[last].length + 2);
      lines[last] += '  ' + rendered[0];
      lines.push(...rendered.slice(1));
      const endsTheLine = trailing[next].kind === 'line';
      next++;
      if (endsTheLine) break;
    }
    for (; next < trailing.length; next++) {
      if (trailing[next].blankBefore) lines.push('');
      lines.push(...this.commentLines(trailing[next]));
    }
    return lines;
  }

  /** One comment on lines of its own, at the current indentation. */
  private commentLines(comment: Comment): string[] {
    const indent = this.indentLevel * this.options.indentSize;
    const rendered = this.renderComment(comment, indent);
    return [this.indentStr() + rendered[0], ...rendered.slice(1)];
  }

  /**
   * One comment, with its first character destined for `column`. The first line
   * comes back unindented, because it may be appended after code.
   *
   * A block comment's interior is reproduced verbatim, shifted by however far its
   * first line moves. Shifting every line by the same amount is the whole point:
   * an ASCII diagram, an indented example, or a closing delimiter on its own line
   * only survives if the lines keep their positions relative to one another. An
   * earlier version chose the shift per line - one space for `*`-prefixed lines,
   * three for the rest - which sheared apart every comment whose lines were not
   * uniformly `*`-prefixed and, since relative indentation is compared exactly,
   * made the formatter refuse the file rather than return it.
   */
  private renderComment(comment: Comment, column: number): string[] {
    const raw = comment.text.split('\n');
    if (raw.length === 1) return [raw[0]];

    const continuations = raw.slice(1).map((line) => line.replace(/[ \t]+$/, ''));
    // Moving left is limited by the least-indented line: taking four columns off
    // a line that only has three would shear it away from the others, which is
    // the one thing the shift exists to prevent. `let /* a` puts a comment at
    // column four whose closing delimiter is at column zero, and this is what
    // stops that comment being pulled apart when it is hoisted to column zero.
    const shift = Math.max(column - comment.indent, -commonIndent(continuations));
    return [raw[0], ...continuations.map((line) => shiftIndent(line, shift))];
  }

  // ============ Statements ============

  private formatStatement(stmt: Statement): string {
    switch (stmt.type) {
      case 'VariableDeclaration':
        return this.formatVariableDeclaration(stmt);
      case 'DestructuringDeclaration':
        return this.formatDestructuringDeclaration(stmt);
      case 'FunctionDeclaration':
        return this.formatFunctionDeclaration(stmt);
      case 'ClassDeclaration':
        return this.formatClassDeclaration(stmt);
      case 'EnumDeclaration':
        return this.formatEnumDeclaration(stmt);
      case 'ReturnStatement':
        return this.formatReturnStatement(stmt);
      case 'IfStatement':
        return this.formatIfStatement(stmt);
      case 'WhileStatement':
        return this.formatWhileStatement(stmt);
      case 'ForStatement':
        return this.formatForStatement(stmt);
      case 'BreakStatement':
        return this.indent('break');
      case 'ContinueStatement':
        return this.indent('continue');
      case 'ExpressionStatement':
        return this.formatExpressionStatement(stmt);
      case 'PrintStatement':
        return this.formatPrintStatement(stmt);
      case 'ImportStatement':
        return this.formatImportStatement(stmt);
      case 'MatchStatement':
        return this.formatMatchStatement(stmt);
      case 'TestDeclaration':
        return this.formatTestDeclaration(stmt);
      case 'TryCatchStatement':
        return this.formatTryCatchStatement(stmt);
      case 'ThrowStatement':
        return this.formatThrowStatement(stmt);
      default: {
        // Exhaustiveness guard. This switch used to end in `default: return ''`,
        // which deleted every statement type it did not recognise - a whole
        // try/catch block, with its throw and its assertions, became a blank
        // line. An unhandled type must be a build error, never silent data loss.
        const unhandled: never = stmt;
        throw new FormatterError(
          `Unsupported statement type: ${(unhandled as Statement).type}`,
          (unhandled as Statement).position?.line
        );
      }
    }
  }

  private formatVariableDeclaration(stmt: VariableDeclaration): string {
    const keyword = stmt.constant ? 'const' : 'let';
    const value = this.formatExpression(stmt.value);
    return this.indent(`${keyword} ${stmt.name} = ${value}`);
  }

  private formatDestructuringDeclaration(stmt: DestructuringDeclaration): string {
    const keyword = stmt.constant ? 'const' : 'let';
    const names = stmt.pattern.names.join(', ');
    const pattern = stmt.pattern.kind === 'array' ? `[${names}]` : `{${names}}`;
    const value = this.formatExpression(stmt.value);
    return this.indent(`${keyword} ${pattern} = ${value}`);
  }

  private formatFunctionDeclaration(stmt: FunctionDeclaration): string {
    const params = this.formatParams(stmt.params);
    const header = this.indent(`fn ${stmt.name}(${params}) {`);
    const body = this.formatBlock(stmt.body, stmt.danglingComments?.['body']);
    const close = this.indent('}');
    return `${header}\n${body}\n${close}`;
  }

  private formatClassDeclaration(stmt: ClassDeclaration): string {
    let header = `class ${stmt.name}`;
    if (stmt.superClass) {
      header += ` extends ${stmt.superClass}`;
    }
    header += ' {';

    const lines: string[] = [this.indent(header)];

    this.indentLevel++;
    for (let i = 0; i < stmt.properties.length; i++) {
      if (i > 0 && leadingBlank(stmt.properties[i])) lines.push('');
      lines.push(...this.anchoredLines(
        stmt.properties[i],
        [this.formatVariableDeclaration(stmt.properties[i])]
      ));
    }
    if (stmt.properties.length > 0 && stmt.methods.length > 0) {
      lines.push('');
    }
    for (let i = 0; i < stmt.methods.length; i++) {
      if (i > 0) lines.push('');
      lines.push(...this.anchoredLines(
        stmt.methods[i],
        this.formatFunctionDeclaration(stmt.methods[i]).split('\n')
      ));
    }
    if (stmt.properties.length === 0 && stmt.methods.length === 0) {
      lines.push(
        ...this.ownLineCommentLines(stmt.danglingComments?.['members'] ?? [])
      );
    }
    this.indentLevel--;

    lines.push(this.indent('}'));
    return lines.join('\n');
  }

  /**
   * Enum variants are newline-separated, not comma-separated: the parser reads
   * a bare list of identifiers, so a comma is a syntax error.
   */
  private formatEnumDeclaration(stmt: EnumDeclaration): string {
    const dangling = stmt.danglingComments?.['variants'] ?? [];

    if (stmt.variants.length === 0) {
      if (dangling.length === 0) return this.indent(`enum ${stmt.name} {}`);
      // `{}` has nowhere to put a comment, so an empty enum that has one is
      // printed open.
      const lines: string[] = [this.indent(`enum ${stmt.name} {`)];
      this.indentLevel++;
      lines.push(...this.ownLineCommentLines(dangling));
      this.indentLevel--;
      lines.push(this.indent('}'));
      return lines.join('\n');
    }

    const lines: string[] = [this.indent(`enum ${stmt.name} {`)];
    this.indentLevel++;
    for (let i = 0; i < stmt.variants.length; i++) {
      const anchor: CommentAnchor = stmt.variantComments?.[i] ?? {};
      if (i > 0 && leadingBlank(anchor)) lines.push('');
      lines.push(...this.anchoredLines(anchor, [this.indent(stmt.variants[i])]));
    }
    this.indentLevel--;
    lines.push(this.indent('}'));
    return lines.join('\n');
  }

  private formatReturnStatement(stmt: ReturnStatement): string {
    if (stmt.value) {
      return this.indent(`return ${this.formatExpression(stmt.value)}`);
    }
    return this.indent('return');
  }

  private formatIfStatement(stmt: IfStatement): string {
    return this.indentStr() + this.formatIfStatementInline(stmt);
  }

  private formatIfStatementInline(stmt: IfStatement): string {
    const condition = this.formatExpression(stmt.condition);
    const header = `if ${condition} {`;
    const body = this.formatBlock(stmt.consequent, stmt.danglingComments?.['consequent']);
    let result = `${header}\n${body}\n`;

    if (stmt.alternate) {
      if (Array.isArray(stmt.alternate)) {
        const elseBody = this.formatBlock(
          stmt.alternate,
          stmt.danglingComments?.['alternate']
        );
        result += `${this.indent('} else {')}\n${elseBody}\n${this.indent('}')}`;
      } else {
        // `else if` is chained rather than nested, so the alternate's header
        // continues the current line instead of opening a new block.
        result += `${this.indent('} else ')}${this.formatIfStatementInline(stmt.alternate)}`;
      }
    } else {
      result += this.indent('}');
    }

    return result;
  }

  private formatWhileStatement(stmt: WhileStatement): string {
    const condition = this.formatExpression(stmt.condition);
    const header = this.indent(`while ${condition} {`);
    const body = this.formatBlock(stmt.body, stmt.danglingComments?.['body']);
    const close = this.indent('}');
    return `${header}\n${body}\n${close}`;
  }

  private formatForStatement(stmt: ForStatement): string {
    const iterable = this.formatExpression(stmt.iterable);
    const header = this.indent(`for ${stmt.variable} in ${iterable} {`);
    const body = this.formatBlock(stmt.body, stmt.danglingComments?.['body']);
    const close = this.indent('}');
    return `${header}\n${body}\n${close}`;
  }

  /**
   * An expression statement whose leftmost token is `fn` has to be
   * parenthesised: at statement position the parser reads `fn` as a function
   * *declaration* and demands a name. `(fn(x) { ... })(1)` is the only spelling
   * that survives a round trip.
   */
  private formatExpressionStatement(stmt: ExpressionStatement): string {
    const text = this.formatExpression(stmt.expression);
    const needsParens = leftmostExpression(stmt.expression).type === 'FunctionExpression';
    return this.indent(needsParens ? `(${text})` : text);
  }

  private formatPrintStatement(stmt: PrintStatement): string {
    const exprs = stmt.expressions.map(e => this.formatExpression(e)).join(', ');
    return this.indent(`print(${exprs})`);
  }

  private formatImportStatement(stmt: ImportStatement): string {
    const names = stmt.names.join(', ');
    return this.indent(`import {${names}} from "${this.escapeString(stmt.source)}"`);
  }

  private formatMatchStatement(stmt: MatchStatement): string {
    const subject = this.formatExpression(stmt.subject);
    const lines: string[] = [this.indent(`match ${subject} {`)];

    this.indentLevel++;
    for (let i = 0; i < stmt.cases.length; i++) {
      const c: MatchCase = stmt.cases[i];
      if (i > 0 && leadingBlank(c)) lines.push('');
      const pattern = this.formatExpression(c.pattern);
      lines.push(...this.anchoredLines(
        c,
        this.formatCaseBody(`when ${pattern} => `, c.body, stmt.danglingComments?.[`case${i}`])
      ));
    }
    if (stmt.defaultCase) {
      const anchor: CommentAnchor = stmt.defaultComments ?? {};
      if (stmt.cases.length > 0 && leadingBlank(anchor)) lines.push('');
      lines.push(...this.anchoredLines(
        anchor,
        this.formatCaseBody('else => ', stmt.defaultCase, stmt.danglingComments?.['default'])
      ));
    }
    if (stmt.cases.length === 0 && stmt.defaultCase === undefined) {
      lines.push(...this.ownLineCommentLines(stmt.danglingComments?.['cases'] ?? []));
    }
    this.indentLevel--;
    lines.push(this.indent('}'));

    return lines.join('\n');
  }

  private formatCaseBody(header: string, body: Statement[], dangling?: Comment[]): string[] {
    if (body.length === 1 && !needsBracedArm(body[0])) {
      const inline = this.indent(header + this.formatStatementInline(body[0]));
      return this.withTrailingComments([inline], body[0].trailingComments);
    }
    const lines: string[] = [this.indent(header + '{')];
    lines.push(this.formatBlock(body, dangling));
    lines.push(this.indent('}'));
    return lines;
  }

  private formatTestDeclaration(stmt: TestDeclaration): string {
    const desc = this.formatExpression(stmt.description);
    const header = this.indent(`test ${desc} {`);
    const body = this.formatBlock(stmt.body, stmt.danglingComments?.['body']);
    const close = this.indent('}');
    return `${header}\n${body}\n${close}`;
  }

  private formatTryCatchStatement(stmt: TryCatchStatement): string {
    const tryBody = this.formatBlock(stmt.tryBody, stmt.danglingComments?.['tryBody']);
    const catchBody = this.formatBlock(stmt.catchBody, stmt.danglingComments?.['catchBody']);
    return (
      `${this.indent('try {')}\n${tryBody}\n` +
      `${this.indent(`} catch ${stmt.catchVariable} {`)}\n${catchBody}\n` +
      this.indent('}')
    );
  }

  private formatThrowStatement(stmt: ThrowStatement): string {
    return this.indent(`throw ${this.formatExpression(stmt.value)}`);
  }

  /**
   * Format a statement for use after `when ... =>`, keeping the current
   * indentation for any continuation lines but dropping it from the first line,
   * which follows the arrow on a line that is already indented.
   */
  private formatStatementInline(stmt: Statement): string {
    const rendered = this.formatStatement(stmt);
    const prefix = this.indentStr();
    return rendered.startsWith(prefix) ? rendered.slice(prefix.length) : rendered;
  }

  // ============ Expressions ============

  /**
   * Render `expr`, parenthesising it when its position requires tighter binding
   * than the expression itself has.
   */
  private formatExpression(expr: Expression, minPrec: Prec = Prec.Lowest): string {
    const text = this.renderExpression(expr);
    return precedenceOf(expr) < minPrec ? `(${text})` : text;
  }

  private renderExpression(expr: Expression): string {
    switch (expr.type) {
      case 'NumberLiteral':
        return formatNumber(expr.value);
      case 'StringLiteral':
        return `"${this.escapeString(expr.value)}"`;
      case 'InterpolatedString':
        return this.formatInterpolatedString(expr);
      case 'BooleanLiteral':
        return String(expr.value);
      case 'NullLiteral':
        return 'null';
      case 'ArrayLiteral':
        return this.formatArrayLiteral(expr);
      case 'ObjectLiteral':
        return this.formatObjectLiteral(expr);
      case 'Identifier':
        return expr.name;
      case 'BinaryExpression':
        return this.formatBinaryExpression(expr);
      case 'UnaryExpression':
        return this.formatUnaryExpression(expr);
      case 'LogicalExpression':
        return this.formatLogicalExpression(expr);
      case 'AssignmentExpression':
        return this.formatAssignmentExpression(expr);
      case 'CallExpression':
        return this.formatCallExpression(expr);
      case 'MemberExpression':
        return this.formatMemberExpression(expr);
      case 'IndexExpression':
        return this.formatIndexExpression(expr);
      case 'OptionalMemberExpression':
        return this.formatOptionalMemberExpression(expr);
      case 'OptionalIndexExpression':
        return this.formatOptionalIndexExpression(expr);
      case 'NullishCoalesceExpression':
        return this.formatNullishCoalesceExpression(expr);
      case 'ArrowFunction':
        return this.formatArrowFunction(expr);
      case 'FunctionExpression':
        return this.formatFunctionExpression(expr);
      case 'NewExpression':
        return this.formatNewExpression(expr);
      case 'ThisExpression':
        return 'this';
      case 'SpreadExpression':
        return this.formatSpreadExpression(expr);
      case 'TernaryExpression':
        return this.formatTernaryExpression(expr);
      case 'RangeExpression':
        return this.formatRangeExpression(expr);
      case 'PipeExpression':
        return this.formatPipeExpression(expr);
      case 'PipeMethodExpression':
        return this.formatPipeMethodExpression(expr);
      default: {
        // Exhaustiveness guard. As with statements, the old `default: return ''`
        // silently erased f-strings, spreads, pipes, optional chaining and
        // nullish coalescing - `print(f"x = {x}")` formatted to `print()`.
        const unhandled: never = expr;
        throw new FormatterError(
          `Unsupported expression type: ${(unhandled as Expression).type}`,
          (unhandled as Expression).position?.line
        );
      }
    }
  }

  private formatArrayLiteral(expr: ArrayLiteral): string {
    if (expr.elements.length === 0) return '[]';

    const inner = expr.elements.map(e => this.formatExpression(e)).join(', ');
    const singleLine = `[${inner}]`;

    if (
      !singleLine.includes('\n') &&
      this.currentLineWidth(singleLine) <= this.options.maxLineWidth
    ) {
      return singleLine;
    }

    // Multi-line
    const lines: string[] = ['['];
    this.indentLevel++;
    for (let i = 0; i < expr.elements.length; i++) {
      const sep = i < expr.elements.length - 1 ? ',' : '';
      lines.push(this.indentStr() + this.formatExpression(expr.elements[i]) + sep);
    }
    this.indentLevel--;
    lines.push(this.indentStr() + ']');
    return lines.join('\n');
  }

  private formatObjectLiteral(expr: ObjectLiteral): string {
    if (expr.properties.length === 0) return '{}';

    const inner = expr.properties
      .map(p => `${p.key}: ${this.formatExpression(p.value)}`)
      .join(', ');
    const singleLine = `{${inner}}`;

    if (
      !singleLine.includes('\n') &&
      this.currentLineWidth(singleLine) <= this.options.maxLineWidth
    ) {
      return singleLine;
    }

    // Multi-line
    const lines: string[] = ['{'];
    this.indentLevel++;
    for (let i = 0; i < expr.properties.length; i++) {
      const p = expr.properties[i];
      const sep = i < expr.properties.length - 1 ? ',' : '';
      lines.push(this.indentStr() + `${p.key}: ${this.formatExpression(p.value)}${sep}`);
    }
    this.indentLevel--;
    lines.push(this.indentStr() + '}');
    return lines.join('\n');
  }

  /**
   * `a - b - c` and `a ** b ** c` group differently, so the two operands of a
   * binary expression are not interchangeable: the associative side accepts the
   * same precedence, the other side needs one level tighter. `**` is the only
   * right-associative operator, and its left operand is parsed as a unary
   * expression, which is why it is treated separately.
   */
  private formatBinaryExpression(expr: BinaryExpression): string {
    const prec = BINARY_PRECEDENCE[expr.operator];
    if (prec === undefined) {
      throw new FormatterError(
        `Unknown binary operator: ${expr.operator}`,
        expr.position?.line
      );
    }

    if (expr.operator === '**') {
      const left = this.formatExpression(expr.left, Prec.Unary);
      const right = this.formatExpression(expr.right, Prec.Power);
      return `${left} ** ${right}`;
    }

    const left = this.formatExpression(expr.left, prec);
    const right = this.formatExpression(expr.right, prec + 1);
    return `${left} ${expr.operator} ${right}`;
  }

  private formatUnaryExpression(expr: UnaryExpression): string {
    const operand = this.formatExpression(expr.operand, Prec.Unary);
    if (expr.operator === 'not') {
      return `not ${operand}`;
    }
    // `-` before another `-` would read as a single token to a human and is
    // needlessly subtle to a parser; parenthesise instead of emitting `--x`.
    if (operand.startsWith('-')) {
      return `${expr.operator}(${operand})`;
    }
    return `${expr.operator}${operand}`;
  }

  private formatLogicalExpression(expr: LogicalExpression): string {
    const prec = expr.operator === 'or' ? Prec.Or : Prec.And;
    const left = this.formatExpression(expr.left, prec);
    const right = this.formatExpression(expr.right, prec + 1);
    return `${left} ${expr.operator} ${right}`;
  }

  private formatAssignmentExpression(expr: AssignmentExpression): string {
    const target = this.formatExpression(expr.target, Prec.Postfix);
    const value = this.formatExpression(expr.value, Prec.Assignment);
    return `${target} ${expr.operator} ${value}`;
  }

  private formatCallExpression(expr: CallExpression): string {
    const callee = this.formatExpression(expr.callee, Prec.Postfix);
    const args = expr.args.map(a => this.formatExpression(a)).join(', ');
    return `${callee}(${args})`;
  }

  private formatMemberExpression(expr: MemberExpression): string {
    return `${this.formatExpression(expr.object, Prec.Postfix)}.${expr.property}`;
  }

  private formatIndexExpression(expr: IndexExpression): string {
    const obj = this.formatExpression(expr.object, Prec.Postfix);
    return `${obj}[${this.formatExpression(expr.index)}]`;
  }

  private formatOptionalMemberExpression(expr: OptionalMemberExpression): string {
    return `${this.formatExpression(expr.object, Prec.Postfix)}?.${expr.property}`;
  }

  private formatOptionalIndexExpression(expr: OptionalIndexExpression): string {
    const obj = this.formatExpression(expr.object, Prec.Postfix);
    return `${obj}?.[${this.formatExpression(expr.index)}]`;
  }

  private formatNullishCoalesceExpression(expr: NullishCoalesceExpression): string {
    const left = this.formatExpression(expr.left, Prec.Nullish);
    const right = this.formatExpression(expr.right, Prec.Or);
    return `${left} ?? ${right}`;
  }

  private formatArrowFunction(expr: ArrowFunction): string {
    const params = this.formatParams(expr.params);
    if (Array.isArray(expr.body)) {
      const lines: string[] = [`(${params}) => {`];
      this.indentLevel++;
      lines.push(...this.statementListLines(expr.body, expr.danglingComments?.['body']));
      this.indentLevel--;
      lines.push(this.indentStr() + '}');
      return lines.join('\n');
    }
    // An expression body that starts with `{` would be read back as a block, so
    // `(x) => ({a: 1})` must keep its parentheses.
    const body = this.formatExpression(expr.body);
    const wrap = leftmostExpression(expr.body).type === 'ObjectLiteral';
    return `(${params}) => ${wrap ? `(${body})` : body}`;
  }

  private formatFunctionExpression(expr: FunctionExpression): string {
    const params = this.formatParams(expr.params);
    const lines: string[] = [`fn(${params}) {`];
    this.indentLevel++;
    lines.push(...this.statementListLines(expr.body, expr.danglingComments?.['body']));
    this.indentLevel--;
    lines.push(this.indentStr() + '}');
    return lines.join('\n');
  }

  /**
   * `new` takes a *primary* callee: the parser reads `new a.B()` as
   * `(new a).B()`, so a callee that is anything more than a primary has to be
   * parenthesised to keep its meaning.
   */
  private formatNewExpression(expr: NewExpression): string {
    const callee = this.formatExpression(expr.callee, Prec.Primary);
    const args = expr.args.map(a => this.formatExpression(a)).join(', ');
    return `new ${callee}(${args})`;
  }

  private formatSpreadExpression(expr: SpreadExpression): string {
    return `...${this.formatExpression(expr.argument)}`;
  }

  private formatTernaryExpression(expr: TernaryExpression): string {
    const condition = this.formatExpression(expr.condition, Prec.Pipe);
    const consequent = this.formatExpression(expr.consequent, Prec.Assignment);
    const alternate = this.formatExpression(expr.alternate, Prec.Assignment);
    return `${condition} ? ${consequent} : ${alternate}`;
  }

  private formatRangeExpression(expr: RangeExpression): string {
    const start = this.formatExpression(expr.start, Prec.Additive);
    const end = this.formatExpression(expr.end, Prec.Additive);
    return `${start}${expr.inclusive ? '..=' : '..'}${end}`;
  }

  private formatPipeExpression(expr: PipeExpression): string {
    const left = this.formatExpression(expr.left, Prec.Pipe);
    const right = this.formatExpression(expr.right, Prec.Nullish);
    return `${left} |> ${right}`;
  }

  private formatPipeMethodExpression(expr: PipeMethodExpression): string {
    const left = this.formatExpression(expr.left, Prec.Pipe);
    const args = expr.args.map(a => this.formatExpression(a)).join(', ');
    return `${left} |> .${expr.method}(${args})`;
  }

  /**
   * f-strings. Literal text is escaped for the *lexer* (quotes, newlines) and
   * then for the f-string scanner: a literal `{` has to be written `\{` or it
   * would be read back as the start of an interpolation.
   */
  private formatInterpolatedString(expr: InterpolatedString): string {
    let out = 'f"';
    for (const part of expr.parts) {
      if (part.kind === 'literal') {
        out += this.escapeString(part.value).replace(/\{/g, '\\{');
      } else {
        out += `{${this.formatExpression(part.expression)}}`;
      }
    }
    return out + '"';
  }

  // ============ Shared helpers ============

  private formatParams(params: Parameter[]): string {
    return params.map(p => {
      if (p.defaultValue) {
        return `${p.name} = ${this.formatExpression(p.defaultValue)}`;
      }
      return p.name;
    }).join(', ');
  }

  /**
   * A braced region, indented one level.
   *
   * `dangling` is only ever non-empty when `statements` is empty: that is the one
   * shape of region where a comment has no statement to attach to.
   */
  private formatBlock(statements: Statement[], dangling?: Comment[]): string {
    this.indentLevel++;
    const lines = this.statementListLines(statements, dangling);
    this.indentLevel--;
    return lines.join('\n');
  }

  /** Statements at the current indentation, with the author's blank lines. */
  private statementListLines(statements: Statement[], dangling?: Comment[]): string[] {
    const lines: string[] = [];
    for (let i = 0; i < statements.length; i++) {
      if (i > 0 && leadingBlank(statements[i])) lines.push('');
      lines.push(...this.statementLines(statements[i]));
    }
    if (statements.length === 0) {
      lines.push(...this.ownLineCommentLines(dangling ?? []));
    }
    return lines;
  }

  private indent(text: string): string {
    return this.indentStr() + text;
  }

  private indentStr(): string {
    return ' '.repeat(this.indentLevel * this.options.indentSize);
  }

  private currentLineWidth(text: string): number {
    return this.indentLevel * this.options.indentSize + text.length;
  }

  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r')
      // eslint-disable-next-line no-control-regex
      .replace(/\0/g, '\\0');
  }
}

/**
 * Parse for formatting: with comments and blank-line layout attached.
 *
 * Every other consumer of the parser asks for the plain AST. The formatter is
 * the only one that has to reproduce the file, so it is the only one that needs
 * to know where the author put their comments and their blank lines.
 */
function parseSource(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens, lexer.getComments()).parse();
}

/**
 * Move a line `shift` columns right, or left by removing that much of its
 * existing indentation - never more than it has, and never anything but
 * whitespace.
 */
function shiftIndent(line: string, shift: number): string {
  if (line === '') return '';
  if (shift >= 0) return ' '.repeat(shift) + line;
  const existing = line.length - line.trimStart().length;
  return line.slice(Math.min(-shift, existing));
}

/**
 * Whether a blank line belongs above an anchored construct.
 *
 * The author's blank line sits above the whole group, so when the construct has
 * leading comments it is the *first comment's* blank line that matters, not the
 * construct's own - that one describes the gap between the last comment and the
 * code.
 */
function leadingBlank(anchor: CommentAnchor): boolean {
  const first = anchor.leadingComments?.[0];
  return first !== undefined ? first.blankBefore : anchor.blankBefore === true;
}

/**
 * Whether a one-statement match arm has to be printed with braces.
 *
 * `when 1 => print(x)` is the nicer form, but it puts the statement after the
 * arrow on a line that is already occupied, so anything that needs a line of its
 * own - a comment above the statement, a comment that sat on its own line below
 * it, a second trailing comment - forces the braces back. Adding them changes
 * nothing about what the arm means: the parser reads both spellings as a
 * one-statement body.
 */
function needsBracedArm(stmt: Statement): boolean {
  const trailing = stmt.trailingComments ?? [];
  return (
    (stmt.leadingComments?.length ?? 0) > 0 ||
    trailing.length > 1 ||
    trailing[0]?.ownLine === true
  );
}

/** How tightly an expression binds; see Prec. */
function precedenceOf(expr: Expression): Prec {
  switch (expr.type) {
    case 'AssignmentExpression':
      return Prec.Assignment;
    // An arrow function's body swallows a whole expression, and a spread's
    // argument does too, so both bind as loosely as an assignment: anywhere
    // tighter they need parentheses, as in `((x) => x)(1)`.
    case 'ArrowFunction':
    case 'SpreadExpression':
      return Prec.Assignment;
    case 'TernaryExpression':
      return Prec.Ternary;
    case 'PipeExpression':
    case 'PipeMethodExpression':
      return Prec.Pipe;
    case 'NullishCoalesceExpression':
      return Prec.Nullish;
    case 'LogicalExpression':
      return expr.operator === 'or' ? Prec.Or : Prec.And;
    case 'BinaryExpression':
      return BINARY_PRECEDENCE[expr.operator] ?? Prec.Lowest;
    case 'RangeExpression':
      return Prec.Range;
    case 'UnaryExpression':
      return Prec.Unary;
    case 'CallExpression':
    case 'MemberExpression':
    case 'IndexExpression':
    case 'OptionalMemberExpression':
    case 'OptionalIndexExpression':
      return Prec.Postfix;
    // Literals, identifiers, `this`, `new` and `fn(){}` are all self-delimiting
    // and never need parentheses.
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'InterpolatedString':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'ArrayLiteral':
    case 'ObjectLiteral':
    case 'Identifier':
    case 'FunctionExpression':
    case 'NewExpression':
    case 'ThisExpression':
      return Prec.Primary;
    default: {
      // Exhaustive on purpose: a new expression type that silently defaulted to
      // Primary would be printed without the parentheses it needs, which is the
      // same class of quiet corruption the `default: return ''` cases were.
      const unhandled: never = expr;
      throw new FormatterError(
        `Unknown precedence for expression type: ${(unhandled as Expression).type}`
      );
    }
  }
}

/**
 * The expression that supplies the first token of `expr`.
 *
 * Some constructs are ambiguous only in leftmost position - `fn` opens a
 * declaration at statement level, `{` opens a block after `=>` - so what matters
 * is which node the first token comes from, not the outermost node.
 */
function leftmostExpression(expr: Expression): Expression {
  switch (expr.type) {
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'PipeExpression':
    case 'NullishCoalesceExpression':
      return leftmostExpression(expr.left);
    case 'PipeMethodExpression':
      return leftmostExpression(expr.left);
    case 'AssignmentExpression':
      return leftmostExpression(expr.target);
    case 'TernaryExpression':
      return leftmostExpression(expr.condition);
    case 'RangeExpression':
      return leftmostExpression(expr.start);
    case 'CallExpression':
      return leftmostExpression(expr.callee);
    case 'MemberExpression':
    case 'IndexExpression':
    case 'OptionalMemberExpression':
    case 'OptionalIndexExpression':
      return leftmostExpression(expr.object);
    // Everything else supplies its own first token: a keyword, a bracket, a
    // literal or a name.
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'InterpolatedString':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'ArrayLiteral':
    case 'ObjectLiteral':
    case 'Identifier':
    case 'UnaryExpression':
    case 'ArrowFunction':
    case 'FunctionExpression':
    case 'NewExpression':
    case 'ThisExpression':
    case 'SpreadExpression':
      return expr;
    default: {
      // Exhaustive for the same reason as precedenceOf: a new node type with a
      // left operand must be considered here, not silently treated as a leaf.
      const unhandled: never = expr;
      throw new FormatterError(
        `Unknown leftmost token for expression type: ${(unhandled as Expression).type}`
      );
    }
  }
}

/**
 * Render a number the way the lexer can read it back.
 *
 * The lexer accepts digits with an optional decimal point and nothing else, so
 * the exponent notation JavaScript uses for very large and very small values
 * (`1e-7`, `1e+21`) has to be expanded.
 */
function formatNumber(value: number): string {
  const text = String(value);
  if (!/e/i.test(text)) return text;

  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
  if (!match) {
    // Not representable as a TinyLang literal (NaN, Infinity). The parser cannot
    // produce such a literal, so reaching this means the AST was built by hand.
    throw new FormatterError(`Cannot format the number ${text} as a literal`);
  }

  const [, sign, intPart, fracPart = '', exponent] = match;
  const digits = intPart + fracPart;
  const pointPosition = intPart.length + Number(exponent);

  if (pointPosition <= 0) {
    return `${sign}0.${'0'.repeat(-pointPosition)}${digits}`;
  }
  if (pointPosition >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointPosition - digits.length)}`;
  }
  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}
