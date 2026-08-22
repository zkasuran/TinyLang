/**
 * TinyLang Formatter - AST-based Pretty Printer
 *
 * Produces clean, consistently formatted TinyLang source code.
 *
 * Two properties matter more than the aesthetics, and both are enforced rather
 * than hoped for:
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
 *  2. Idempotency: format(format(code)) === format(code). This follows from (1)
 *     plus the fact that rendering is a pure function of the position-free AST:
 *     if the output parses back to the same AST, formatting it again must
 *     produce the same text.
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
} from '../types/ast';
import { FormatOptions, DEFAULT_FORMAT_OPTIONS } from './config';
import { FormatterError } from './errors';
import { astDifference } from './equivalence';

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
   * @throws FormatterError if the result cannot be shown to be equivalent to the
   * input. Callers may rely on this: output that is returned has been verified.
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

  private formatProgram(program: Program): string {
    const parts: string[] = [];
    let prevWasDeclaration = false;

    for (let i = 0; i < program.body.length; i++) {
      const stmt = program.body[i];
      const isDeclaration = stmt.type === 'FunctionDeclaration' ||
        stmt.type === 'ClassDeclaration' ||
        stmt.type === 'TestDeclaration' ||
        stmt.type === 'EnumDeclaration';

      // Add blank line between top-level declarations
      if (i > 0 && (isDeclaration || prevWasDeclaration)) {
        parts.push('');
      }

      parts.push(this.formatStatement(stmt));
      prevWasDeclaration = isDeclaration;
    }

    return parts.join('\n');
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
    const body = this.formatBlock(stmt.body);
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
    for (const prop of stmt.properties) {
      lines.push(this.formatVariableDeclaration(prop));
    }
    if (stmt.properties.length > 0 && stmt.methods.length > 0) {
      lines.push('');
    }
    for (let i = 0; i < stmt.methods.length; i++) {
      if (i > 0) lines.push('');
      lines.push(this.formatFunctionDeclaration(stmt.methods[i]));
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
    if (stmt.variants.length === 0) {
      return this.indent(`enum ${stmt.name} {}`);
    }
    const lines: string[] = [this.indent(`enum ${stmt.name} {`)];
    this.indentLevel++;
    for (const variant of stmt.variants) {
      lines.push(this.indent(variant));
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
    const body = this.formatBlock(stmt.consequent);
    let result = `${header}\n${body}\n`;

    if (stmt.alternate) {
      if (Array.isArray(stmt.alternate)) {
        const elseBody = this.formatBlock(stmt.alternate);
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
    const body = this.formatBlock(stmt.body);
    const close = this.indent('}');
    return `${header}\n${body}\n${close}`;
  }

  private formatForStatement(stmt: ForStatement): string {
    const iterable = this.formatExpression(stmt.iterable);
    const header = this.indent(`for ${stmt.variable} in ${iterable} {`);
    const body = this.formatBlock(stmt.body);
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
    for (const c of stmt.cases) {
      const pattern = this.formatExpression(c.pattern);
      lines.push(...this.formatCaseBody(`when ${pattern} => `, c.body));
    }
    if (stmt.defaultCase) {
      lines.push(...this.formatCaseBody('else => ', stmt.defaultCase));
    }
    this.indentLevel--;
    lines.push(this.indent('}'));

    return lines.join('\n');
  }

  private formatCaseBody(header: string, body: Statement[]): string[] {
    if (body.length === 1) {
      return [this.indent(header + this.formatStatementInline(body[0]))];
    }
    const lines: string[] = [this.indent(header + '{')];
    lines.push(this.formatBlock(body));
    lines.push(this.indent('}'));
    return lines;
  }

  private formatTestDeclaration(stmt: TestDeclaration): string {
    const desc = this.formatExpression(stmt.description);
    const header = this.indent(`test ${desc} {`);
    const body = this.formatBlock(stmt.body);
    const close = this.indent('}');
    return `${header}\n${body}\n${close}`;
  }

  private formatTryCatchStatement(stmt: TryCatchStatement): string {
    const tryBody = this.formatBlock(stmt.tryBody);
    const catchBody = this.formatBlock(stmt.catchBody);
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
      for (const s of expr.body) {
        lines.push(this.formatStatement(s));
      }
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
    for (const s of expr.body) {
      lines.push(this.formatStatement(s));
    }
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

  private formatBlock(statements: Statement[]): string {
    this.indentLevel++;
    const lines = statements.map(s => this.formatStatement(s));
    this.indentLevel--;
    return lines.join('\n');
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

function parseSource(source: string): Program {
  return new Parser(new Lexer(source).tokenize()).parse();
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
