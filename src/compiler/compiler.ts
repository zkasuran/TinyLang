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
  TryCatchStatement,
  ThrowStatement,
  DestructuringDeclaration,
  EnumDeclaration,
  InterpolatedString,
  OptionalMemberExpression,
  OptionalIndexExpression,
  NullishCoalesceExpression,
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
  PipeExpression,
  PipeMethodExpression,
  Parameter,
} from '../types/ast';
import {
  RuntimeValue,
  createNumber,
  createString,
  createBoolean,
  createNull,
} from '../types/values';
import { OpCode, CompoundOp } from './opcodes';
import { Chunk } from './chunk';
import { CompilerError } from './errors';

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
 * A loop being compiled, used to resolve `break` and `continue`.
 *
 * Both statements are forward jumps whose target is not known until the loop
 * finishes compiling, so their operands are recorded here and backpatched by
 * the loop compiler. `localCount` is the number of live locals at the top of
 * the loop; break/continue must emit that many POPs' worth of difference so the
 * stack is balanced no matter how deeply nested the jump is.
 */
interface LoopContext {
  /** Offsets of jump operands emitted by `break`, patched to just past the loop. */
  breakJumps: number[];
  /** Offsets of jump operands emitted by `continue`, patched to the loop's next-iteration code. */
  continueJumps: number[];
  /** Number of live locals at the top of the loop body. */
  localCount: number;
  /**
   * Number of enclosing `try` blocks live at the top of the loop. Jumping out of
   * a `try` skips its TRY_END, so break/continue must uninstall each handler it
   * escapes or a later, unrelated error is caught by a dead catch block.
   */
  tryDepth: number;
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
  /** Loops currently being compiled, innermost last. Per function, so a loop cannot be exited across a call boundary. */
  loops: LoopContext[];
  /** How many `try` bodies enclose the code being compiled right now. */
  tryDepth: number;
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

export { CompilerError } from './errors';

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
      loops: [],
      tryDepth: 0,
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

  /**
   * Declare `name` as a local, rejecting a genuine redeclaration.
   *
   * The interpreter's Environment.define throws when the name already exists in
   * the *same* environment. The compiler's scopes mirror those environments
   * one-for-one (beginScope where the interpreter calls createChild), so "already
   * a local at the current scopeDepth" is the same condition. Shadowing in a
   * nested scope, and a loop body rebinding its own local on each iteration, both
   * live at a deeper depth and are untouched.
   *
   * The error is emitted as a RAISE instruction rather than thrown here, because
   * the interpreter reports it at the moment execution reaches the declaration:
   * a redeclaration inside `if false { }` is never reported, and one inside `try`
   * is caught. Failing compilation would change both.
   */
  private declareLocal(name: string, line: number): void {
    if (this.isRedeclaredInCurrentScope(name)) {
      this.emitRaise(`Variable '${name}' is already declared in this scope`, line);
    }
    this.addLocal(name);
  }

  private isRedeclaredInCurrentScope(name: string): boolean {
    for (let i = this.current.locals.length - 1; i >= 0; i--) {
      const local = this.current.locals[i];
      if (local.depth < this.current.scopeDepth) return false;
      if (local.name === name) return true;
    }
    return false;
  }

  /** Emit an instruction that raises `message` when reached. */
  private emitRaise(message: string, line: number): void {
    const msgIdx = this.current.chunk.addConstant(createString(message));
    this.emit(OpCode.RAISE, line);
    this.emit16(msgIdx, line);
  }

  /** Emit the store for a top-level declaration (not an assignment). */
  private emitDeclareGlobal(name: string, line: number): void {
    const nameIdx = this.current.chunk.addConstant(createString(name));
    this.emit(OpCode.DECLARE_GLOBAL, line);
    this.emit16(nameIdx, line);
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
        this.compileBreakStatement(stmt.position.line);
        break;
      case 'ContinueStatement':
        this.compileContinueStatement(stmt.position.line);
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
      case 'DestructuringDeclaration':
        this.compileDestructuringDeclaration(stmt);
        break;
      case 'EnumDeclaration':
        this.compileEnumDeclaration(stmt);
        break;
      case 'TryCatchStatement':
        this.compileTryCatchStatement(stmt);
        break;
      case 'ThrowStatement':
        this.compileThrowStatement(stmt);
        break;
      case 'TestDeclaration':
        // Tests are only executed by the test runner, never during a normal
        // program run. The interpreter treats them as a no-op too.
        break;
      default: {
        // Exhaustiveness guard. Silently ignoring an unhandled statement type
        // is how f-strings, try/catch and destructuring came to "compile" into
        // nothing at all and surface much later as a stack underflow.
        const unhandled: never = stmt;
        throw new CompilerError(
          `Unsupported statement type: ${(unhandled as Statement).type}`,
          (unhandled as Statement).position?.line
        );
      }
    }
  }

  /**
   * `break`: unwind the locals declared inside the loop, then jump past it.
   */
  private compileBreakStatement(line: number): void {
    const loop = this.currentLoop();
    if (!loop) {
      throw new CompilerError("'break' can only be used inside a loop", line);
    }
    this.emitLoopExitPops(loop, line);
    loop.breakJumps.push(this.emitJump(OpCode.JMP, line));
  }

  /**
   * `continue`: unwind the locals declared inside the loop, then jump to the
   * loop's next-iteration code (the increment for `for`, the condition for
   * `while`).
   */
  private compileContinueStatement(line: number): void {
    const loop = this.currentLoop();
    if (!loop) {
      throw new CompilerError("'continue' can only be used inside a loop", line);
    }
    this.emitLoopExitPops(loop, line);
    loop.continueJumps.push(this.emitJump(OpCode.JMP, line));
  }

  private currentLoop(): LoopContext | null {
    const loops = this.current.loops;
    return loops.length > 0 ? loops[loops.length - 1] : null;
  }

  /**
   * Emit a POP for every local that is live inside the loop body but not at the
   * top of the loop. Jumping out of a block skips the `endScope()` that would
   * normally discard those slots, so they must be discarded here instead or the
   * loop's own bookkeeping slots end up at the wrong stack offsets.
   *
   * The compile-time locals list is deliberately left untouched: control flow
   * jumps away, but compilation continues with the same set of live locals.
   */
  private emitLoopExitPops(loop: LoopContext, line: number): void {
    for (let i = this.current.locals.length; i > loop.localCount; i--) {
      this.emit(OpCode.POP, line);
    }
    // Uninstall the handler of every `try` this jump escapes, since their
    // TRY_END instructions are being skipped.
    for (let i = this.current.tryDepth; i > loop.tryDepth; i--) {
      this.emit(OpCode.TRY_END, line);
    }
  }

  private compileVariableDeclaration(stmt: VariableDeclaration): void {
    const line = stmt.position.line;
    this.compileExpression(stmt.value);

    this.addLocalOrStoreGlobal(stmt.name, line);
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

    this.addLocalOrStoreGlobal(stmt.name, line);
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
      // `fn f(a, a)` is a redeclaration; the interpreter reports it while
      // binding the second parameter, i.e. at call time, and so does the RAISE
      // this emits into the function prologue.
      this.declareLocal(param.name, line);
      if (param.defaultValue) {
        defaultParams++;
      }
    }

    // Emit the default-parameter prologue.
    //
    // The VM pads missing arguments with null so every parameter has a stack
    // slot, which means "absent" and "explicitly passed null" look identical
    // from inside the frame. The interpreter distinguishes them by comparing
    // against the real argument count, so the prologue does the same via
    // LOAD_ARGC rather than testing the slot for null.
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      if (!param.defaultValue) continue;

      this.emit(OpCode.LOAD_ARGC, line);
      this.emitConstant(createNumber(i), line);
      this.emit(OpCode.GT, line); // argc > i  =>  argument i was supplied

      const suppliedJump = this.emitJump(OpCode.JMP_IF_TRUE, line);
      this.emit(OpCode.POP, line); // discard the comparison result
      this.compileExpression(param.defaultValue);
      this.emit(OpCode.STORE_LOCAL, line);
      this.emit16(i, line);
      const doneJump = this.emitJump(OpCode.JMP, line);

      this.patchJump(suppliedJump);
      this.emit(OpCode.POP, line); // discard the comparison result
      this.patchJump(doneJump);
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

    this.addLocalOrStoreGlobal(stmt.name, line);

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

    // Compile class properties (instance defaults).
    //
    // These are stored under their plain name. They were previously prefixed
    // with `__prop_`, but NEW_INSTANCE seeds an instance from the class's
    // property map verbatim, so the prefix meant every declared default was
    // invisible to the program (`this.legs` read back as null).
    for (const prop of stmt.properties) {
      const propNameIdx = this.current.chunk.addConstant(createString(prop.name));
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

    const loop: LoopContext = {
      breakJumps: [],
      continueJumps: [],
      localCount: this.current.locals.length,
      tryDepth: this.current.tryDepth,
    };
    this.current.loops.push(loop);

    this.beginScope();
    for (const s of stmt.body) {
      this.compileStatement(s);
    }
    this.endScope(line);

    // `continue` re-tests the condition, so it targets the top of the loop.
    for (const jump of loop.continueJumps) {
      this.current.chunk.patch16(jump, loopStart);
    }

    this.emitLoop(loopStart, line);
    this.patchJump(exitJump);
    this.emit(OpCode.POP, line); // Pop condition

    // `break` skips the condition POP above, so it lands after it.
    for (const jump of loop.breakJumps) {
      this.patchJump(jump);
    }
    this.current.loops.pop();
  }

  private compileForStatement(stmt: ForStatement): void {
    const line = stmt.position.line;

    // Compile the iterable
    this.compileExpression(stmt.iterable);

    // Reject a non-iterable up front. Without this the loop's own `__idx <
    // __iter.length` test is what fails, reporting a confusing "Cannot compare
    // number and null" instead of naming the real problem.
    this.emit(OpCode.CHECK_ITERABLE, line);

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

    // The loop's own slots (__iter, __idx) are live across iterations; the loop
    // variable and any body locals are not. break/continue must unwind down to
    // this count.
    const loop: LoopContext = {
      breakJumps: [],
      continueJumps: [],
      localCount: this.current.locals.length,
      tryDepth: this.current.tryDepth,
    };
    this.current.loops.push(loop);

    // Store as the loop variable, inside its own scope.
    // The scope is essential: any `let` declared in the body allocates a stack
    // slot, and without endScope() emitting matching POPs those slots leak on
    // every iteration, shifting all subsequent local indices.
    this.beginScope();
    this.declareLocal(stmt.variable, line);

    // Compile body
    for (const s of stmt.body) {
      this.compileStatement(s);
    }

    // Pops the loop variable and every body-local declared this iteration
    this.endScope(line);

    // `continue` must still advance the index, so it targets the increment
    // rather than the top of the loop.
    for (const jump of loop.continueJumps) {
      this.current.chunk.patch16(jump, this.current.chunk.currentOffset);
    }

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

    // `break` skips the condition POP above, so it lands after it but still
    // inside the __iter/__idx scope, whose endScope() discards those slots.
    for (const jump of loop.breakJumps) {
      this.patchJump(jump);
    }
    this.current.loops.pop();

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

  /**
   * try/catch.
   *
   * TRY_BEGIN installs a handler pointing at the catch block. On the normal
   * path TRY_END removes it and control jumps over the catch. If anything
   * throws while the handler is installed, the VM unwinds to it and pushes the
   * error object, which the catch block binds as its variable.
   */
  private compileTryCatchStatement(stmt: TryCatchStatement): void {
    const line = stmt.position.line;

    const handlerJump = this.emitJump(OpCode.TRY_BEGIN, line);

    // Only the try body is guarded; by the time the catch body runs the VM has
    // already uninstalled this handler.
    this.current.tryDepth++;
    this.beginScope();
    for (const s of stmt.tryBody) {
      this.compileStatement(s);
    }
    this.endScope(line);
    this.current.tryDepth--;

    this.emit(OpCode.TRY_END, line);
    const overCatch = this.emitJump(OpCode.JMP, line);

    // Handler entry. The VM has already restored the stack to its height at
    // TRY_BEGIN and pushed the error object, which becomes the catch variable.
    this.patchJump(handlerJump);
    this.beginScope();
    this.addLocalOrStoreGlobal(stmt.catchVariable, line);
    for (const s of stmt.catchBody) {
      this.compileStatement(s);
    }
    this.endScope(line);

    this.patchJump(overCatch);
  }

  private compileThrowStatement(stmt: ThrowStatement): void {
    const line = stmt.position.line;
    this.compileExpression(stmt.value);
    this.emit(OpCode.THROW, line);
  }

  /**
   * `let [a, b] = expr` / `let {x, y} = expr`.
   *
   * The right-hand side is evaluated once and kept on the stack while each name
   * is extracted from it.
   */
  private compileDestructuringDeclaration(stmt: DestructuringDeclaration): void {
    const line = stmt.position.line;
    this.compileExpression(stmt.value);

    const isArray = stmt.pattern.kind === 'array';
    const names = stmt.pattern.names;

    if (this.current.scopeDepth > 0) {
      // Locals occupy consecutive stack slots, so the subject cannot be popped
      // from underneath them. Keep it as an unnamed local; endScope() discards
      // it along with the destructured names.
      this.addLocal(`__destructured`);
      const subjectSlot = this.current.locals.length - 1;

      for (let i = 0; i < names.length; i++) {
        this.emit(OpCode.LOAD_LOCAL, line);
        this.emit16(subjectSlot, line);
        this.emitDestructureExtract(isArray, names[i], i, line);
        this.declareLocal(names[i], line);
      }
    } else {
      for (let i = 0; i < names.length; i++) {
        this.emit(OpCode.DUP, line);
        this.emitDestructureExtract(isArray, names[i], i, line);
        this.emitDeclareGlobal(names[i], line);
      }
      this.emit(OpCode.POP, line); // discard the subject
    }
  }

  private emitDestructureExtract(
    isArray: boolean,
    name: string,
    index: number,
    line: number
  ): void {
    if (isArray) {
      this.emit(OpCode.DESTRUCT_ELEM, line);
      this.emit16(index, line);
    } else {
      const keyIdx = this.current.chunk.addConstant(createString(name));
      this.emit(OpCode.DESTRUCT_PROP, line);
      this.emit16(keyIdx, line);
    }
  }

  /**
   * `enum Color { Red, Green }` compiles to an object mapping each variant name
   * to itself as a string, matching the interpreter.
   */
  private compileEnumDeclaration(stmt: EnumDeclaration): void {
    const line = stmt.position.line;
    for (const variant of stmt.variants) {
      this.emitConstant(createString(variant), line);
      this.emitConstant(createString(variant), line);
    }
    this.emit(OpCode.OBJECT, line);
    this.emit16(stmt.variants.length, line);
    this.addLocalOrStoreGlobal(stmt.name, line);
  }

  /**
   * Bind the value on top of the stack to `name` as a *declaration*: as a local
   * it simply stays on the stack in its slot, as a global it is stored and
   * popped. Either way a redeclaration in the same scope is rejected.
   */
  private addLocalOrStoreGlobal(name: string, line: number): void {
    if (this.current.scopeDepth > 0) {
      this.declareLocal(name, line);
    } else {
      this.emitDeclareGlobal(name, line);
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
      case 'PipeExpression':
        this.compilePipeExpression(expr);
        break;
      case 'PipeMethodExpression':
        this.compilePipeMethodExpression(expr);
        break;
      case 'InterpolatedString':
        this.compileInterpolatedString(expr);
        break;
      case 'OptionalMemberExpression':
        this.compileOptionalMemberExpression(expr);
        break;
      case 'OptionalIndexExpression':
        this.compileOptionalIndexExpression(expr);
        break;
      case 'NullishCoalesceExpression':
        this.compileNullishCoalesceExpression(expr);
        break;
      default: {
        // Exhaustiveness guard: an unhandled expression type used to compile to
        // no instructions at all, leaving the stack short and failing much later
        // somewhere unrelated.
        const unhandled: never = expr;
        throw new CompilerError(
          `Unsupported expression type: ${(unhandled as Expression).type}`,
          (unhandled as Expression).position?.line
        );
      }
    }
  }

  /**
   * f-strings. Concatenation starts from a string so that ADD always takes its
   * string branch and every interpolated value is stringified, exactly as the
   * interpreter's evalInterpolatedString does.
   */
  private compileInterpolatedString(expr: InterpolatedString): void {
    const line = expr.position.line;
    const parts = expr.parts;

    if (parts.length === 0) {
      this.emitConstant(createString(''), line);
      return;
    }

    let start = 0;
    const first = parts[0];
    if (first.kind === 'literal') {
      this.emitConstant(createString(first.value), line);
      start = 1;
    } else {
      // Seed with "" so that f"{n}" yields the string "42" rather than the
      // number 42.
      this.emitConstant(createString(''), line);
    }

    for (let i = start; i < parts.length; i++) {
      const part = parts[i];
      if (part.kind === 'literal') {
        this.emitConstant(createString(part.value), line);
      } else {
        this.compileExpression(part.expression);
      }
      this.emit(OpCode.ADD, line);
    }
  }

  /** `obj?.prop` - short-circuits to null when obj is null. */
  private compileOptionalMemberExpression(expr: OptionalMemberExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.object);
    // JMP_IF_NULL peeks, so the null itself becomes the result.
    const skip = this.emitJump(OpCode.JMP_IF_NULL, line);
    const propIdx = this.current.chunk.addConstant(createString(expr.property));
    this.emit(OpCode.GET_PROP, line);
    this.emit16(propIdx, line);
    this.patchJump(skip);
  }

  /** `obj?.[i]` - short-circuits to null without evaluating the index. */
  private compileOptionalIndexExpression(expr: OptionalIndexExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.object);
    const skip = this.emitJump(OpCode.JMP_IF_NULL, line);
    this.compileExpression(expr.index);
    this.emit(OpCode.INDEX_OPTIONAL, line);
    this.patchJump(skip);
  }

  /** `a ?? b` - evaluates b only when a is null. */
  private compileNullishCoalesceExpression(expr: NullishCoalesceExpression): void {
    const line = expr.position.line;
    this.compileExpression(expr.left);
    const useRight = this.emitJump(OpCode.JMP_IF_NULL, line);
    const done = this.emitJump(OpCode.JMP, line);
    this.patchJump(useRight);
    this.emit(OpCode.POP, line); // discard the null
    this.compileExpression(expr.right);
    this.patchJump(done);
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
    const hasSpread = elements.some((el) => el.type === 'SpreadExpression');

    if (!hasSpread) {
      for (const el of elements) {
        this.compileExpression(el);
      }
      this.emit(OpCode.ARRAY, line);
      this.emit16(elements.length, line);
      return;
    }

    // With a spread the element count is not known until runtime, so build the
    // array incrementally instead of with a fixed-arity ARRAY.
    this.emit(OpCode.ARRAY, line);
    this.emit16(0, line);
    for (const el of elements) {
      if (el.type === 'SpreadExpression') {
        this.compileExpression(el.argument);
        this.emit(OpCode.ARRAY_SPREAD, el.position.line);
      } else {
        this.compileExpression(el);
        this.emit(OpCode.ARRAY_APPEND, el.position.line);
      }
    }
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

  /**
   * Assignment, in all its target forms.
   *
   * The right-hand side is always compiled first, because that is the order the
   * interpreter evaluates in. It is observable: `arr[i()] = v()` must call v()
   * before i(), and `x += f()` must read x only *after* f() has run, since f
   * may assign to x. ROT then moves the value from the bottom of the group up
   * to wherever the store instruction expects it.
   */
  private compileAssignmentExpression(expr: AssignmentExpression): void {
    const line = expr.position.line;

    if (expr.target.type === 'Identifier') {
      this.compileExpression(expr.value); // [value]
      if (expr.operator !== '=') {
        this.compileLoadVariable(expr.target.name, line); // [value, current]
        this.emitRot(2, line); // [current, value]
        this.emitCompoundOp(expr.operator, line); // [result]
      }
      this.emit(OpCode.DUP, line); // Keep value on stack as expression result
      this.compileStoreVariable(expr.target.name, line);
      return;
    }

    if (expr.target.type === 'IndexExpression') {
      this.compileExpression(expr.value); // [value]
      this.compileExpression(expr.target.object); // [value, obj]
      this.compileExpression(expr.target.index); // [value, obj, index]
      if (expr.operator === '=') {
        this.emitRot(3, line); // [obj, index, value]
      } else {
        // DUP2 copies obj and index for the read and leaves the originals for
        // the store, so `a[idx()] += 1` evaluates idx() exactly once.
        this.emit(OpCode.DUP2, line); // [value, obj, index, obj, index]
        // A non-throwing read: the interpreter reads the current element
        // without a bounds check and lets the numeric check on the compound
        // operator be what rejects `a[999] += 1`.
        this.emit(OpCode.INDEX_OPTIONAL, line); // [value, obj, index, current]
        this.emitRot(4, line); // [obj, index, current, value]
        this.emitCompoundOp(expr.operator, line); // [obj, index, result]
      }
      this.emit(OpCode.SET_INDEX, line);
      return;
    }

    if (expr.target.type === 'MemberExpression') {
      const propIdx = this.current.chunk.addConstant(
        createString(expr.target.property)
      );
      this.compileExpression(expr.value); // [value]
      this.compileExpression(expr.target.object); // [value, obj]
      if (expr.operator === '=') {
        this.emitRot(2, line); // [obj, value]
      } else {
        this.emit(OpCode.DUP, line); // [value, obj, obj]
        this.emit(OpCode.GET_PROP, line);
        this.emit16(propIdx, line); // [value, obj, current]
        this.emitRot(3, line); // [obj, current, value]
        this.emitCompoundOp(expr.operator, line); // [obj, result]
      }
      this.emit(OpCode.SET_PROP, line);
      this.emit16(propIdx, line);
      return;
    }

    // Anything else (`f() = 1`, `o?.p = 1`, `1 = 2`) parses but is not
    // assignable. Without this guard the branch emitted no instructions at all
    // and the POP appended by ExpressionStatement silently consumed an
    // unrelated value, underflowing the stack or corrupting a local slot.
    throw new CompilerError('Invalid assignment target', line);
  }

  private emitRot(count: number, line: number): void {
    this.emit(OpCode.ROT, line);
    this.emit16(count, line);
  }

  private emitCompoundOp(operator: string, line: number): void {
    const ops: Record<string, CompoundOp> = {
      '+=': CompoundOp.ADD,
      '-=': CompoundOp.SUB,
      '*=': CompoundOp.MUL,
      '/=': CompoundOp.DIV,
    };
    const op = ops[operator];
    if (op === undefined) {
      throw new CompilerError(`Unknown assignment operator: ${operator}`, line);
    }
    this.emit(OpCode.COMPOUND, line);
    this.emit16(op, line);
  }

  private compileCallExpression(expr: CallExpression): void {
    const line = expr.position.line;

    if (expr.callee.type === 'MemberExpression') {
      // `obj.m(...)` resolves `m` as a method rather than as a plain property.
      // The two differ: `arr.length` is a number, but `arr.length()` calls a
      // builtin, and builtins take precedence over an object's own properties.
      // GET_METHOD centralises that so the VM matches the interpreter.
      this.compileExpression(expr.callee.object);
      const propIdx = this.current.chunk.addConstant(
        createString(expr.callee.property)
      );
      this.emit(OpCode.GET_METHOD, line);
      this.emit16(propIdx, line);
    } else {
      this.compileExpression(expr.callee);
    }

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

  private compilePipeExpression(expr: PipeExpression): void {
    const line = expr.position.line;

    // If right is a CallExpression, prepend left as the first argument
    if (expr.right.type === 'CallExpression') {
      const callExpr = expr.right as CallExpression;
      this.compileExpression(callExpr.callee);
      this.compileExpression(expr.left);
      for (const arg of callExpr.args) {
        this.compileExpression(arg);
      }
      this.emit(OpCode.CALL, line);
      this.emit16(callExpr.args.length + 1, line);
    } else {
      // Right is a function reference - call it with left as the argument
      this.compileExpression(expr.right);
      this.compileExpression(expr.left);
      this.emit(OpCode.CALL, line);
      this.emit16(1, line);
    }
  }

  private compilePipeMethodExpression(expr: PipeMethodExpression): void {
    const line = expr.position.line;
    // Compile as obj.method(args) - load obj, resolve the method, call with args
    this.compileExpression(expr.left);
    const nameIdx = this.current.chunk.addConstant(createString(expr.method));
    this.emit(OpCode.GET_METHOD, line);
    this.emit16(nameIdx, line);
    // Push args
    for (const arg of expr.args) {
      this.compileExpression(arg);
    }
    this.emit(OpCode.CALL, line);
    this.emit16(expr.args.length, line);
  }
}

// Re-export for external use
export { Chunk } from './chunk';
export { OpCode } from './opcodes';
