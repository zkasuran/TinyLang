/**
 * TinyLang Interpreter
 * 
 * A tree-walk interpreter that evaluates the AST produced by the parser.
 * Each AST node type has a corresponding evaluation method.
 * 
 * Key features:
 * - Environment-based lexical scoping
 * - Closures for functions
 * - Class-based OOP with inheritance
 * - Control flow via signal objects (Return, Break, Continue)
 * - Educational runtime error messages
 */

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
  ImportStatement,
  MatchStatement,
  BinaryExpression,
  UnaryExpression,
  LogicalExpression,
  AssignmentExpression,
  CallExpression,
  MemberExpression,
  IndexExpression,
  ArrowFunction,
  RangeExpression,
  NewExpression,
  FunctionExpression,
  TryCatchStatement,
  ThrowStatement,
  InterpolatedString,
  DestructuringDeclaration,
  EnumDeclaration,
  PipeExpression,
  PipeMethodExpression,
  OptionalMemberExpression,
  OptionalIndexExpression,
  NullishCoalesceExpression,
} from '../types/ast';
import {
  RuntimeValue,
  ArrayValue,
  FunctionValue,
  NativeFunctionValue,
  ClassValue,
  InstanceValue,
  Environment,
  RuntimeError,
  StepLimitExceeded,
  ReturnSignal,
  BreakSignal,
  ContinueSignal,
  createNumber,
  createString,
  createBoolean,
  createNull,
  createArray,
  createObject,
  isTruthy,
  stringify,
  valueEquals,
} from '../types/values';
import { DebugFrame, DebugAction } from '../debugger/types';

export type OutputHandler = (message: string) => void;

export interface ModuleLoaderInterface {
  loadModule(filePath: string): Environment;
}

export interface ModuleResolverInterface {
  resolve(importSource: string, fromFile: string): string;
}

export interface InterpreterOptions {
  /** Custom output handler (default: console.log) */
  output?: OutputHandler;
  /** Maximum execution steps to prevent infinite loops (default: 1_000_000) */
  maxSteps?: number;
  /** Custom input handler for the input() function */
  input?: (prompt: string) => string;
}

export class Interpreter {
  private output: OutputHandler;
  private maxSteps: number;
  private steps: number = 0;
  private globalEnv: Environment;
  private outputBuffer: string[] = [];

  /** Module system support */
  private moduleLoader: ModuleLoaderInterface | null = null;
  private moduleResolver: ModuleResolverInterface | null = null;
  private currentFile: string | null = null;

  /** Optional debug hook called before each statement */
  public debugHook?: (stmt: Statement, env: Environment, callStack: DebugFrame[]) => DebugAction;

  /** Debug call stack tracking */
  private debugCallStack: DebugFrame[] = [];

  constructor(options: InterpreterOptions = {}) {
    this.output = options.output || ((msg: string) => console.log(msg));
    this.maxSteps = options.maxSteps || 1_000_000;
    this.globalEnv = new Environment();
  }

  /**
   * Set the module loader and resolver for import statement support.
   */
  setModuleLoader(loader: ModuleLoaderInterface, currentFile: string, resolver?: ModuleResolverInterface): void {
    this.moduleLoader = loader;
    this.currentFile = currentFile;
    if (resolver) {
      this.moduleResolver = resolver;
    }
  }

  /**
   * Execute a program and return the last evaluated value
   */
  execute(program: Program): RuntimeValue {
    this.steps = 0;
    this.outputBuffer = [];
    // Initialize debug call stack with main frame if hook is set
    if (this.debugHook) {
      this.debugCallStack = [{
        functionName: '<main>',
        line: 1,
        column: 1,
        env: this.globalEnv,
      }];
    }
    return this.executeStatements(program.body, this.globalEnv);
  }

  /**
   * Execute in a specific environment (used by REPL to preserve state)
   */
  executeInEnvironment(program: Program, env: Environment): RuntimeValue {
    this.steps = 0;
    // Initialize debug call stack with main frame if hook is set
    if (this.debugHook) {
      this.debugCallStack = [{
        functionName: '<main>',
        line: 1,
        column: 1,
        env: env,
      }];
    }
    return this.executeStatements(program.body, env);
  }

  /**
   * Get the global environment (for REPL state persistence)
   */
  getGlobalEnvironment(): Environment {
    return this.globalEnv;
  }

  /**
   * Get collected output
   */
  getOutput(): string[] {
    return this.outputBuffer;
  }

  // ============ Statement Evaluation ============

  private executeStatements(statements: Statement[], env: Environment): RuntimeValue {
    let result: RuntimeValue = createNull();

    for (const stmt of statements) {
      this.checkStepLimit();

      // Call debug hook if set
      if (this.debugHook) {
        this.debugHook(stmt, env, this.debugCallStack);
      }

      const value = this.executeStatement(stmt, env);

      // Handle control flow signals
      if (value instanceof ReturnSignal ||
          value instanceof BreakSignal ||
          value instanceof ContinueSignal) {
        return value as unknown as RuntimeValue;
      }

      result = value;
    }

    return result;
  }

  private executeStatement(stmt: Statement, env: Environment): RuntimeValue {
    switch (stmt.type) {
      case 'VariableDeclaration':
        return this.evalVariableDeclaration(stmt, env);
      case 'DestructuringDeclaration':
        return this.evalDestructuringDeclaration(stmt as unknown as DestructuringDeclaration, env);
      case 'FunctionDeclaration':
        return this.evalFunctionDeclaration(stmt, env);
      case 'ClassDeclaration':
        return this.evalClassDeclaration(stmt, env);
      case 'EnumDeclaration':
        return this.evalEnumDeclaration(stmt as unknown as EnumDeclaration, env);
      case 'ReturnStatement':
        return this.evalReturnStatement(stmt, env);
      case 'IfStatement':
        return this.evalIfStatement(stmt, env);
      case 'WhileStatement':
        return this.evalWhileStatement(stmt, env);
      case 'ForStatement':
        return this.evalForStatement(stmt, env);
      case 'BreakStatement':
        return new BreakSignal() as unknown as RuntimeValue;
      case 'ContinueStatement':
        return new ContinueSignal() as unknown as RuntimeValue;
      case 'ExpressionStatement':
        return this.evalExpression(stmt.expression, env);
      case 'PrintStatement':
        return this.evalPrintStatement(stmt, env);
      case 'MatchStatement':
        return this.evalMatchStatement(stmt, env);
      case 'TestDeclaration':
        // Tests are only run by the test runner, not during normal execution
        return createNull();
      case 'ImportStatement':
        return this.evalImportStatement(stmt, env);
      case 'TryCatchStatement':
        return this.evalTryCatchStatement(stmt as unknown as TryCatchStatement, env);
      case 'ThrowStatement':
        return this.evalThrowStatement(stmt as unknown as ThrowStatement, env);
      default:
        throw new RuntimeError(
          `Unknown statement type: ${(stmt as unknown as Statement).type}`,
          (stmt as unknown as { position: { line: number; column: number } }).position.line,
          (stmt as unknown as { position: { line: number; column: number } }).position.column
        );
    }
  }

  private evalVariableDeclaration(stmt: VariableDeclaration, env: Environment): RuntimeValue {
    const value = this.evalExpression(stmt.value, env);
    env.define(stmt.name, value, stmt.constant);
    return value;
  }

  private evalDestructuringDeclaration(stmt: DestructuringDeclaration, env: Environment): RuntimeValue {
    const value = this.evalExpression(stmt.value, env);

    if (stmt.pattern.kind === 'array') {
      if (value.type !== 'array') {
        throw new RuntimeError(
          `Cannot destructure ${value.type} as an array. Right side must be an array.`,
          stmt.position.line,
          stmt.position.column
        );
      }
      for (let i = 0; i < stmt.pattern.names.length; i++) {
        const elementValue = i < value.elements.length ? value.elements[i] : createNull();
        env.define(stmt.pattern.names[i], elementValue, stmt.constant);
      }
    } else {
      // object destructuring
      if (value.type !== 'object') {
        throw new RuntimeError(
          `Cannot destructure ${value.type} as an object. Right side must be an object.`,
          stmt.position.line,
          stmt.position.column
        );
      }
      for (const name of stmt.pattern.names) {
        const propValue = value.properties.get(name) || createNull();
        env.define(name, propValue, stmt.constant);
      }
    }

    return value;
  }

  private evalFunctionDeclaration(stmt: FunctionDeclaration, env: Environment): RuntimeValue {
    const fn: FunctionValue = {
      type: 'function',
      name: stmt.name,
      params: stmt.params,
      body: stmt.body,
      closure: env,
    };
    env.define(stmt.name, fn);
    return fn;
  }

  private evalClassDeclaration(stmt: ClassDeclaration, env: Environment): RuntimeValue {
    let superClass: ClassValue | null = null;

    if (stmt.superClass) {
      const superVal = env.lookup(stmt.superClass);
      if (superVal.type !== 'class') {
        throw new RuntimeError(
          `'${stmt.superClass}' is not a class and cannot be extended`,
          stmt.position.line,
          stmt.position.column
        );
      }
      superClass = superVal;
    }

    const methods = new Map<string, FunctionValue>();
    for (const method of stmt.methods) {
      const fn: FunctionValue = {
        type: 'function',
        name: method.name,
        params: method.params,
        body: method.body,
        closure: env,
      };
      methods.set(method.name, fn);
    }

    const properties = new Map<string, RuntimeValue>();
    for (const prop of stmt.properties) {
      const value = this.evalExpression(prop.value, env);
      properties.set(prop.name, value);
    }

    const classVal: ClassValue = {
      type: 'class',
      name: stmt.name,
      superClass,
      methods,
      properties,
    };

    env.define(stmt.name, classVal);
    return classVal;
  }

  private evalReturnStatement(stmt: ReturnStatement, env: Environment): RuntimeValue {
    const value = stmt.value ? this.evalExpression(stmt.value, env) : createNull();
    return new ReturnSignal(value) as unknown as RuntimeValue;
  }

  private evalIfStatement(stmt: IfStatement, env: Environment): RuntimeValue {
    const condition = this.evalExpression(stmt.condition, env);

    if (isTruthy(condition)) {
      const blockEnv = env.createChild();
      return this.executeStatements(stmt.consequent, blockEnv);
    } else if (stmt.alternate) {
      if (Array.isArray(stmt.alternate)) {
        const blockEnv = env.createChild();
        return this.executeStatements(stmt.alternate, blockEnv);
      } else {
        // else if
        return this.evalIfStatement(stmt.alternate, env);
      }
    }

    return createNull();
  }

  private evalWhileStatement(stmt: WhileStatement, env: Environment): RuntimeValue {
    let result: RuntimeValue = createNull();

    while (isTruthy(this.evalExpression(stmt.condition, env))) {
      this.checkStepLimit();
      const blockEnv = env.createChild();
      const value = this.executeStatements(stmt.body, blockEnv);

      if (value instanceof BreakSignal || (value as unknown) instanceof BreakSignal) {
        break;
      }
      if (value instanceof ContinueSignal || (value as unknown) instanceof ContinueSignal) {
        continue;
      }
      if (value instanceof ReturnSignal || (value as unknown) instanceof ReturnSignal) {
        return value;
      }

      result = value;
    }

    return result;
  }

  private evalForStatement(stmt: ForStatement, env: Environment): RuntimeValue {
    const iterable = this.evalExpression(stmt.iterable, env);
    let result: RuntimeValue = createNull();

    let items: RuntimeValue[];

    if (iterable.type === 'array') {
      items = iterable.elements;
    } else if (iterable.type === 'string') {
      items = iterable.value.split('').map(createString);
    } else {
      throw new RuntimeError(
        `Cannot iterate over ${iterable.type}. For loops work with arrays, strings, and ranges.`,
        stmt.position.line,
        stmt.position.column
      );
    }

    for (const item of items) {
      this.checkStepLimit();
      const blockEnv = env.createChild();
      blockEnv.define(stmt.variable, item);

      const value = this.executeStatements(stmt.body, blockEnv);

      if (value instanceof BreakSignal || (value as unknown) instanceof BreakSignal) {
        break;
      }
      if (value instanceof ContinueSignal || (value as unknown) instanceof ContinueSignal) {
        continue;
      }
      if (value instanceof ReturnSignal || (value as unknown) instanceof ReturnSignal) {
        return value;
      }

      result = value;
    }

    return result;
  }

  private evalPrintStatement(stmt: PrintStatement, env: Environment): RuntimeValue {
    const values = stmt.expressions.map(expr => this.evalExpression(expr, env));
    const message = values.map(stringify).join(' ');
    this.output(message);
    this.outputBuffer.push(message);
    return createNull();
  }

  private evalMatchStatement(stmt: MatchStatement, env: Environment): RuntimeValue {
    const subject = this.evalExpression(stmt.subject, env);

    for (const matchCase of stmt.cases) {
      const pattern = this.evalExpression(matchCase.pattern, env);
      if (valueEquals(subject, pattern)) {
        const blockEnv = env.createChild();
        return this.executeStatements(matchCase.body, blockEnv);
      }
    }

    if (stmt.defaultCase) {
      const blockEnv = env.createChild();
      return this.executeStatements(stmt.defaultCase, blockEnv);
    }

    return createNull();
  }

  private evalImportStatement(stmt: ImportStatement, env: Environment): RuntimeValue {
    if (!this.moduleLoader || !this.currentFile) {
      // No module system configured - silently ignore (for REPL/playground mode)
      return createNull();
    }

    try {
      // Use the module resolver interface if available, otherwise use loader directly
      let resolvedPath: string;
      if (this.moduleResolver) {
        resolvedPath = this.moduleResolver.resolve(stmt.source, this.currentFile);
      } else {
        // Fallback: treat source as path relative to current file
        const dir = stmt.source.startsWith('./') || stmt.source.startsWith('../')
          ? require('path').dirname(this.currentFile)
          : require('path').dirname(this.currentFile);
        resolvedPath = require('path').resolve(dir, stmt.source.endsWith('.tiny') ? stmt.source : stmt.source + '.tiny');
      }
      const moduleEnv = this.moduleLoader.loadModule(resolvedPath);

      // Extract named imports from the module environment
      for (const name of stmt.names) {
        try {
          const value = moduleEnv.lookup(name);
          env.define(name, value);
        } catch {
          throw new RuntimeError(
            `'${name}' is not exported from module '${stmt.source}'`,
            stmt.position.line,
            stmt.position.column
          );
        }
      }
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      throw new RuntimeError(
        e instanceof Error ? e.message : String(e),
        stmt.position.line,
        stmt.position.column
      );
    }

    return createNull();
  }

  // ============ Expression Evaluation ============

  private evalExpression(expr: Expression, env: Environment): RuntimeValue {
    this.checkStepLimit();

    switch (expr.type) {
      case 'NumberLiteral':
        return createNumber(expr.value);
      case 'StringLiteral':
        return createString(expr.value);
      case 'InterpolatedString':
        return this.evalInterpolatedString(expr as unknown as InterpolatedString, env);
      case 'BooleanLiteral':
        return createBoolean(expr.value);
      case 'NullLiteral':
        return createNull();
      case 'ArrayLiteral':
        return this.evalArrayLiteral(expr, env);
      case 'ObjectLiteral':
        return this.evalObjectLiteral(expr, env);
      case 'Identifier':
        return this.evalIdentifier(expr, env);
      case 'BinaryExpression':
        return this.evalBinaryExpression(expr, env);
      case 'UnaryExpression':
        return this.evalUnaryExpression(expr, env);
      case 'LogicalExpression':
        return this.evalLogicalExpression(expr, env);
      case 'AssignmentExpression':
        return this.evalAssignmentExpression(expr, env);
      case 'CallExpression':
        return this.evalCallExpression(expr, env);
      case 'MemberExpression':
        return this.evalMemberExpression(expr, env);
      case 'IndexExpression':
        return this.evalIndexExpression(expr, env);
      case 'ArrowFunction':
        return this.evalArrowFunction(expr, env);
      case 'FunctionExpression':
        return this.evalFunctionExpr(expr, env);
      case 'RangeExpression':
        return this.evalRangeExpression(expr, env);
      case 'NewExpression':
        return this.evalNewExpression(expr, env);
      case 'ThisExpression':
        return env.lookup('this');
      case 'TernaryExpression':
        return this.evalTernaryExpression(expr, env);
      case 'SpreadExpression':
        throw new RuntimeError(
          'Spread expressions can only be used in function calls or array literals',
          expr.position.line,
          expr.position.column
        );
      case 'PipeExpression':
        return this.evalPipeExpression(expr as unknown as PipeExpression, env);
      case 'PipeMethodExpression':
        return this.evalPipeMethodExpression(expr as unknown as PipeMethodExpression, env);
      case 'OptionalMemberExpression':
        return this.evalOptionalMemberExpression(expr as unknown as OptionalMemberExpression, env);
      case 'OptionalIndexExpression':
        return this.evalOptionalIndexExpression(expr as unknown as OptionalIndexExpression, env);
      case 'NullishCoalesceExpression':
        return this.evalNullishCoalesceExpression(expr as unknown as NullishCoalesceExpression, env);
      default:
        throw new RuntimeError(
          `Unknown expression type: ${(expr as unknown as Expression).type}`,
          (expr as unknown as { position: { line: number; column: number } }).position.line,
          (expr as unknown as { position: { line: number; column: number } }).position.column
        );
    }
  }

  private evalArrayLiteral(expr: { elements: Expression[] }, env: Environment): ArrayValue {
    const elements: RuntimeValue[] = [];
    for (const el of expr.elements) {
      if (el.type === 'SpreadExpression') {
        const spread = this.evalExpression(el.argument, env);
        if (spread.type === 'array') {
          elements.push(...spread.elements);
        } else if (spread.type === 'string') {
          elements.push(...spread.value.split('').map(createString));
        } else {
          throw new RuntimeError(
            `Cannot spread ${spread.type}. Spread (...) works with arrays and strings.`,
            el.position.line,
            el.position.column
          );
        }
      } else {
        elements.push(this.evalExpression(el, env));
      }
    }
    return createArray(elements);
  }

  private evalObjectLiteral(
    expr: { properties: { key: string; value: Expression }[] },
    env: Environment
  ): RuntimeValue {
    const properties = new Map<string, RuntimeValue>();
    for (const prop of expr.properties) {
      properties.set(prop.key, this.evalExpression(prop.value, env));
    }
    return { type: 'object', properties };
  }

  private evalIdentifier(expr: { name: string; position: { line: number; column: number } }, env: Environment): RuntimeValue {
    try {
      return env.lookup(expr.name);
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw new RuntimeError(
          error.message,
          expr.position.line,
          expr.position.column
        );
      }
      throw error;
    }
  }

  private evalBinaryExpression(expr: BinaryExpression, env: Environment): RuntimeValue {
    const left = this.evalExpression(expr.left, env);
    const right = this.evalExpression(expr.right, env);

    switch (expr.operator) {
      case '+': return this.evalAdd(left, right, expr);
      case '-': return this.evalArithmetic(left, right, expr, (a, b) => a - b);
      case '*': return this.evalMultiply(left, right, expr);
      case '/': return this.evalDivide(left, right, expr);
      case '%': return this.evalArithmetic(left, right, expr, (a, b) => a % b);
      case '**': return this.evalArithmetic(left, right, expr, (a, b) => Math.pow(a, b));
      case '==': return createBoolean(valueEquals(left, right));
      case '!=': return createBoolean(!valueEquals(left, right));
      case '<': return this.evalComparison(left, right, expr, (a, b) => a < b);
      case '>': return this.evalComparison(left, right, expr, (a, b) => a > b);
      case '<=': return this.evalComparison(left, right, expr, (a, b) => a <= b);
      case '>=': return this.evalComparison(left, right, expr, (a, b) => a >= b);
      default:
        throw new RuntimeError(
          `Unknown operator: ${expr.operator}`,
          expr.position.line,
          expr.position.column
        );
    }
  }

  private evalAdd(left: RuntimeValue, right: RuntimeValue, expr: BinaryExpression): RuntimeValue {
    if (left.type === 'number' && right.type === 'number') {
      return createNumber(left.value + right.value);
    }
    if (left.type === 'string' || right.type === 'string') {
      return createString(stringify(left) + stringify(right));
    }
    if (left.type === 'array' && right.type === 'array') {
      return createArray([...left.elements, ...right.elements]);
    }
    throw new RuntimeError(
      `Cannot add ${left.type} and ${right.type}. The + operator works with numbers, strings, and arrays.`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalMultiply(left: RuntimeValue, right: RuntimeValue, expr: BinaryExpression): RuntimeValue {
    if (left.type === 'number' && right.type === 'number') {
      return createNumber(left.value * right.value);
    }
    if (left.type === 'string' && right.type === 'number') {
      return createString(left.value.repeat(Math.floor(right.value)));
    }
    if (left.type === 'number' && right.type === 'string') {
      return createString(right.value.repeat(Math.floor(left.value)));
    }
    throw new RuntimeError(
      `Cannot multiply ${left.type} and ${right.type}`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalDivide(left: RuntimeValue, right: RuntimeValue, expr: BinaryExpression): RuntimeValue {
    if (left.type !== 'number' || right.type !== 'number') {
      throw new RuntimeError(
        `Cannot divide ${left.type} by ${right.type}. Division only works with numbers.`,
        expr.position.line,
        expr.position.column
      );
    }
    if (right.value === 0) {
      throw new RuntimeError(
        `Division by zero! You tried to divide ${left.value} by 0, which is undefined in mathematics.`,
        expr.position.line,
        expr.position.column
      );
    }
    return createNumber(left.value / right.value);
  }

  private evalArithmetic(
    left: RuntimeValue,
    right: RuntimeValue,
    expr: BinaryExpression,
    op: (a: number, b: number) => number
  ): RuntimeValue {
    if (left.type !== 'number' || right.type !== 'number') {
      throw new RuntimeError(
        `Cannot perform arithmetic on ${left.type} and ${right.type}. Arithmetic operators only work with numbers.`,
        expr.position.line,
        expr.position.column
      );
    }
    return createNumber(op(left.value, right.value));
  }

  private evalComparison(
    left: RuntimeValue,
    right: RuntimeValue,
    expr: BinaryExpression,
    op: (a: number, b: number) => boolean
  ): RuntimeValue {
    if (left.type === 'number' && right.type === 'number') {
      return createBoolean(op(left.value, right.value));
    }
    if (left.type === 'string' && right.type === 'string') {
      return createBoolean(op(left.value.localeCompare(right.value), 0));
    }
    throw new RuntimeError(
      `Cannot compare ${left.type} and ${right.type}. Comparison works with numbers and strings.`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalUnaryExpression(expr: UnaryExpression, env: Environment): RuntimeValue {
    const operand = this.evalExpression(expr.operand, env);

    switch (expr.operator) {
      case '-':
        if (operand.type !== 'number') {
          throw new RuntimeError(
            `Cannot negate ${operand.type}. The - operator only works with numbers.`,
            expr.position.line,
            expr.position.column
          );
        }
        return createNumber(-operand.value);
      case 'not':
        return createBoolean(!isTruthy(operand));
      default:
        throw new RuntimeError(
          `Unknown unary operator: ${expr.operator}`,
          expr.position.line,
          expr.position.column
        );
    }
  }

  private evalLogicalExpression(expr: LogicalExpression, env: Environment): RuntimeValue {
    const left = this.evalExpression(expr.left, env);

    if (expr.operator === 'or') {
      if (isTruthy(left)) return left;
      return this.evalExpression(expr.right, env);
    } else {
      // 'and'
      if (!isTruthy(left)) return left;
      return this.evalExpression(expr.right, env);
    }
  }

  private evalAssignmentExpression(expr: AssignmentExpression, env: Environment): RuntimeValue {
    const value = this.evalExpression(expr.value, env);

    if (expr.target.type === 'Identifier') {
      if (expr.operator === '=') {
        return env.assign(expr.target.name, value);
      }
      // Compound assignment
      const current = env.lookup(expr.target.name);
      const newValue = this.evalCompoundAssignment(current, value, expr.operator, expr);
      return env.assign(expr.target.name, newValue);
    }

    if (expr.target.type === 'MemberExpression') {
      const obj = this.evalExpression(expr.target.object, env);
      if (obj.type === 'object') {
        const finalValue = expr.operator === '='
          ? value
          : this.evalCompoundAssignment(
              obj.properties.get(expr.target.property) || createNull(),
              value,
              expr.operator,
              expr
            );
        obj.properties.set(expr.target.property, finalValue);
        return finalValue;
      }
      if (obj.type === 'instance') {
        const finalValue = expr.operator === '='
          ? value
          : this.evalCompoundAssignment(
              obj.properties.get(expr.target.property) || createNull(),
              value,
              expr.operator,
              expr
            );
        obj.properties.set(expr.target.property, finalValue);
        return finalValue;
      }
      throw new RuntimeError(
        `Cannot set property on ${obj.type}`,
        expr.position.line,
        expr.position.column
      );
    }

    if (expr.target.type === 'IndexExpression') {
      const obj = this.evalExpression(expr.target.object, env);
      const index = this.evalExpression(expr.target.index, env);
      if (obj.type === 'array' && index.type === 'number') {
        const finalValue = expr.operator === '='
          ? value
          : this.evalCompoundAssignment(
              obj.elements[index.value] || createNull(),
              value,
              expr.operator,
              expr
            );
        obj.elements[index.value] = finalValue;
        return finalValue;
      }
      throw new RuntimeError(
        `Cannot assign to index of ${obj.type}`,
        expr.position.line,
        expr.position.column
      );
    }

    throw new RuntimeError(
      `Invalid assignment target`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalCompoundAssignment(
    current: RuntimeValue,
    value: RuntimeValue,
    operator: string,
    expr: AssignmentExpression
  ): RuntimeValue {
    if (current.type !== 'number' || value.type !== 'number') {
      throw new RuntimeError(
        `Compound assignment operators only work with numbers`,
        expr.position.line,
        expr.position.column
      );
    }
    switch (operator) {
      case '+=': return createNumber(current.value + value.value);
      case '-=': return createNumber(current.value - value.value);
      case '*=': return createNumber(current.value * value.value);
      case '/=':
        if (value.value === 0) {
          throw new RuntimeError('Division by zero!', expr.position.line, expr.position.column);
        }
        return createNumber(current.value / value.value);
      default:
        throw new RuntimeError(
          `Unknown assignment operator: ${operator}`,
          expr.position.line,
          expr.position.column
        );
    }
  }

  private evalCallExpression(expr: CallExpression, env: Environment): RuntimeValue {
    // Handle method calls on instances
    let callee: RuntimeValue;
    let thisObj: RuntimeValue | null = null;

    if (expr.callee.type === 'MemberExpression') {
      const obj = this.evalExpression(expr.callee.object, env);
      thisObj = obj;

      // Check for built-in methods on arrays, strings, objects
      const builtinResult = this.tryBuiltinMethod(obj, expr.callee.property, expr, env);
      if (builtinResult !== undefined) {
        return builtinResult;
      }

      if (obj.type === 'instance') {
        const method = this.findMethod(obj.classRef, expr.callee.property);
        if (!method) {
          throw new RuntimeError(
            `'${obj.className}' has no method '${expr.callee.property}'`,
            expr.position.line,
            expr.position.column
          );
        }
        callee = method;
      } else if (obj.type === 'class') {
        const method = obj.methods.get(expr.callee.property);
        if (!method) {
          throw new RuntimeError(
            `Class '${obj.name}' has no static method '${expr.callee.property}'`,
            expr.position.line,
            expr.position.column
          );
        }
        callee = method;
      } else if (obj.type === 'object') {
        // Allow calling function properties on objects
        const prop = obj.properties.get(expr.callee.property);
        if (!prop || (prop.type !== 'function' && prop.type !== 'native-function')) {
          throw new RuntimeError(
            `'${expr.callee.property}' is not a callable method on this object`,
            expr.position.line,
            expr.position.column
          );
        }
        callee = prop;
      } else {
        throw new RuntimeError(
          `Cannot call method '${expr.callee.property}' on ${obj.type}`,
          expr.position.line,
          expr.position.column
        );
      }
    } else {
      callee = this.evalExpression(expr.callee, env);
    }

    const args = expr.args.map(arg => this.evalExpression(arg, env));

    return this.callFunction(callee, args, thisObj, expr, env);
  }

  private callFunction(
    callee: RuntimeValue,
    args: RuntimeValue[],
    thisObj: RuntimeValue | null,
    expr: CallExpression | NewExpression,
    _env: Environment
  ): RuntimeValue {
    if (callee.type === 'native-function') {
      const nativeFn = callee as NativeFunctionValue;
      if (nativeFn.arity >= 0 && args.length !== nativeFn.arity) {
        throw new RuntimeError(
          `'${nativeFn.name}' expects ${nativeFn.arity} argument(s), but got ${args.length}`,
          expr.position.line,
          expr.position.column
        );
      }
      return nativeFn.fn(args, this.globalEnv);
    }

    if (callee.type === 'function') {
      const fn = callee as FunctionValue;
      const fnEnv = fn.closure.createChild();

      // Bind 'this' if calling a method
      if (thisObj) {
        fnEnv.define('this', thisObj);
      }

      // Bind parameters
      for (let i = 0; i < fn.params.length; i++) {
        const param = fn.params[i];
        let value: RuntimeValue;

        if (i < args.length) {
          value = args[i];
        } else if (param.defaultValue) {
          value = this.evalExpression(param.defaultValue, fnEnv);
        } else {
          value = createNull();
        }

        fnEnv.define(param.name, value);
      }

      // Push debug frame if hook is active
      if (this.debugHook) {
        this.debugCallStack.push({
          functionName: fn.name || '<anonymous>',
          line: expr.position.line,
          column: expr.position.column,
          env: fnEnv,
        });
      }

      // Execute function body
      const result = this.executeStatements(fn.body, fnEnv);

      // Pop debug frame
      if (this.debugHook) {
        this.debugCallStack.pop();
      }

      if ((result as unknown) instanceof ReturnSignal) {
        return (result as unknown as ReturnSignal).value;
      }

      return result;
    }

    throw new RuntimeError(
      `'${stringify(callee)}' is not a function. Only functions can be called with ().`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalMemberExpression(expr: MemberExpression, env: Environment): RuntimeValue {
    const obj = this.evalExpression(expr.object, env);

    if (obj.type === 'object') {
      return obj.properties.get(expr.property) || createNull();
    }

    if (obj.type === 'instance') {
      // Check instance properties first, then class methods
      if (obj.properties.has(expr.property)) {
        return obj.properties.get(expr.property)!;
      }
      const method = this.findMethod(obj.classRef, expr.property);
      if (method) return method;
      return createNull();
    }

    if (obj.type === 'array') {
      if (expr.property === 'length') {
        return createNumber(obj.elements.length);
      }
    }

    if (obj.type === 'string') {
      if (expr.property === 'length') {
        return createNumber(obj.value.length);
      }
    }

    if (obj.type === 'class') {
      const prop = obj.properties.get(expr.property);
      if (prop) return prop;
      const method = obj.methods.get(expr.property);
      if (method) return method;
    }

    throw new RuntimeError(
      `Cannot access property '${expr.property}' on ${obj.type}`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalIndexExpression(expr: IndexExpression, env: Environment): RuntimeValue {
    const obj = this.evalExpression(expr.object, env);
    const index = this.evalExpression(expr.index, env);

    if (obj.type === 'array') {
      if (index.type !== 'number') {
        throw new RuntimeError(
          `Array index must be a number, got ${index.type}`,
          expr.position.line,
          expr.position.column
        );
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.elements.length) {
        throw new RuntimeError(
          `Array index ${idx} is out of bounds. Array has ${obj.elements.length} elements (valid indices: 0 to ${obj.elements.length - 1}).`,
          expr.position.line,
          expr.position.column
        );
      }
      return obj.elements[idx];
    }

    if (obj.type === 'string') {
      if (index.type !== 'number') {
        throw new RuntimeError(
          `String index must be a number, got ${index.type}`,
          expr.position.line,
          expr.position.column
        );
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.value.length) {
        throw new RuntimeError(
          `String index ${idx} is out of bounds. String has ${obj.value.length} characters.`,
          expr.position.line,
          expr.position.column
        );
      }
      return createString(obj.value[idx]);
    }

    if (obj.type === 'object') {
      if (index.type !== 'string') {
        throw new RuntimeError(
          `Object keys must be strings, got ${index.type}`,
          expr.position.line,
          expr.position.column
        );
      }
      return obj.properties.get(index.value) || createNull();
    }

    throw new RuntimeError(
      `Cannot index into ${obj.type}. Indexing works with arrays, strings, and objects.`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalArrowFunction(expr: ArrowFunction, env: Environment): FunctionValue {
    const body = Array.isArray(expr.body)
      ? expr.body
      : [{ type: 'ReturnStatement' as const, value: expr.body, position: expr.position }];

    return {
      type: 'function',
      name: '<arrow>',
      params: expr.params,
      body,
      closure: env,
    };
  }

  private evalFunctionExpr(expr: FunctionExpression, env: Environment): FunctionValue {
    return {
      type: 'function',
      name: '<anonymous>',
      params: expr.params,
      body: expr.body,
      closure: env,
    };
  }

  private evalRangeExpression(expr: RangeExpression, env: Environment): ArrayValue {
    const start = this.evalExpression(expr.start, env);
    const end = this.evalExpression(expr.end, env);

    if (start.type !== 'number' || end.type !== 'number') {
      throw new RuntimeError(
        `Range bounds must be numbers. Got ${start.type} and ${end.type}.`,
        expr.position.line,
        expr.position.column
      );
    }

    const elements: RuntimeValue[] = [];
    const startVal = Math.floor(start.value);
    const endVal = Math.floor(end.value);
    const limit = expr.inclusive ? endVal : endVal - 1;

    if (startVal <= limit) {
      for (let i = startVal; i <= limit; i++) {
        elements.push(createNumber(i));
        if (elements.length > 10000) {
          throw new RuntimeError(
            `Range too large! Maximum range size is 10,000 elements. Try a smaller range.`,
            expr.position.line,
            expr.position.column
          );
        }
      }
    } else {
      // Descending range
      for (let i = startVal; i >= (expr.inclusive ? endVal : endVal + 1); i--) {
        elements.push(createNumber(i));
        if (elements.length > 10000) {
          throw new RuntimeError(
            `Range too large! Maximum range size is 10,000 elements.`,
            expr.position.line,
            expr.position.column
          );
        }
      }
    }

    return createArray(elements);
  }

  private evalNewExpression(expr: NewExpression, env: Environment): RuntimeValue {
    const classVal = this.evalExpression(expr.callee, env);

    if (classVal.type !== 'class') {
      throw new RuntimeError(
        `'${stringify(classVal)}' is not a class. The 'new' keyword can only be used with classes.`,
        expr.position.line,
        expr.position.column
      );
    }

    // Create instance with default properties
    const instance: InstanceValue = {
      type: 'instance',
      className: classVal.name,
      classRef: classVal,
      properties: new Map(classVal.properties),
    };

    // Copy parent properties if inheritance
    if (classVal.superClass) {
      for (const [key, value] of classVal.superClass.properties) {
        if (!instance.properties.has(key)) {
          instance.properties.set(key, value);
        }
      }
    }

    // Call init() if it exists
    const initMethod = this.findMethod(classVal, 'init');
    if (initMethod) {
      const args = expr.args.map(arg => this.evalExpression(arg, env));
      this.callFunction(initMethod, args, instance, expr, env);
    }

    return instance;
  }

  private evalTernaryExpression(expr: { condition: Expression; consequent: Expression; alternate: Expression }, env: Environment): RuntimeValue {
    const condition = this.evalExpression(expr.condition, env);
    if (isTruthy(condition)) {
      return this.evalExpression(expr.consequent, env);
    }
    return this.evalExpression(expr.alternate, env);
  }

  // ============ Helper Methods ============

  private findMethod(classVal: ClassValue, name: string): FunctionValue | null {
    if (classVal.methods.has(name)) {
      return classVal.methods.get(name)!;
    }
    if (classVal.superClass) {
      return this.findMethod(classVal.superClass, name);
    }
    return null;
  }

  private tryBuiltinMethod(
    obj: RuntimeValue,
    methodName: string,
    expr: CallExpression,
    env: Environment
  ): RuntimeValue | undefined {
    const args = expr.args.map(arg => this.evalExpression(arg, env));

    // Array methods
    if (obj.type === 'array') {
      switch (methodName) {
        case 'push':
          obj.elements.push(...args);
          return createNumber(obj.elements.length);
        case 'pop':
          return obj.elements.pop() || createNull();
        case 'shift':
          return obj.elements.shift() || createNull();
        case 'unshift':
          obj.elements.unshift(...args);
          return createNumber(obj.elements.length);
        case 'length':
          return createNumber(obj.elements.length);
        case 'map': {
          if (args.length === 0 || args[0].type !== 'function') {
            throw new RuntimeError('map() requires a function argument', expr.position.line);
          }
          const mapFn = args[0] as FunctionValue;
          const mapped = obj.elements.map((el, idx) => {
            return this.callFunction(mapFn, [el, createNumber(idx)], null, expr, env);
          });
          return createArray(mapped);
        }
        case 'filter': {
          if (args.length === 0 || args[0].type !== 'function') {
            throw new RuntimeError('filter() requires a function argument', expr.position.line);
          }
          const filterFn = args[0] as FunctionValue;
          const filtered = obj.elements.filter((el, idx) => {
            const result = this.callFunction(filterFn, [el, createNumber(idx)], null, expr, env);
            return isTruthy(result);
          });
          return createArray(filtered);
        }
        case 'reduce': {
          if (args.length === 0 || args[0].type !== 'function') {
            throw new RuntimeError('reduce() requires a function argument', expr.position.line);
          }
          const reduceFn = args[0] as FunctionValue;
          let acc = args.length > 1 ? args[1] : obj.elements[0] || createNull();
          const startIdx = args.length > 1 ? 0 : 1;
          for (let i = startIdx; i < obj.elements.length; i++) {
            acc = this.callFunction(reduceFn, [acc, obj.elements[i], createNumber(i)], null, expr, env);
          }
          return acc;
        }
        case 'sort': {
          const sorted = [...obj.elements].sort((a, b) => {
            if (a.type === 'number' && b.type === 'number') return a.value - b.value;
            return stringify(a).localeCompare(stringify(b));
          });
          return createArray(sorted);
        }
        case 'reverse':
          return createArray([...obj.elements].reverse());
        case 'slice': {
          const start = args[0]?.type === 'number' ? args[0].value : 0;
          const end = args[1]?.type === 'number' ? args[1].value : obj.elements.length;
          return createArray(obj.elements.slice(start, end));
        }
        case 'indexOf': {
          if (args.length === 0) return createNumber(-1);
          const idx = obj.elements.findIndex(el => valueEquals(el, args[0]));
          return createNumber(idx);
        }
        case 'includes': {
          if (args.length === 0) return createBoolean(false);
          const found = obj.elements.some(el => valueEquals(el, args[0]));
          return createBoolean(found);
        }
        case 'join': {
          const sep = args[0]?.type === 'string' ? args[0].value : ',';
          return createString(obj.elements.map(stringify).join(sep));
        }
        case 'forEach': {
          if (args.length === 0 || args[0].type !== 'function') {
            throw new RuntimeError('forEach() requires a function argument', expr.position.line);
          }
          const forEachFn = args[0] as FunctionValue;
          obj.elements.forEach((el, idx) => {
            this.callFunction(forEachFn, [el, createNumber(idx)], null, expr, env);
          });
          return createNull();
        }
      }
    }

    // String methods
    if (obj.type === 'string') {
      switch (methodName) {
        case 'split': {
          const sep = args[0]?.type === 'string' ? args[0].value : '';
          return createArray(obj.value.split(sep).map(createString));
        }
        case 'trim':
          return createString(obj.value.trim());
        case 'upper':
          return createString(obj.value.toUpperCase());
        case 'lower':
          return createString(obj.value.toLowerCase());
        case 'contains': {
          if (args.length === 0 || args[0].type !== 'string') return createBoolean(false);
          return createBoolean(obj.value.includes(args[0].value));
        }
        case 'replace': {
          if (args.length < 2) throw new RuntimeError('replace() needs 2 arguments: pattern and replacement', expr.position.line);
          const pattern = stringify(args[0]);
          const replacement = stringify(args[1]);
          return createString(obj.value.replace(pattern, replacement));
        }
        case 'startsWith': {
          if (args.length === 0 || args[0].type !== 'string') return createBoolean(false);
          return createBoolean(obj.value.startsWith(args[0].value));
        }
        case 'endsWith': {
          if (args.length === 0 || args[0].type !== 'string') return createBoolean(false);
          return createBoolean(obj.value.endsWith(args[0].value));
        }
        case 'charAt': {
          if (args.length === 0 || args[0].type !== 'number') return createString('');
          const idx = Math.floor(args[0].value);
          return createString(obj.value[idx] || '');
        }
        case 'indexOf': {
          if (args.length === 0 || args[0].type !== 'string') return createNumber(-1);
          return createNumber(obj.value.indexOf(args[0].value));
        }
        case 'slice': {
          const start = args[0]?.type === 'number' ? args[0].value : 0;
          const end = args[1]?.type === 'number' ? args[1].value : obj.value.length;
          return createString(obj.value.slice(start, end));
        }
        case 'repeat': {
          if (args.length === 0 || args[0].type !== 'number') return createString(obj.value);
          return createString(obj.value.repeat(Math.floor(args[0].value)));
        }
      }
    }

    // Object methods
    if (obj.type === 'object') {
      switch (methodName) {
        case 'keys':
          return createArray(Array.from(obj.properties.keys()).map(createString));
        case 'values':
          return createArray(Array.from(obj.properties.values()));
        case 'has': {
          if (args.length === 0 || args[0].type !== 'string') return createBoolean(false);
          return createBoolean(obj.properties.has(args[0].value));
        }
      }
    }

    return undefined;
  }

  private evalTryCatchStatement(stmt: TryCatchStatement, env: Environment): RuntimeValue {
    try {
      const tryEnv = env.createChild();
      return this.executeStatements(stmt.tryBody, tryEnv);
    } catch (error) {
      if (error instanceof StepLimitExceeded) {
        // A runaway program must not be catchable: a handler inside the
        // offending loop would swallow the limit and spin forever. Matches the
        // VM's unwindToHandler.
        throw error;
      }
      const catchEnv = env.createChild();
      // Create an error object with .message property
      if (error instanceof RuntimeError) {
        const errProps = new Map<string, RuntimeValue>();
        errProps.set('message', createString(error.message));
        errProps.set('line', error.line ? createNumber(error.line) : createNull());
        catchEnv.define(stmt.catchVariable, { type: 'object', properties: errProps });
      } else if (error instanceof Error) {
        const errProps = new Map<string, RuntimeValue>();
        errProps.set('message', createString(error.message));
        catchEnv.define(stmt.catchVariable, { type: 'object', properties: errProps });
      } else {
        const errProps = new Map<string, RuntimeValue>();
        errProps.set('message', createString(String(error)));
        catchEnv.define(stmt.catchVariable, { type: 'object', properties: errProps });
      }
      return this.executeStatements(stmt.catchBody, catchEnv);
    }
  }

  private evalThrowStatement(stmt: ThrowStatement, env: Environment): RuntimeValue {
    const value = this.evalExpression(stmt.value, env);
    let message: string;
    if (value.type === 'string') {
      message = value.value;
    } else if (value.type === 'object' && value.properties.has('message')) {
      const msgVal = value.properties.get('message')!;
      message = msgVal.type === 'string' ? msgVal.value : stringify(msgVal);
    } else {
      message = stringify(value);
    }
    throw new RuntimeError(message, stmt.position.line, stmt.position.column);
  }

  private evalInterpolatedString(expr: InterpolatedString, env: Environment): RuntimeValue {
    let result = '';
    for (const part of expr.parts) {
      if (part.kind === 'literal') {
        result += part.value;
      } else {
        const value = this.evalExpression(part.expression, env);
        result += stringify(value);
      }
    }
    return createString(result);
  }

  private evalEnumDeclaration(stmt: EnumDeclaration, env: Environment): RuntimeValue {
    const properties = new Map<string, RuntimeValue>();
    for (const variant of stmt.variants) {
      properties.set(variant, createString(variant));
    }
    const enumObj = createObject(properties);
    env.define(stmt.name, enumObj, true);
    return enumObj;
  }

  private evalPipeExpression(expr: PipeExpression, env: Environment): RuntimeValue {
    const left = this.evalExpression(expr.left, env);

    // The right side should be a function (identifier, member expression, or call expression)
    // If right is a CallExpression, prepend left as the first argument
    if (expr.right.type === 'CallExpression') {
      const callee = this.evalExpression(expr.right.callee, env);
      const args = [left, ...expr.right.args.map(arg => this.evalExpression(arg, env))];
      return this.callFunction(callee, args, null, expr.right, env);
    }

    // If right is an ArrowFunction or FunctionExpression, call it with left as the argument
    if (expr.right.type === 'ArrowFunction' || expr.right.type === 'FunctionExpression') {
      const fn = this.evalExpression(expr.right, env);
      const syntheticCall = {
        type: 'CallExpression' as const,
        callee: expr.right,
        args: [],
        position: expr.position,
      };
      return this.callFunction(fn, [left], null, syntheticCall, env);
    }

    // If right is an identifier or member expression, call it with left as the only argument
    const callee = this.evalExpression(expr.right, env);
    if (callee.type === 'function' || callee.type === 'native-function') {
      // Create a synthetic call expression for error reporting
      const syntheticCall = {
        type: 'CallExpression' as const,
        callee: expr.right,
        args: [],
        position: expr.position,
      };
      return this.callFunction(callee, [left], null, syntheticCall, env);
    }

    throw new RuntimeError(
      `Right side of pipe operator (|>) must be a function or function call`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalPipeMethodExpression(expr: PipeMethodExpression, env: Environment): RuntimeValue {
    const obj = this.evalExpression(expr.left, env);
    const args = expr.args.map(arg => this.evalExpression(arg, env));

    // Create a synthetic CallExpression for tryBuiltinMethod
    const syntheticCall: CallExpression = {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: expr.left,
        property: expr.method,
        position: expr.position,
      } as Expression,
      args: expr.args,
      position: expr.position,
    };

    // Try built-in methods (array.sort, string.trim, etc.)
    const builtinResult = this.tryBuiltinMethod(obj, expr.method, syntheticCall, env);
    if (builtinResult !== undefined) {
      return builtinResult;
    }

    // Try instance methods
    if (obj.type === 'instance') {
      const method = this.findMethod(obj.classRef, expr.method);
      if (method) {
        return this.callFunction(method, args, obj, syntheticCall, env);
      }
    }

    // Try object function properties
    if (obj.type === 'object') {
      const prop = obj.properties.get(expr.method);
      if (prop && (prop.type === 'function' || prop.type === 'native-function')) {
        return this.callFunction(prop, args, obj, syntheticCall, env);
      }
    }

    throw new RuntimeError(
      `Cannot call method '${expr.method}' on ${obj.type}`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalOptionalMemberExpression(expr: OptionalMemberExpression, env: Environment): RuntimeValue {
    const obj = this.evalExpression(expr.object, env);

    // If object is null, return null without accessing property
    if (obj.type === 'null') {
      return createNull();
    }

    if (obj.type === 'object') {
      return obj.properties.get(expr.property) || createNull();
    }

    if (obj.type === 'instance') {
      if (obj.properties.has(expr.property)) {
        return obj.properties.get(expr.property)!;
      }
      const method = this.findMethod(obj.classRef, expr.property);
      if (method) return method;
      return createNull();
    }

    if (obj.type === 'array') {
      if (expr.property === 'length') {
        return createNumber(obj.elements.length);
      }
    }

    if (obj.type === 'string') {
      if (expr.property === 'length') {
        return createNumber(obj.value.length);
      }
    }

    throw new RuntimeError(
      `Cannot access property '${expr.property}' on ${obj.type}`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalOptionalIndexExpression(expr: OptionalIndexExpression, env: Environment): RuntimeValue {
    const obj = this.evalExpression(expr.object, env);

    // If object is null, return null without accessing index
    if (obj.type === 'null') {
      return createNull();
    }

    const index = this.evalExpression(expr.index, env);

    if (obj.type === 'array') {
      if (index.type !== 'number') {
        throw new RuntimeError(
          `Array index must be a number, got ${index.type}`,
          expr.position.line,
          expr.position.column
        );
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.elements.length) {
        return createNull();
      }
      return obj.elements[idx];
    }

    if (obj.type === 'string') {
      if (index.type !== 'number') {
        throw new RuntimeError(
          `String index must be a number, got ${index.type}`,
          expr.position.line,
          expr.position.column
        );
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.value.length) {
        return createNull();
      }
      return createString(obj.value[idx]);
    }

    if (obj.type === 'object') {
      if (index.type !== 'string') {
        throw new RuntimeError(
          `Object keys must be strings, got ${index.type}`,
          expr.position.line,
          expr.position.column
        );
      }
      return obj.properties.get(index.value) || createNull();
    }

    throw new RuntimeError(
      `Cannot index into ${obj.type}`,
      expr.position.line,
      expr.position.column
    );
  }

  private evalNullishCoalesceExpression(expr: NullishCoalesceExpression, env: Environment): RuntimeValue {
    const left = this.evalExpression(expr.left, env);
    if (left.type === 'null') {
      return this.evalExpression(expr.right, env);
    }
    return left;
  }

  private checkStepLimit(): void {
    this.steps++;
    if (this.steps > this.maxSteps) {
      // StepLimitExceeded, not a plain RuntimeError: evalTryCatchStatement
      // rethrows it rather than catching it. A plain RuntimeError meant a
      // `catch` inside the runaway loop swallowed the limit and the loop then
      // spun forever - the limit could be defeated by the very code it exists
      // to stop. The VM already behaved this way; the interpreter now matches.
      throw new StepLimitExceeded(
        `Execution limit exceeded (${this.maxSteps} steps). Your program might have an infinite loop. Check your while/for conditions.`
      );
    }
  }
}
