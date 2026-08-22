/**
 * TinyLang WebAssembly Compiler
 *
 * Compiles a subset of TinyLang to WebAssembly Text Format (.wat).
 * Supports:
 * - Numeric operations (i32 arithmetic)
 * - Functions with parameters and return values
 * - Local variables
 * - If/else expressions
 * - While loops
 * - Function calls (recursion)
 * - Comparison operators
 *
 * Limitations (by design):
 * - Only numeric (integer) programs are supported
 * - No strings, arrays, objects, or classes
 * - No closures or higher-order functions
 * - All values are i32
 */

import {
  Program,
  Statement,
  Expression,
  FunctionDeclaration,
  VariableDeclaration,
  IfStatement,
  WhileStatement,
  ReturnStatement,
  BinaryExpression,
  UnaryExpression,
  CallExpression,
  AssignmentExpression,
} from '../types/ast';
import { Lexer } from '../lexer';
import { Parser } from '../parser';

interface WasmLocal {
  name: string;
  index: number;
}

interface WasmFunction {
  name: string;
  params: string[];
  locals: WasmLocal[];
  hasReturn: boolean;
}

export interface WasmCompileResult {
  wat: string;
  exports: string[];
  errors: string[];
}

export class WasmCompiler {
  private functions: Map<string, WasmFunction> = new Map();
  private currentFunction: WasmFunction | null = null;
  private localCounter: number = 0;
  private output: string[] = [];
  private indent: number = 0;
  private errors: string[] = [];
  private exports: string[] = [];

  /**
   * Compile TinyLang source code to WebAssembly Text Format
   */
  compile(source: string): WasmCompileResult {
    this.reset();

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    return this.compileProgram(program);
  }

  /**
   * Compile a parsed AST program to WAT
   */
  compileProgram(program: Program): WasmCompileResult {
    this.reset();

    // First pass: collect function signatures
    for (const stmt of program.body) {
      if (stmt.type === 'FunctionDeclaration') {
        this.registerFunction(stmt);
      }
    }

    // Generate module
    this.emit('(module');
    this.indent++;

    // Second pass: compile function bodies
    for (const stmt of program.body) {
      if (stmt.type === 'FunctionDeclaration') {
        this.compileFunction(stmt);
      }
    }

    // Add exports
    for (const name of this.exports) {
      this.emit(`(export "${name}" (func $${name}))`);
    }

    this.indent--;
    this.emit(')');

    return {
      wat: this.output.join('\n'),
      exports: this.exports,
      errors: this.errors,
    };
  }

  private reset(): void {
    this.functions.clear();
    this.currentFunction = null;
    this.localCounter = 0;
    this.output = [];
    this.indent = 0;
    this.errors = [];
    this.exports = [];
  }

  private emit(line: string): void {
    const indentation = '  '.repeat(this.indent);
    this.output.push(`${indentation}${line}`);
  }

  private registerFunction(stmt: FunctionDeclaration): void {
    const fnInfo: WasmFunction = {
      name: stmt.name,
      params: stmt.params.map(p => p.name),
      locals: [],
      hasReturn: this.functionHasReturn(stmt.body),
    };
    this.functions.set(stmt.name, fnInfo);
    this.exports.push(stmt.name);
  }

  private functionHasReturn(body: Statement[]): boolean {
    for (const stmt of body) {
      if (stmt.type === 'ReturnStatement' && stmt.value !== null) {
        return true;
      }
      if (stmt.type === 'IfStatement') {
        const hasInConsequent = this.functionHasReturn(stmt.consequent);
        const hasInAlternate = stmt.alternate
          ? Array.isArray(stmt.alternate)
            ? this.functionHasReturn(stmt.alternate)
            : this.functionHasReturn([stmt.alternate])
          : false;
        if (hasInConsequent || hasInAlternate) return true;
      }
      if (stmt.type === 'WhileStatement') {
        if (this.functionHasReturn(stmt.body)) return true;
      }
    }
    return false;
  }

  private compileFunction(stmt: FunctionDeclaration): void {
    const fnInfo = this.functions.get(stmt.name)!;
    this.currentFunction = fnInfo;
    this.localCounter = stmt.params.length;
    fnInfo.locals = [];

    // Pre-scan for local variable declarations
    this.scanLocals(stmt.body, fnInfo);

    // Build function signature
    const params = stmt.params.map(p => `(param $${p.name} i32)`).join(' ');
    const result = fnInfo.hasReturn ? ' (result i32)' : '';
    this.emit(`(func $${stmt.name} ${params}${result}`);
    this.indent++;

    // Declare locals
    for (const local of fnInfo.locals) {
      this.emit(`(local $${local.name} i32)`);
    }

    // Compile body
    this.compileStatements(stmt.body);

    this.indent--;
    this.emit(')');
    this.currentFunction = null;
  }

  private scanLocals(stmts: Statement[], fnInfo: WasmFunction): void {
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration') {
        // Don't add if it's already a parameter
        if (!fnInfo.params.includes(stmt.name)) {
          fnInfo.locals.push({ name: stmt.name, index: this.localCounter++ });
        }
      }
      if (stmt.type === 'IfStatement') {
        this.scanLocals(stmt.consequent, fnInfo);
        if (stmt.alternate && Array.isArray(stmt.alternate)) {
          this.scanLocals(stmt.alternate, fnInfo);
        }
      }
      if (stmt.type === 'WhileStatement') {
        this.scanLocals(stmt.body, fnInfo);
      }
      if (stmt.type === 'ForStatement') {
        // Add loop variable
        if (!fnInfo.params.includes(stmt.variable)) {
          const exists = fnInfo.locals.some(l => l.name === stmt.variable);
          if (!exists) {
            fnInfo.locals.push({ name: stmt.variable, index: this.localCounter++ });
          }
        }
        this.scanLocals(stmt.body, fnInfo);
      }
    }
  }

  private compileStatements(stmts: Statement[]): void {
    for (const stmt of stmts) {
      this.compileStatement(stmt);
    }
  }

  private compileStatement(stmt: Statement): void {
    switch (stmt.type) {
      case 'VariableDeclaration':
        this.compileVariableDecl(stmt);
        break;
      case 'ReturnStatement':
        this.compileReturn(stmt);
        break;
      case 'IfStatement':
        this.compileIf(stmt);
        break;
      case 'WhileStatement':
        this.compileWhile(stmt);
        break;
      case 'ExpressionStatement':
        // Compile expression for side effects, drop result
        this.compileExpression(stmt.expression);
        this.emit('drop');
        break;
      default:
        // Skip unsupported statements
        break;
    }
  }

  private compileVariableDecl(stmt: VariableDeclaration): void {
    this.compileExpression(stmt.value);
    this.emit(`(local.set $${stmt.name})`);
  }

  private compileReturn(stmt: ReturnStatement): void {
    if (stmt.value) {
      this.compileExpression(stmt.value);
      this.emit('return');
    } else {
      this.emit('return');
    }
  }

  private compileIf(stmt: IfStatement): void {
    this.compileExpression(stmt.condition);
    const hasReturn = this.currentFunction?.hasReturn ?? false;

    if (stmt.alternate && hasReturn) {
      // If with both branches that may return a value
      this.emit('(if (result i32)');
      this.indent++;
      this.emit('(then');
      this.indent++;
      this.compileStatements(stmt.consequent);
      this.indent--;
      this.emit(')');
      this.emit('(else');
      this.indent++;
      if (Array.isArray(stmt.alternate)) {
        this.compileStatements(stmt.alternate);
      } else {
        this.compileStatement(stmt.alternate);
      }
      this.indent--;
      this.emit(')');
      this.indent--;
      this.emit(')');
    } else if (stmt.alternate) {
      this.emit('(if');
      this.indent++;
      this.emit('(then');
      this.indent++;
      this.compileStatements(stmt.consequent);
      this.indent--;
      this.emit(')');
      this.emit('(else');
      this.indent++;
      if (Array.isArray(stmt.alternate)) {
        this.compileStatements(stmt.alternate);
      } else {
        this.compileStatement(stmt.alternate);
      }
      this.indent--;
      this.emit(')');
      this.indent--;
      this.emit(')');
    } else {
      this.emit('(if');
      this.indent++;
      this.emit('(then');
      this.indent++;
      this.compileStatements(stmt.consequent);
      this.indent--;
      this.emit(')');
      this.indent--;
      this.emit(')');
    }
  }

  private compileWhile(stmt: WhileStatement): void {
    this.emit('(block $break');
    this.indent++;
    this.emit('(loop $continue');
    this.indent++;

    // Test condition, break if false
    this.compileExpression(stmt.condition);
    this.emit('i32.eqz');
    this.emit('br_if $break');

    // Body
    this.compileStatements(stmt.body);

    // Loop back
    this.emit('br $continue');

    this.indent--;
    this.emit(')');
    this.indent--;
    this.emit(')');
  }

  private compileExpression(expr: Expression): void {
    switch (expr.type) {
      case 'NumberLiteral':
        this.emit(`(i32.const ${Math.floor(expr.value)})`);
        break;
      case 'BooleanLiteral':
        this.emit(`(i32.const ${expr.value ? 1 : 0})`);
        break;
      case 'Identifier':
        this.emit(`(local.get $${expr.name})`);
        break;
      case 'BinaryExpression':
        this.compileBinary(expr);
        break;
      case 'UnaryExpression':
        this.compileUnary(expr);
        break;
      case 'CallExpression':
        this.compileCall(expr);
        break;
      case 'AssignmentExpression':
        this.compileAssignment(expr);
        break;
      case 'LogicalExpression':
        this.compileExpression(expr.left);
        this.compileExpression(expr.right);
        if (expr.operator === 'and') {
          this.emit('i32.and');
        } else {
          this.emit('i32.or');
        }
        break;
      default:
        // Unsupported expression type - emit 0 as placeholder
        this.errors.push(`Unsupported expression type for WASM: ${expr.type}`);
        this.emit('(i32.const 0)');
        break;
    }
  }

  private compileBinary(expr: BinaryExpression): void {
    this.compileExpression(expr.left);
    this.compileExpression(expr.right);

    switch (expr.operator) {
      case '+':
        this.emit('i32.add');
        break;
      case '-':
        this.emit('i32.sub');
        break;
      case '*':
        this.emit('i32.mul');
        break;
      case '/':
        this.emit('i32.div_s');
        break;
      case '%':
        this.emit('i32.rem_s');
        break;
      case '==':
        this.emit('i32.eq');
        break;
      case '!=':
        this.emit('i32.ne');
        break;
      case '<':
        this.emit('i32.lt_s');
        break;
      case '<=':
        this.emit('i32.le_s');
        break;
      case '>':
        this.emit('i32.gt_s');
        break;
      case '>=':
        this.emit('i32.ge_s');
        break;
      default:
        this.errors.push(`Unsupported binary operator for WASM: ${expr.operator}`);
        break;
    }
  }

  private compileUnary(expr: UnaryExpression): void {
    if (expr.operator === '-') {
      this.emit('(i32.const 0)');
      this.compileExpression(expr.operand);
      this.emit('i32.sub');
    } else if (expr.operator === 'not') {
      this.compileExpression(expr.operand);
      this.emit('i32.eqz');
    } else {
      this.errors.push(`Unsupported unary operator for WASM: ${expr.operator}`);
      this.compileExpression(expr.operand);
    }
  }

  private compileCall(expr: CallExpression): void {
    // Compile arguments
    for (const arg of expr.args) {
      this.compileExpression(arg);
    }

    // Emit call
    if (expr.callee.type === 'Identifier') {
      this.emit(`(call $${expr.callee.name})`);
    } else {
      this.errors.push('WASM only supports direct function calls');
      this.emit('(i32.const 0)');
    }
  }

  private compileAssignment(expr: AssignmentExpression): void {
    if (expr.target.type === 'Identifier') {
      if (expr.operator === '=') {
        this.compileExpression(expr.value);
      } else if (expr.operator === '+=') {
        this.emit(`(local.get $${expr.target.name})`);
        this.compileExpression(expr.value);
        this.emit('i32.add');
      } else if (expr.operator === '-=') {
        this.emit(`(local.get $${expr.target.name})`);
        this.compileExpression(expr.value);
        this.emit('i32.sub');
      } else if (expr.operator === '*=') {
        this.emit(`(local.get $${expr.target.name})`);
        this.compileExpression(expr.value);
        this.emit('i32.mul');
      } else {
        this.compileExpression(expr.value);
      }
      this.emit(`(local.set $${expr.target.name})`);
      // Leave a copy on the stack (assignments are expressions)
      this.emit(`(local.get $${expr.target.name})`);
    } else {
      this.errors.push('WASM only supports simple variable assignments');
      this.emit('(i32.const 0)');
    }
  }
}
