/**
 * TinyLang WebAssembly Compiler
 *
 * Compiles a subset of TinyLang to WebAssembly Text Format (.wat).
 *
 * Supported (verified end-to-end by assembling the output with wat2wasm and
 * executing it under Node's WebAssembly):
 * - Integer functions with parameters and return values
 * - Local variables
 * - if / else
 * - while loops
 * - Direct calls, including recursion
 * - Arithmetic: + - * / %
 * - Comparisons: < <= > >= == !=
 * - Logical and / or (operands normalised to 0/1)
 *
 * Limitations (by design):
 * - Only numeric (integer) programs are supported
 * - No strings, arrays, objects, or classes
 * - No closures or higher-order functions
 * - All values are i32
 *
 * IMPORTANT CONTRACT
 * ------------------
 * This compiler never substitutes a placeholder for an operation it cannot
 * translate. If any construct inside a function is unsupported, that whole
 * function is left out of the module and is not exported, and the reason is
 * reported in `skipped`. Emitting `(i32.const 0)` in place of a real operation
 * would produce a function that assembles, validates and returns a plausible
 * number while having silently dropped the actual computation - a working
 * looking export that does the wrong thing. That is worse than no export.
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

/** A function that could not be compiled, with the specific reasons why. */
export interface WasmSkippedFunction {
  name: string;
  reasons: string[];
}

export interface WasmCompileResult {
  /** The module text. Contains only functions that compiled successfully. */
  wat: string;
  /** Names of the functions exported by the module. */
  exports: string[];
  /** Names of the functions that compiled. Always equal to `exports`. */
  compiled: string[];
  /** Functions left out of the module, each with the reason(s). */
  skipped: WasmSkippedFunction[];
  /**
   * Top-level statements the WASM target does not translate at all (anything
   * other than a function declaration). Reported so their absence is visible.
   */
  ignoredTopLevel: string[];
  /**
   * Flat, human-readable diagnostics: one entry per skipped-function reason,
   * plus one per ignored top-level statement.
   */
  errors: string[];
}

/** A function body successfully lowered to WAT, pending call-graph validation. */
interface CompiledBody {
  name: string;
  lines: string[];
  /** Names of the functions this body calls directly. */
  calls: Set<string>;
}

/** Severity for a line of the compile report. */
export type WasmReportLevel = 'error' | 'note' | 'ok' | 'detail';

export interface WasmReportLine {
  level: WasmReportLevel;
  text: string;
}

export interface WasmReport {
  lines: WasmReportLine[];
  /** Whether the .wat file should be written at all. */
  writeOutput: boolean;
  /** Process exit code: non-zero if anything could not be compiled. */
  exitCode: number;
}

/**
 * Decide what to tell the user about a compile, and with what exit status.
 *
 * Kept separate from the CLI so the policy is testable: a function that could
 * not be compiled is an error, not a warning, and it must not be possible for
 * the command to report success while functions are missing from the module.
 */
export function summarizeWasmResult(result: WasmCompileResult, sourceLabel: string): WasmReport {
  const lines: WasmReportLine[] = [];

  if (result.skipped.length > 0) {
    lines.push({
      level: 'error',
      text: `${result.skipped.length} function(s) could not be compiled to WASM:`,
    });
    for (const fn of result.skipped) {
      for (const reason of fn.reasons) {
        lines.push({ level: 'error', text: `  - ${fn.name}: ${reason}` });
      }
    }
    lines.push({
      level: 'detail',
      text: '  These functions are absent from the module and are not exported.',
    });
  }

  if (result.ignoredTopLevel.length > 0) {
    lines.push({
      level: 'note',
      text:
        `Note: ${result.ignoredTopLevel.length} top-level statement(s) were left out ` +
        '(the WASM target compiles function declarations only).',
    });
  }

  if (result.compiled.length === 0) {
    lines.push({
      level: 'error',
      text:
        `Nothing was compiled to WASM: no function in ${sourceLabel} is expressible ` +
        'in the supported subset.',
    });
    return { lines, writeOutput: false, exitCode: 1 };
  }

  lines.push({ level: 'ok', text: `Compiled and exported: ${result.compiled.join(', ')}` });

  if (result.skipped.length > 0) {
    lines.push({
      level: 'error',
      text:
        `Incomplete: ${result.compiled.length} function(s) compiled, ` +
        `${result.skipped.length} could not be.`,
    });
    return { lines, writeOutput: true, exitCode: 1 };
  }

  return { lines, writeOutput: true, exitCode: 0 };
}

export class WasmCompiler {
  private functions: Map<string, WasmFunction> = new Map();
  private currentFunction: WasmFunction | null = null;
  private localCounter: number = 0;
  private output: string[] = [];
  private indent: number = 0;
  private ignoredTopLevel: string[] = [];

  /**
   * Reasons the function currently being compiled cannot be translated.
   * Non-empty means the function is discarded rather than emitted.
   */
  private unsupported: string[] = [];
  /** Direct calls made by the function currently being compiled. */
  private calls: Set<string> = new Set();

  /**
   * Compile TinyLang source code to WebAssembly Text Format
   */
  compile(source: string): WasmCompileResult {
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

    // First pass: collect function signatures so that calls to functions
    // declared later in the file resolve.
    const declarations: FunctionDeclaration[] = [];
    const duplicates: WasmSkippedFunction[] = [];
    for (const stmt of program.body) {
      if (stmt.type === 'FunctionDeclaration') {
        if (this.functions.has(stmt.name)) {
          // A duplicate definition would emit two `(func $name)` and the module
          // would not assemble. Neither definition can be trusted.
          duplicates.push({
            name: stmt.name,
            reasons: [`'${stmt.name}' is declared more than once`],
          });
          continue;
        }
        this.registerFunction(stmt);
        declarations.push(stmt);
      } else {
        this.ignoredTopLevel.push(stmt.type);
      }
    }
    const duplicateNames = new Set(duplicates.map(d => d.name));

    // Second pass: lower each body into its own buffer. A body that hit an
    // unsupported construct is thrown away, not patched up.
    const bodies = new Map<string, CompiledBody>();
    const skipped: WasmSkippedFunction[] = [...duplicates];
    for (const stmt of declarations) {
      if (duplicateNames.has(stmt.name)) continue;
      const compiled = this.compileFunction(stmt);
      if (compiled) {
        bodies.set(compiled.name, compiled);
      } else {
        skipped.push({ name: stmt.name, reasons: [...this.unsupported] });
      }
    }

    // Third pass: a surviving function that calls a discarded one would emit a
    // `(call $missing)` and the module would not assemble. Propagate the skip
    // through the call graph until it settles.
    const skippedNames = new Set(skipped.map(s => s.name));
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, body] of bodies) {
        for (const callee of body.calls) {
          if (skippedNames.has(callee)) {
            bodies.delete(name);
            skippedNames.add(name);
            skipped.push({
              name,
              reasons: [`calls '${callee}', which could not be compiled`],
            });
            changed = true;
            break;
          }
        }
      }
    }

    // Emit the module from the surviving bodies only.
    const compiledNames = [...bodies.keys()];
    this.output = [];
    this.indent = 0;
    this.emit('(module');
    this.indent++;
    for (const name of compiledNames) {
      for (const line of bodies.get(name)!.lines) {
        this.output.push('  '.repeat(this.indent) + line);
      }
    }
    for (const name of compiledNames) {
      this.emit(`(export "${name}" (func $${name}))`);
    }
    this.indent--;
    this.emit(')');

    const errors: string[] = [];
    for (const s of skipped) {
      for (const reason of s.reasons) {
        errors.push(`Function '${s.name}' was not compiled: ${reason}`);
      }
    }
    for (const type of this.ignoredTopLevel) {
      errors.push(`Top-level ${type} is not translated to WASM and was left out`);
    }

    return {
      wat: this.output.join('\n'),
      exports: compiledNames,
      compiled: compiledNames,
      skipped,
      ignoredTopLevel: [...this.ignoredTopLevel],
      errors,
    };
  }

  private reset(): void {
    this.functions.clear();
    this.currentFunction = null;
    this.localCounter = 0;
    this.output = [];
    this.indent = 0;
    this.unsupported = [];
    this.calls = new Set();
    this.ignoredTopLevel = [];
  }

  /** Record that the function being compiled cannot be translated. */
  private reject(reason: string): void {
    if (!this.unsupported.includes(reason)) {
      this.unsupported.push(reason);
    }
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

  /**
   * Whether every path through `stmts` ends in `return <value>`.
   *
   * A WASM function declaring `(result i32)` must produce an i32 on every path.
   * TinyLang lets a function fall off the end and return null, which has no i32
   * representation, so such a function is rejected rather than guessed at.
   * Deliberately conservative: a `while` loop is never assumed to run.
   */
  private alwaysReturns(stmts: Statement[]): boolean {
    for (const stmt of stmts) {
      if (stmt.type === 'ReturnStatement') {
        return stmt.value !== null;
      }
      if (stmt.type === 'IfStatement') {
        if (!stmt.alternate) continue;
        const alternate = Array.isArray(stmt.alternate) ? stmt.alternate : [stmt.alternate];
        if (this.alwaysReturns(stmt.consequent) && this.alwaysReturns(alternate)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Lower one function into its own line buffer.
   *
   * Returns null if anything in the function could not be translated, in which
   * case the buffered output is discarded and `this.unsupported` holds why.
   */
  private compileFunction(stmt: FunctionDeclaration): CompiledBody | null {
    const fnInfo = this.functions.get(stmt.name)!;
    this.currentFunction = fnInfo;
    this.localCounter = stmt.params.length;
    fnInfo.locals = [];
    this.unsupported = [];
    this.calls = new Set();

    const savedOutput = this.output;
    const savedIndent = this.indent;
    this.output = [];
    this.indent = 0;

    // Pre-scan for local variable declarations
    this.scanLocals(stmt.body, fnInfo);

    if (fnInfo.hasReturn && !this.alwaysReturns(stmt.body)) {
      this.reject(
        'control can reach the end of the function without returning a value, ' +
          'which a WASM function declaring (result i32) cannot express'
      );
    }

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

    // Safety net: with (result i32) the implicit end of the function must have
    // an i32 on the stack. Every path returns explicitly (checked above), so
    // this point is genuinely unreachable; `unreachable` is polymorphic and
    // satisfies the validator without inventing a return value.
    if (fnInfo.hasReturn) {
      this.emit('unreachable');
    }

    this.indent--;
    this.emit(')');
    this.currentFunction = null;

    const lines = this.output;
    const calls = this.calls;
    const failed = this.unsupported.length > 0;
    this.output = savedOutput;
    this.indent = savedIndent;

    if (failed) return null;
    return { name: stmt.name, lines, calls };
  }

  private scanLocals(stmts: Statement[], fnInfo: WasmFunction): void {
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration') {
        this.declareLocal(stmt.name, fnInfo);
      }
      if (stmt.type === 'IfStatement') {
        this.scanLocals(stmt.consequent, fnInfo);
        if (stmt.alternate) {
          this.scanLocals(
            Array.isArray(stmt.alternate) ? stmt.alternate : [stmt.alternate],
            fnInfo
          );
        }
      }
      if (stmt.type === 'WhileStatement') {
        this.scanLocals(stmt.body, fnInfo);
      }
    }
  }

  /**
   * Claim a WASM local slot for `name`.
   *
   * WASM locals are function-scoped, so two same-named declarations in sibling
   * TinyLang blocks would collapse into one slot and silently alias. That is
   * rejected rather than mistranslated.
   */
  private declareLocal(name: string, fnInfo: WasmFunction): void {
    if (fnInfo.params.includes(name)) {
      this.reject(
        `local '${name}' shadows the parameter of the same name; ` +
          'WASM locals are function-scoped so the two cannot coexist'
      );
      return;
    }
    if (fnInfo.locals.some(l => l.name === name)) {
      this.reject(
        `'${name}' is declared more than once; WASM locals are ` +
          'function-scoped so block shadowing cannot be represented'
      );
      return;
    }
    fnInfo.locals.push({ name, index: this.localCounter++ });
  }

  /** Whether `name` resolves to a parameter or local of the current function. */
  private isLocalName(name: string): boolean {
    const fn = this.currentFunction;
    if (!fn) return false;
    return fn.params.includes(name) || fn.locals.some(l => l.name === name);
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
        // Silently dropping a statement produces a function that runs but does
        // not do what the source says, so the whole function is rejected.
        this.reject(`unsupported statement type for WASM: ${stmt.type}`);
        break;
    }
  }

  private compileVariableDecl(stmt: VariableDeclaration): void {
    if (!this.isLocalName(stmt.name)) {
      // scanLocals already rejected the declaration (duplicate or shadowing a
      // parameter); there is no slot to store into.
      this.compileExpression(stmt.value);
      this.emit('drop');
      return;
    }
    this.compileExpression(stmt.value);
    this.emit(`(local.set $${stmt.name})`);
  }

  private compileReturn(stmt: ReturnStatement): void {
    if (stmt.value) {
      this.compileExpression(stmt.value);
      this.emit('return');
    } else if (this.currentFunction?.hasReturn) {
      this.reject(
        'a bare `return` mixed with value returns cannot be expressed by a ' +
          'WASM function declaring (result i32)'
      );
    } else {
      this.emit('return');
    }
  }

  private compileIf(stmt: IfStatement): void {
    this.compileExpression(stmt.condition);

    // Statements in this compiler never leave a value on the stack, so the
    // `if` is always typed `[] -> []`. The previous code emitted
    // `(if (result i32) ...)` whenever the *enclosing function* returned a
    // value, which happened to validate only because every branch ended in
    // `return`; a branch that did not return made the module unassemblable.
    this.emit('(if');
    this.indent++;
    this.emit('(then');
    this.indent++;
    this.compileStatements(stmt.consequent);
    this.indent--;
    this.emit(')');
    if (stmt.alternate) {
      this.emit('(else');
      this.indent++;
      if (Array.isArray(stmt.alternate)) {
        this.compileStatements(stmt.alternate);
      } else {
        this.compileStatement(stmt.alternate);
      }
      this.indent--;
      this.emit(')');
    }
    this.indent--;
    this.emit(')');
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
        if (!Number.isInteger(expr.value)) {
          // Flooring here would quietly turn 1.5 into 1.
          this.reject(
            `numeric literal ${expr.value} is not an integer and every WASM ` +
              'value in this target is an i32'
          );
          this.emit('(i32.const 0)');
          break;
        }
        this.emit(`(i32.const ${expr.value})`);
        break;
      case 'BooleanLiteral':
        this.emit(`(i32.const ${expr.value ? 1 : 0})`);
        break;
      case 'Identifier':
        if (!this.isLocalName(expr.name)) {
          this.reject(
            `'${expr.name}' is not a parameter or local of this function; ` +
              'the WASM target has no globals or closures'
          );
          this.emit('(i32.const 0)');
          break;
        }
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
        // Normalise both operands to 0/1 first. A raw i32.and would make
        // `1 and 2` evaluate to 0, i.e. false, which is simply wrong.
        // Note: unlike TinyLang's `and`/`or` this yields 0/1 rather than the
        // operand value, and does not short-circuit - both are consequences of
        // every value being an i32.
        this.compileExpression(expr.left);
        this.emit('(i32.const 0)');
        this.emit('i32.ne');
        this.compileExpression(expr.right);
        this.emit('(i32.const 0)');
        this.emit('i32.ne');
        if (expr.operator === 'and') {
          this.emit('i32.and');
        } else if (expr.operator === 'or') {
          this.emit('i32.or');
        } else {
          this.reject(`unsupported logical operator for WASM: ${expr.operator}`);
        }
        break;
      default:
        // No placeholder substitution: the function is rejected instead.
        this.reject(`unsupported expression type for WASM: ${expr.type}`);
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
        // Emitting nothing would leave both operands stranded on the stack.
        this.reject(`unsupported binary operator for WASM: ${expr.operator}`);
        this.emit('drop');
        this.emit('drop');
        this.emit('(i32.const 0)');
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
      // Previously the operand was emitted with the operator dropped, which
      // silently turned `~x` into `x`.
      this.reject(`unsupported unary operator for WASM: ${expr.operator}`);
      this.compileExpression(expr.operand);
    }
  }

  private compileCall(expr: CallExpression): void {
    if (expr.callee.type !== 'Identifier') {
      this.reject('the WASM target supports direct calls to named functions only');
      this.emit('(i32.const 0)');
      return;
    }

    const name = expr.callee.name;
    const target = this.functions.get(name);
    if (!target) {
      this.reject(
        `'${name}' is not a function declared in this file; the WASM target ` +
          'has no runtime library to call into'
      );
      this.emit('(i32.const 0)');
      return;
    }
    if (target.params.length !== expr.args.length) {
      this.reject(
        `'${name}' takes ${target.params.length} argument(s) but is called ` +
          `with ${expr.args.length}; WASM calls are not variadic and have no ` +
          'default arguments'
      );
      this.emit('(i32.const 0)');
      return;
    }
    if (!target.hasReturn) {
      // A void call pushes nothing, so every use site (including the `drop`
      // after an expression statement) would underflow the stack.
      this.reject(
        `'${name}' returns no value, so a call to it cannot be used where the ` +
          'WASM target expects an i32'
      );
      this.emit('(i32.const 0)');
      return;
    }

    this.calls.add(name);
    for (const arg of expr.args) {
      this.compileExpression(arg);
    }
    this.emit(`(call $${name})`);
  }

  private compileAssignment(expr: AssignmentExpression): void {
    if (expr.target.type !== 'Identifier') {
      this.reject(
        'the WASM target supports assignment to plain local variables only'
      );
      this.emit('(i32.const 0)');
      return;
    }
    const name = expr.target.name;
    if (!this.isLocalName(name)) {
      this.reject(
        `'${name}' is not a parameter or local of this function; ` +
          'the WASM target has no globals or closures'
      );
      this.emit('(i32.const 0)');
      return;
    }

    switch (expr.operator) {
      case '=':
        this.compileExpression(expr.value);
        break;
      case '+=':
        this.emit(`(local.get $${name})`);
        this.compileExpression(expr.value);
        this.emit('i32.add');
        break;
      case '-=':
        this.emit(`(local.get $${name})`);
        this.compileExpression(expr.value);
        this.emit('i32.sub');
        break;
      case '*=':
        this.emit(`(local.get $${name})`);
        this.compileExpression(expr.value);
        this.emit('i32.mul');
        break;
      case '/=':
        // This used to fall through to a plain assignment, turning `x /= 2`
        // into `x = 2`.
        this.emit(`(local.get $${name})`);
        this.compileExpression(expr.value);
        this.emit('i32.div_s');
        break;
      default:
        this.reject(
          `unsupported compound assignment operator for WASM: ${expr.operator}`
        );
        this.compileExpression(expr.value);
        break;
    }
    this.emit(`(local.set $${name})`);
    // Leave a copy on the stack (assignments are expressions)
    this.emit(`(local.get $${name})`);
  }
}
