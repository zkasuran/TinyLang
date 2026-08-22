/**
 * TinyLang Formatter - AST-based Pretty Printer
 *
 * Produces clean, consistently formatted TinyLang source code.
 * Ensures idempotency: format(format(code)) === format(code).
 */

import { Lexer } from '../lexer';
import { Parser } from '../parser';
import {
  Program,
  Statement,
  Expression,
  VariableDeclaration,
  FunctionDeclaration,
  ClassDeclaration,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  PrintStatement,
  MatchStatement,
  ExpressionStatement,
  ImportStatement,
  TestDeclaration,
  BinaryExpression,
  UnaryExpression,
  LogicalExpression,
  AssignmentExpression,
  CallExpression,
  MemberExpression,
  IndexExpression,
  ArrowFunction,
  FunctionExpression,
  NewExpression,
  RangeExpression,
  TernaryExpression,
  SpreadExpression,
  ArrayLiteral,
  ObjectLiteral,
  Parameter,
} from '../types/ast';
import { FormatOptions, DEFAULT_FORMAT_OPTIONS } from './config';

export class Formatter {
  private options: FormatOptions;
  private indentLevel: number = 0;

  constructor(options?: Partial<FormatOptions>) {
    this.options = { ...DEFAULT_FORMAT_OPTIONS, ...options };
  }

  /**
   * Format a TinyLang source string.
   */
  format(source: string, options?: Partial<FormatOptions>): string {
    const opts = options ? { ...this.options, ...options } : this.options;
    const prevOptions = this.options;
    this.options = opts;
    this.indentLevel = 0;

    try {
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      const result = this.formatProgram(program);
      return opts.insertFinalNewline ? result + '\n' : result;
    } finally {
      this.options = prevOptions;
    }
  }

  private formatProgram(program: Program): string {
    const parts: string[] = [];
    let prevWasDeclaration = false;

    for (let i = 0; i < program.body.length; i++) {
      const stmt = program.body[i];
      const isDeclaration = stmt.type === 'FunctionDeclaration' ||
        stmt.type === 'ClassDeclaration' ||
        stmt.type === 'TestDeclaration';

      // Add blank line between top-level declarations
      if (i > 0 && (isDeclaration || prevWasDeclaration)) {
        parts.push('');
      }

      parts.push(this.formatStatement(stmt));
      prevWasDeclaration = isDeclaration;
    }

    return parts.join('\n');
  }

  private formatStatement(stmt: Statement): string {
    switch (stmt.type) {
      case 'VariableDeclaration':
        return this.formatVariableDeclaration(stmt);
      case 'FunctionDeclaration':
        return this.formatFunctionDeclaration(stmt);
      case 'ClassDeclaration':
        return this.formatClassDeclaration(stmt);
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
      default:
        return '';
    }
  }

  private formatVariableDeclaration(stmt: VariableDeclaration): string {
    const keyword = stmt.constant ? 'const' : 'let';
    const value = this.formatExpression(stmt.value);
    return this.indent(`${keyword} ${stmt.name} = ${value}`);
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

  private formatReturnStatement(stmt: ReturnStatement): string {
    if (stmt.value) {
      return this.indent(`return ${this.formatExpression(stmt.value)}`);
    }
    return this.indent('return');
  }

  private formatIfStatement(stmt: IfStatement): string {
    const condition = this.formatExpression(stmt.condition);
    const header = this.indent(`if ${condition} {`);
    const body = this.formatBlock(stmt.consequent);
    let result = `${header}\n${body}\n`;

    if (stmt.alternate) {
      if (Array.isArray(stmt.alternate)) {
        const elseBody = this.formatBlock(stmt.alternate);
        result += `${this.indent('} else {')}\n${elseBody}\n${this.indent('}')}`;
      } else {
        // else if
        const elseIfStr = this.formatIfStatementInline(stmt.alternate);
        result += `${this.indent('} else ')}${elseIfStr}`;
      }
    } else {
      result += this.indent('}');
    }

    return result;
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
        const elseIfStr = this.formatIfStatementInline(stmt.alternate);
        result += `${this.indent('} else ')}${elseIfStr}`;
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

  private formatExpressionStatement(stmt: ExpressionStatement): string {
    return this.indent(this.formatExpression(stmt.expression));
  }

  private formatPrintStatement(stmt: PrintStatement): string {
    const exprs = stmt.expressions.map(e => this.formatExpression(e)).join(', ');
    return this.indent(`print(${exprs})`);
  }

  private formatImportStatement(stmt: ImportStatement): string {
    const names = stmt.names.join(', ');
    return this.indent(`import {${names}} from "${stmt.source}"`);
  }

  private formatMatchStatement(stmt: MatchStatement): string {
    const subject = this.formatExpression(stmt.subject);
    const lines: string[] = [this.indent(`match ${subject} {`)];

    this.indentLevel++;
    for (const c of stmt.cases) {
      const pattern = this.formatExpression(c.pattern);
      if (c.body.length === 1) {
        const bodyStr = this.formatStatementInline(c.body[0]);
        lines.push(this.indent(`when ${pattern} => ${bodyStr}`));
      } else {
        lines.push(this.indent(`when ${pattern} => {`));
        const body = this.formatBlock(c.body);
        lines.push(body);
        lines.push(this.indent('}'));
      }
    }
    if (stmt.defaultCase) {
      if (stmt.defaultCase.length === 1) {
        const bodyStr = this.formatStatementInline(stmt.defaultCase[0]);
        lines.push(this.indent(`else => ${bodyStr}`));
      } else {
        lines.push(this.indent('else => {'));
        const body = this.formatBlock(stmt.defaultCase);
        lines.push(body);
        lines.push(this.indent('}'));
      }
    }
    this.indentLevel--;
    lines.push(this.indent('}'));

    return lines.join('\n');
  }

  private formatTestDeclaration(stmt: TestDeclaration): string {
    const desc = this.formatExpression(stmt.description);
    const header = this.indent(`test ${desc} {`);
    const body = this.formatBlock(stmt.body);
    const close = this.indent('}');
    return `${header}\n${body}\n${close}`;
  }

  private formatStatementInline(stmt: Statement): string {
    // Format a statement without indentation for inline use
    const prevLevel = this.indentLevel;
    this.indentLevel = 0;
    const result = this.formatStatement(stmt);
    this.indentLevel = prevLevel;
    return result;
  }

  private formatExpression(expr: Expression): string {
    switch (expr.type) {
      case 'NumberLiteral':
        return String(expr.value);
      case 'StringLiteral':
        return `"${this.escapeString(expr.value)}"`;
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
      default:
        return '';
    }
  }

  private formatArrayLiteral(expr: ArrayLiteral): string {
    if (expr.elements.length === 0) return '[]';

    const inner = expr.elements.map(e => this.formatExpression(e)).join(', ');
    const singleLine = `[${inner}]`;

    if (this.currentLineWidth(singleLine) <= this.options.maxLineWidth) {
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

    if (this.currentLineWidth(singleLine) <= this.options.maxLineWidth) {
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

  private formatBinaryExpression(expr: BinaryExpression): string {
    const left = this.formatExpression(expr.left);
    const right = this.formatExpression(expr.right);
    return `${left} ${expr.operator} ${right}`;
  }

  private formatUnaryExpression(expr: UnaryExpression): string {
    const operand = this.formatExpression(expr.operand);
    if (expr.operator === 'not') {
      return `not ${operand}`;
    }
    return `${expr.operator}${operand}`;
  }

  private formatLogicalExpression(expr: LogicalExpression): string {
    const left = this.formatExpression(expr.left);
    const right = this.formatExpression(expr.right);
    return `${left} ${expr.operator} ${right}`;
  }

  private formatAssignmentExpression(expr: AssignmentExpression): string {
    const target = this.formatExpression(expr.target);
    const value = this.formatExpression(expr.value);
    return `${target} ${expr.operator} ${value}`;
  }

  private formatCallExpression(expr: CallExpression): string {
    const callee = this.formatExpression(expr.callee);
    const args = expr.args.map(a => this.formatExpression(a)).join(', ');
    return `${callee}(${args})`;
  }

  private formatMemberExpression(expr: MemberExpression): string {
    const obj = this.formatExpression(expr.object);
    return `${obj}.${expr.property}`;
  }

  private formatIndexExpression(expr: IndexExpression): string {
    const obj = this.formatExpression(expr.object);
    const index = this.formatExpression(expr.index);
    return `${obj}[${index}]`;
  }

  private formatArrowFunction(expr: ArrowFunction): string {
    const params = this.formatParams(expr.params);
    if (Array.isArray(expr.body)) {
      const header = `(${params}) => {`;
      const lines: string[] = [header];
      this.indentLevel++;
      for (const s of expr.body) {
        lines.push(this.formatStatement(s));
      }
      this.indentLevel--;
      lines.push(this.indentStr() + '}');
      return lines.join('\n');
    } else {
      const body = this.formatExpression(expr.body);
      return `(${params}) => ${body}`;
    }
  }

  private formatFunctionExpression(expr: FunctionExpression): string {
    const params = this.formatParams(expr.params);
    const header = `fn(${params}) {`;
    const lines: string[] = [header];
    this.indentLevel++;
    for (const s of expr.body) {
      lines.push(this.formatStatement(s));
    }
    this.indentLevel--;
    lines.push(this.indentStr() + '}');
    return lines.join('\n');
  }

  private formatNewExpression(expr: NewExpression): string {
    const callee = this.formatExpression(expr.callee);
    const args = expr.args.map(a => this.formatExpression(a)).join(', ');
    return `new ${callee}(${args})`;
  }

  private formatSpreadExpression(expr: SpreadExpression): string {
    return `...${this.formatExpression(expr.argument)}`;
  }

  private formatTernaryExpression(expr: TernaryExpression): string {
    const condition = this.formatExpression(expr.condition);
    const consequent = this.formatExpression(expr.consequent);
    const alternate = this.formatExpression(expr.alternate);
    return `${condition} ? ${consequent} : ${alternate}`;
  }

  private formatRangeExpression(expr: RangeExpression): string {
    const start = this.formatExpression(expr.start);
    const end = this.formatExpression(expr.end);
    const op = expr.inclusive ? '..=' : '..';
    return `${start}${op}${end}`;
  }

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
      .replace(/\r/g, '\\r');
  }
}
