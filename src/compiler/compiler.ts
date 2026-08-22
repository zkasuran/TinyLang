/**
 * TinyLang Bytecode Compiler
 *
 * Walks the AST and emits bytecode instructions into a Chunk.
 * Handles all statement and expression types, variable scoping,
 * closures, classes, and control flow.
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
  MatchStatement,
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
  Parameter,
} from '../types/ast';
import {
  RuntimeValue,
  createNumber,
  createString,
  createBoolean,
  createNull,
} from '../types/values';
import { OpCode } from './opcodes';
import { Chunk } from './chunk';

/**
 * Represents a local variable in compile-time scope
 */
interface Local {
  name: string;
  depth: number;
  isCaptured: boolean;
}

/**
 * Represents an upvalue (captured variable from enclosing scope)
 */
interface Upvalue {
  index: number;
  isLocal: boolean;
}

/**
 * Compiler scope for tracking variables
 */
interface CompilerScope {
  locals: Local[];
  upvalues: Upvalue[];
  scopeDepth: number;
  chunk: Chunk;
  functionName: string;
  enclosing: CompilerScope | null;
}

/**
 * Represents a compiled function for use in the constant pool
 */
export interface CompiledFunction {
  type: 'compiled-function';
  name: string;
  arity: number;
  chunk: Chunk;
  upvalueCount: number;
  defaultParams: number;
}

export class CompilerError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
    this.name = 'CompilerError';
  }
}

export class Compiler {
  private current: CompilerScope;

  constructor() {
    this.current = this.createScope('<script>', null);
  }

  private createScope(name: string, enclosing: CompilerScope | null): CompilerScope {
    return {
      locals: [],
      upvalues: [],
      scopeDepth: 0,
      chunk: new Chunk(name),
      functionName: name,
      enclosing,
    };
  }

  /**
   * Compile a program AST into a bytecode chunk
   */
  compile(program: Program): Chunk {
    this.current = this.createScope('<script>', null);

    for (const stmt of program.body) {
      this.compileStatement(stmt);
    }

    this.emit(OpCode.HALT, 1);
    return this.current.chunk;
  }

  // ============ Emit Helpers ============

  private emit(byte: number, line: number): void {
    this.current.chunk.write(byte, line);
  }

  private emit16(value: number, line: number): void {
    this.current.chunk.write16(value, line);
  }

  private emitConstant(value: RuntimeValue, line: number): void {
    const idx = this.current.chunk.addConstant(value);
    this.emit(OpCode.CONST, line);
    this.emit16(idx, line);
  }

  private emitJump(instruction: OpCode, line: number): number {
    this.emit(instruction, line);
    // Placeholder for the jump offset (16-bit)
    this.emit16(0xFFFF, line);
    return this.current.chunk.currentOffset - 2;
  }

  private patchJump(offset: number): void {
    const jump = this.current.chunk.currentOffset;
    this.current.chunk.patch16(offset, jump);
  }

  private emitLoop(loopStart: number, line: number): void {
    this.emit(OpCode.LOOP, line);
    this.emit16(loopStart, line);
  }

  // ============ Scope Management ============

  private beginScope(): void {
    this.current.scopeDepth++;
  }

  private endScope(line: number): void {
    this.current.scopeDepth--;
    // Pop locals that are going out of scope
    while (
      this.current.locals.length > 0 &&
      this.current.locals[this.current.locals.length - 1].depth > this.current.scopeDepth
    ) {
      const local = this.current.locals.pop()!;
      if (local.isCaptured) {
        // Upvalues need special handling in a full implementation
        this.emit(OpCode.POP, line);
      } else {
        this.emit(OpCode.POP, line);
      }
    }
  }

  private addLocal(name: string): void {
    this.current.locals.push({
      name,
      depth: this.current.scopeDepth,
      isCaptured: false,
    });
  }

  private resolveLocal(scope: CompilerScope, name: string): number {
    for (let i = scope.locals.length - 1; i >= 0; i--) {
      if (scope.locals[i].name === name) {
        return i;
      }
    }
    return -1;
  }

  private resolveUpvalue(scope: CompilerScope, name: string): number {
    if (!scope.enclosing) return -1;

    const localIdx = this.resolveLocal(scope.enclosing, name);
    if (localIdx !== -1) {
      scope.enclosing.locals[localIdx].isCaptured = true;
      return this.addUpvalue(scope, localIdx, true);
    }

    const upvalueIdx = this.resolveUpvalue(scope.enclosing, name);
    if (upvalueIdx !== -1) {
      return this.addUpvalue(scope, upvalueIdx, false);
    }

    return -1;
  }

  private addUpvalue(scope: CompilerScope, index: number, isLocal: boolean): number {
    // Check if already captured
    for (let i = 0; i < scope.upvalues.length; i++) {
      const uv = scope.upvalues[i];
      if (uv.index === index && uv.isLocal === isLocal) {
        return i;
      }
    }
    scope.upvalues.push({ index, isLocal });
    return scope.upvalues.length - 1;
  }

  // ============ Statement Compilation ============

  private compileStatement(stmt: Statement): void {
    switch (stmt.type) {
      case 'VariableDeclaration':
        this.compileVariableDeclaration(stmt);
        break;
      case 'FunctionDeclaration':
        this.compileFunctionDeclaration(stmt);
        break;
      case 'ClassDeclaration':
        this.compileClassDeclaration(stmt);
        break;
      case 'ReturnStatement':
        this.compileReturnStatement(stmt);
        break;
      case 'IfStatement':
        this.compileIfStatement(stmt);
        break;
      case 'WhileStatement':
        this.compileWhileStatement(stmt);
        break;
      case 'ForStatement':
        this.compileForStatement(stmt);
        break;
      case 'BreakStatement':
        // Break is handled via jump - simplified to JMP that gets patched
        this.emit(OpCode.JMP, stmt.position.line);
        this.emit16(0xFFFF, stmt.position.line);
        break;
      case 'ContinueStatement':
        // Continue is handled via LOOP back
        this.emit(OpCode.JMP, stmt.position.line);
        this.emit16(0xFFFF, stmt.position.line);
        break;
      case 'ExpressionStatement':
        this.compileExpression(stmt.expression);
        this.emit(OpCode.POP, stmt.position.line);
        break;
      case 'PrintStatement':
        this.compilePrintStatement(stmt);
        break;
      case 'ImportStatement':
        // Import is a no-op at bytecode level for now
        break;
      case 'MatchStatement':
        this.compileMatchStatement(stmt);
        break;
    }
  }

  private compileVariableDeclaration(stmt: VariableDeclaration): void {
    const line = stmt.position.line;
    this.compileExpression(stmt.value);

    if (this.current.scopeDepth > 0) {
      // Local variable - value stays on stack as the local slot
      this.addLocal(stmt.name);
    } else {
      // Global variable - STORE_GLOBAL pops the value
      const nameIdx = this.current.chunk.addConstant(createString(stmt.name));
      this.emit(OpCode.STORE_GLOBAL, line);
      this.emit16(nameIdx, line);
    }
  }

  private compileFunctionDeclaration(stmt: FunctionDeclaration): void {
    const line = stmt.position.line;

    // Compile the function body into a new chunk
    const fn = this.compileFunction(stmt.name, stmt.params, stmt.body, line);
    const fnIdx = this.current.chunk.addConstant(fn);

    // Emit closure instruction
    this.emit(OpCode.CLOSURE, line);
    this.emit16(fnIdx, line);

    // Upvalue info is embedded in the compiled function object
    // and will be read by the VM when creating the closure

    if (this.current.scopeDepth > 0) {
      this.addLocal(stmt.name);
    } else {
      const nameIdx = this.current.chunk.addConstant(createString(stmt.name));
      this.emit(OpCode.STORE_GLOBAL, line);
      this.emit16(nameIdx, line);
    }
  }

  private compileFunction(
    name: string,
    params: Parameter[],
    body: Statement[],
    line: number
  ): CompiledFunction {
    const enclosing = this.current;
    this.current = this.createScope(name, enclosing);
    this.beginScope();

    // Add params as locals
    let defaultParams = 0;
    for (const param of params) {
      this.addLocal(param.name);
      if (param.defaultValue) {
        defaultParams++;
      }
    }

    // Compile body
    for (const stmt of body) {
      this.compileStatement(stmt);
    }

    // Implicit return null
    this.emitConstant(createNull(), line);
    this.emit(OpCode.RETURN, line);

    const fn: CompiledFunction = {
      type: 'compiled-function',
      name,
      arity: params.length,
      chunk: this.current.chunk,
      upvalueCount: this.current.upvalues.length,
      defaultParams,
    };

    // Store upvalue info in the compiled function for the VM to use
    (fn as CompiledFunction & { upvalues: Upvalue[] }).upvalues = [...this.current.upvalues];

    this.current = enclosing;
    return fn;
  }

  private compileClassDeclaration(stmt: ClassDeclaration): void {
    const line = stmt.position.line;
    const nameIdx = this.current.chunk.addConstant(createString(stmt.name));

    this.emit(OpCode.CLASS, line);
    this.emit16(nameIdx, line);

    if (this.current.scopeDepth > 0) {
      this.addLocal(stmt.name);
    } else {
      this.emit(OpCode.STORE_GLOBAL, line);
      this.emit16(nameIdx, line);
    }

    // Handle inheritance
    if (stmt.superClass) {
      this.compileLoadVariable(stmt.superClass, line);
      this.compileLoadVariable(stmt.name, line);
      this.emit(OpCode.INHERIT, line);
    }

    // Compile methods
    for (const method of stmt.methods) {
      const fn = this.compileFunction(method.name, method.params, method.body, method.position.line);
      const fnIdx = this.current.chunk.addConstant(fn);
      const methodNameIdx = this.current.chunk.addConstant(createString(method.name));

      this.compileLoadVariable(stmt.name, line);
      this.emit(OpCode.CLOSURE, method.position.line);
      this.emit16(fnIdx, method.position.line);
      this.emit(OpCode.METHOD, method.position.line);
      this.emit16(methodNameIdx, method.position.line);
      this.emit(OpCode.POP, line); // Pop class after METHOD (METHOD pushes it back)
    }

    // Compile class properties (instance defaults)
    for (const prop of stmt.properties) {
      const propNameIdx = this.current.chunk.addConstant(createString(`__prop_${prop.name}`));
      this.compileLoadVariable(stmt.name, line);
      this.compileExpression(prop.value);
      this.emit(OpCode.SET_PROP, line);
      this.emit16(propNameIdx, line);
      this.emit(OpCode.POP, line); // Pop result of SET_PROP
    }
  }

  private compileReturnStatement(stmt: ReturnStatement): void {
    const line = stmt.position.line;
    if (stmt.value) {
      this.compileExpression(stmt.value);
    } else {
      this.emitConstant(createNull(), line);
    }
    this.emit(OpCode.RETURN, line);
  }

  private compileIfStatement(stmt: IfStatement): void {
    const line = stmt.position.line;

    this.compileExpression(stmt.condition);
    const jumpToElse = this.emitJump(OpCode.JMP_IF_FALSE, line);
    this.emit(OpCode.POP, line); // Pop condition

    // Compile consequent
    this.beginScope();
    for (const s of stmt.consequent) {
      this.compileStatement(s);
    }
    this.endScope(line);

    const jumpOverElse = this.emitJump(OpCode.JMP, line);
    this.patchJump(jumpToElse);
    this.emit(OpCode.POP, line); // Pop condition in else branch

    // Compile alternate
    if (stmt.alternate) {
      if (Array.isArray(stmt.alternate)) {
        this.beginScope();
        for (const s of stmt.alternate) {
          this.compileStatement(s);
        }
        this.endScope(line);
      } else {
        // else if
        this.compileIfStatement(stmt.alternate);
      }
    }

    this.patchJump(jumpOverElse);
  }

  private compileWhileStatement(stmt: WhileStatement): void {
    const line = stmt.position.line;
    const loopStart = this.current.chunk.currentOffset;

    this.compileExpression(stmt.condition);
    const exitJump = this.emitJump(OpCode.JMP_IF_FALSE, line);
    this.emit(OpCode.POP, line); // Pop condition

    this.beginScope();
    for (const s of stmt.body) {
      this.compileStatement(s);
    }
    this.endScope(line);

    this.emitLoop(loopStart, line);
    this.patchJump(exitJump);
    this.emit(OpCode.POP, line); // Pop condition
  }

  private compileForStatement(stmt: ForStatement): void {
    const line = stmt.position.line;

    // Compile the iterable
    this.compileExpression(stmt.iterable);

    // Store array in a temporary local
    this.beginScope();
    this.addLocal('__iter');

    // Push index counter (0)
    this.emitConstant(createNumber(0), line);
    this.addLocal('__idx');

    const loopStart = this.current.chunk.currentOffset;

    // Check: __idx < len(__iter)
    const idxSlot = this.resolveLocal(this.current, '__idx');
    const iterSlot = this.resolveLocal(this.current, '__iter');
    this.emit(OpCode.LOAD_LOCAL, line);
    this.emit16(idxSlot, line);
    this.emit(OpCode.LOAD_LOCAL, line);
    this.emit16(iterSlot, line);
    // Get length via GET_PROP
    const lenIdx = this.current.chunk.addConstant(createString('length'));
    this.emit(OpCode.GET_PROP, line);
    this.emit16(lenIdx, line);
    this.emit(OpCode.LT, line);

    const exitJump = this.emitJump(OpCode.JMP_IF_FALSE, line);
    this.emit(OpCode.POP, line);

    // Get current element: __iter[__idx]
    this.emit(OpCode.LOAD_LOCAL, line);
    this.emit16(iterSlot, line);
    this.emit(OpCode.LOAD_LOCAL, line);
    this.emit16(idxSlot, line);
    this.emit(OpCode.INDEX, line);

    // Store as the loop variable
    this.addLocal(stmt.variable);

    // Compile body
    for (const s of stmt.body) {
      this.compileStatement(s);
    }

    // Pop loop variable
    this.emit(OpCode.POP, line);
    this.current.locals.pop();

    // Increment __idx
    this.emit(OpCode.LOAD_LOCAL, line);
    this.emit16(idxSlot, line);
    this.emitConstant(createNumber(1), line);
    this.emit(OpCode.ADD, line);
    this.emit(OpCode.STORE_LOCAL, line);
    this.emit16(idxSlot, line);

    this.emitLoop(loopStart, line);
    this.patchJump(exitJump);
    this.emit(OpCode.POP, line);

    this.endScope(line);
  }

  private compilePrintStatement(stmt: PrintStatement): void {
    const line = stmt.position.line;
    for (const expr of stmt.expressions) {
      this.compileExpression(expr);
    }
    this.emit(OpCode.PRINT, line);
    this.emit16(stmt.expressions.length, line);
  }

  private compileMatchStatement(stmt: MatchStatement): void {
    const line = stmt.position.line;

    // Compile subject
    this.compileExpression(stmt.subject);

    const endJumps: number[] = [];

    for (const matchCase of stmt.cases) {
      // Duplicate subject for comparison
      this.emit(OpCode.DUP, line);
      this.compileExpression(matchCase.pattern);
      this.emit(OpCode.EQ, line);

      const skipJump = this.emitJump(OpCode.JMP_IF_FALSE, line);
      this.emit(OpCode.POP, line); // Pop comparison result
      this.emit(OpCode.POP, line); // Pop duplicated subject

      // Compile case body
      this.beginScope();
      for (const s of matchCase.body) {
        this.compileStatement(s);
      }
      this.endScope(line);

      endJumps.push(this.emitJump(OpCode.JMP, line));
      this.patchJump(skipJump);
      this.emit(OpCode.POP, line); // Pop comparison result
    }

    // Default case
    if (stmt.defaultCase) {
      this.emit(OpCode.POP, line); // Pop subject
      this.beginScope();
      for (const s of stmt.defaultCase) {
        this.compileStatement(s);
      }
      this.endScope(line);
    } else {
      this.emit(OpCode.POP, line); // Pop subject
    }

    // Patch all end jumps
    for (const jump of endJumps) {
      this.patchJump(jump);
    }
  }

  // ============ Expression Compilation ============

  private compileExpression(expr: Expression): void {
    switch (expr.type) {
      case 'NumberLiteral':
        this.emitConstant(createNumber(expr.value), expr.position.line);
        break;
      case 'StringLiteral':
        this.emitConstant(createString(expr.value), expr.position.line);
        break;
      case 'BooleanLiteral':
        this.emitConstant(createBoolean(expr.value), expr.position.line);
        break;
      case 'NullLiteral':
        this.emitConstant(createNull(), expr.position.line);
        break;
      case 'ArrayLiteral':
        this.compileArrayLiteral(expr.elements, expr.position.line);
        break;
      case 'ObjectLiteral':
        this.compileObjectLiteral(expr.properties, expr.position.line);
        break;
      case 'Identifier':
        this.compileLoadVariable(expr.name, expr.position.line);
        break;
      case 'BinaryExpression':
        this.compileBinaryExpression(expr);
        break;
      case 'UnaryExpression':
        this.compileUnaryExpression(expr);
        break;
      case 'LogicalExpression':
        this.compileLogicalExpression(expr);
        break;
      case 'AssignmentExpression':
        this.compileAssignmentExpression(expr);
        break;
      case 'CallExpression':
        this.compileCallExpression(expr);
        break;
      case 'MemberExpression':
        this.compileMemberExpression(expr);
        break;
      case 'IndexExpression':
        this.compileIndexExpression(expr);
        break;
      case 'FunctionExpression':
        this.compileFunctionExpression(expr);
        break;
      case 'ArrowFunction':
        this.compileArrowFunction(expr);
        break;
      case 'NewExpression':
        this.compileNewExpression(expr);
        break;
      case 'ThisExpression':
        this.emit(OpCode.GET_THIS, expr.position.line);
        break;
      case 'SpreadExpression':
        // Spread is handled at call site / array literal
        this.compileExpression(expr.argument);
        break;
      case 'TernaryExpression':
        this.compileTernaryExpression(expr);
        break;
      case 'RangeExpression':
        this.compileRangeExpression(expr);
        break;
    }
  }

  private compileLoadVariable(name: string, line: number): void {
    const localIdx = this.resolveLocal(this.current, name);
    if (localIdx !== -1) {
      this.emit(OpCode.LOAD_LOCAL, line);
      this.emit16(localIdx, line);
    } else {
      const upvalueIdx = this.resolveUpvalue(this.current, name);
      if (upvalueIdx !== -1) {
        this.emit(OpCode.LOAD_UPVALUE, line);
        this.emit16(upvalueIdx, line);
      } else {
        const nameIdx = this.current.chunk.addConstant(createString(name));
        this.emit(OpCode.LOAD_GLOBAL, line);
        this.emit16(nameIdx, line);
      }
    }
  }

  private compileStoreVariable(name: string, line: number): void {
    const localIdx = this.resolveLocal(this.current, name);
    if (localIdx !== -1) {
      this.emit(OpCode.STORE_LOCAL, line);
      this.emit16(localIdx, line);
    } else {
      const upvalueIdx = this.resolveUpvalue(this.current, name);
      if (upvalueIdx !== -1) {
        this.emit(OpCode.STORE_UPVALUE, line);
        this.emit16(upvalueIdx, line);
      } else {
        const nameIdx = this.current.chunk.addConstant(createString(name));
        this.emit(OpCode.STORE_GLOBAL, line);
        this.emit16(nameIdx, line);
      }
    }
  }

  private compileArrayLiteral(elements: Expression[], line: number): void {
    for (const el of elements) {
      this.compileExpression(el);
    }
    this.emit(OpCode.ARRAY, line);
    this.emit16(elements.length, line);
  }

  private compileObjectLiteral(
    properties: { key: string; value: Expression }[],
    line: number
  ): void {
    for (const prop of properties) {
      this.emitConstant(createString(prop.key), line);
      this.compileExpression(prop.value);
    }
    this.emit(OpCode.OBJECT, line);
    this.emit16(properties.length, line);
  }

  private compileBinaryExpression(expr: BinaryExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.left);
    this.compileExpression(expr.right);

    switch (expr.operator) {
      case '+': this.emit(OpCode.ADD, line); break;
      case '-': this.emit(OpCode.SUB, line); break;
      case '*': this.emit(OpCode.MUL, line); break;
      case '/': this.emit(OpCode.DIV, line); break;
      case '%': this.emit(OpCode.MOD, line); break;
      case '**': this.emit(OpCode.POW, line); break;
      case '==': this.emit(OpCode.EQ, line); break;
      case '!=': this.emit(OpCode.NEQ, line); break;
      case '<': this.emit(OpCode.LT, line); break;
      case '<=': this.emit(OpCode.LTE, line); break;
      case '>': this.emit(OpCode.GT, line); break;
      case '>=': this.emit(OpCode.GTE, line); break;
      default:
        throw new CompilerError(`Unknown binary operator: ${expr.operator}`, line);
    }
  }

  private compileUnaryExpression(expr: UnaryExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.operand);

    switch (expr.operator) {
      case '-': this.emit(OpCode.NEGATE, line); break;
      case 'not': this.emit(OpCode.NOT, line); break;
      default:
        throw new CompilerError(`Unknown unary operator: ${expr.operator}`, line);
    }
  }

  private compileLogicalExpression(expr: LogicalExpression): void {
    const line = expr.position.line;

    if (expr.operator === 'and') {
      this.compileExpression(expr.left);
      const jumpToEnd = this.emitJump(OpCode.JMP_IF_FALSE, line);
      this.emit(OpCode.POP, line);
      this.compileExpression(expr.right);
      this.patchJump(jumpToEnd);
    } else {
      // or
      this.compileExpression(expr.left);
      const jumpToEnd = this.emitJump(OpCode.JMP_IF_TRUE, line);
      this.emit(OpCode.POP, line);
      this.compileExpression(expr.right);
      this.patchJump(jumpToEnd);
    }
  }

  private compileAssignmentExpression(expr: AssignmentExpression): void {
    const line = expr.position.line;

    if (expr.target.type === 'Identifier') {
      if (expr.operator === '=') {
        this.compileExpression(expr.value);
      } else {
        // Compound assignment: +=, -=, etc.
        this.compileLoadVariable(expr.target.name, line);
        this.compileExpression(expr.value);
        switch (expr.operator) {
          case '+=': this.emit(OpCode.ADD, line); break;
          case '-=': this.emit(OpCode.SUB, line); break;
          case '*=': this.emit(OpCode.MUL, line); break;
          case '/=': this.emit(OpCode.DIV, line); break;
          default:
            throw new CompilerError(`Unknown assignment operator: ${expr.operator}`, line);
        }
      }
      this.emit(OpCode.DUP, line); // Keep value on stack as expression result
      this.compileStoreVariable(expr.target.name, line);
    } else if (expr.target.type === 'IndexExpression') {
      this.compileExpression(expr.target.object);
      this.compileExpression(expr.target.index);
      if (expr.operator === '=') {
        this.compileExpression(expr.value);
      } else {
        // Compound: load current value, compute, store
        this.emit(OpCode.DUP, line); // dup index
        // Need object, index already on stack
        this.compileExpression(expr.target.object);
        this.compileExpression(expr.target.index);
        this.emit(OpCode.INDEX, line);
        this.compileExpression(expr.value);
        switch (expr.operator) {
          case '+=': this.emit(OpCode.ADD, line); break;
          case '-=': this.emit(OpCode.SUB, line); break;
          case '*=': this.emit(OpCode.MUL, line); break;
          case '/=': this.emit(OpCode.DIV, line); break;
          default:
            throw new CompilerError(`Unknown assignment operator: ${expr.operator}`, line);
        }
      }
      this.emit(OpCode.SET_INDEX, line);
    } else if (expr.target.type === 'MemberExpression') {
      this.compileExpression(expr.target.object);
      const propIdx = this.current.chunk.addConstant(createString(expr.target.property));
      if (expr.operator === '=') {
        this.compileExpression(expr.value);
      } else {
        this.emit(OpCode.DUP, line);
        this.emit(OpCode.GET_PROP, line);
        this.emit16(propIdx, line);
        this.compileExpression(expr.value);
        switch (expr.operator) {
          case '+=': this.emit(OpCode.ADD, line); break;
          case '-=': this.emit(OpCode.SUB, line); break;
          case '*=': this.emit(OpCode.MUL, line); break;
          case '/=': this.emit(OpCode.DIV, line); break;
          default:
            throw new CompilerError(`Unknown assignment operator: ${expr.operator}`, line);
        }
      }
      this.emit(OpCode.SET_PROP, line);
      this.emit16(propIdx, line);
    }
  }

  private compileCallExpression(expr: CallExpression): void {
    const line = expr.position.line;

    // Compile the callee
    this.compileExpression(expr.callee);

    // Compile arguments
    for (const arg of expr.args) {
      this.compileExpression(arg);
    }

    this.emit(OpCode.CALL, line);
    this.emit16(expr.args.length, line);
  }

  private compileMemberExpression(expr: MemberExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.object);
    const propIdx = this.current.chunk.addConstant(createString(expr.property));
    this.emit(OpCode.GET_PROP, line);
    this.emit16(propIdx, line);
  }

  private compileIndexExpression(expr: IndexExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.object);
    this.compileExpression(expr.index);
    this.emit(OpCode.INDEX, line);
  }

  private compileFunctionExpression(expr: FunctionExpression): void {
    const line = expr.position.line;
    const fn = this.compileFunction('<anonymous>', expr.params, expr.body, line);
    const fnIdx = this.current.chunk.addConstant(fn);
    this.emit(OpCode.CLOSURE, line);
    this.emit16(fnIdx, line);
  }

  private compileArrowFunction(expr: ArrowFunction): void {
    const line = expr.position.line;
    let body: Statement[];
    if (Array.isArray(expr.body)) {
      body = expr.body;
    } else {
      // Expression body - wrap in return
      body = [{
        type: 'ReturnStatement' as const,
        value: expr.body,
        position: expr.position,
      }];
    }
    const fn = this.compileFunction('<arrow>', expr.params, body, line);
    const fnIdx = this.current.chunk.addConstant(fn);
    this.emit(OpCode.CLOSURE, line);
    this.emit16(fnIdx, line);
  }

  private compileNewExpression(expr: NewExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.callee);
    for (const arg of expr.args) {
      this.compileExpression(arg);
    }
    this.emit(OpCode.NEW_INSTANCE, line);
    this.emit16(expr.args.length, line);
  }

  private compileTernaryExpression(expr: { condition: Expression; consequent: Expression; alternate: Expression; position: { line: number } }): void {
    const line = expr.position.line;
    this.compileExpression(expr.condition);
    const jumpToElse = this.emitJump(OpCode.JMP_IF_FALSE, line);
    this.emit(OpCode.POP, line);
    this.compileExpression(expr.consequent);
    const jumpToEnd = this.emitJump(OpCode.JMP, line);
    this.patchJump(jumpToElse);
    this.emit(OpCode.POP, line);
    this.compileExpression(expr.alternate);
    this.patchJump(jumpToEnd);
  }

  private compileRangeExpression(expr: RangeExpression): void {
    const line = expr.position.line;
    // Compile range as a call to the __range builtin: __range(start, end, inclusive)
    const rangeIdx = this.current.chunk.addConstant(createString('__range'));
    this.emit(OpCode.LOAD_GLOBAL, line);
    this.emit16(rangeIdx, line);
    this.compileExpression(expr.start);
    this.compileExpression(expr.end);
    this.emitConstant(createBoolean(expr.inclusive), line);
    this.emit(OpCode.CALL, line);
    this.emit16(3, line);
  }
}

// Re-export for external use
export { Chunk } from './chunk';
export { OpCode } from './opcodes';
