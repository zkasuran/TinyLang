/**
 * TinyLang Interactive Debugger
 * 
 * Wraps the tree-walk interpreter with debugging capabilities:
 * - Breakpoints (line-based, conditional)
 * - Step execution (over, into, out)
 * - Variable inspection
 * - Watch expressions
 * - Call stack display
 * 
 * Architecture: The debugger uses a "replay and pause" approach.
 * The interpreter is synchronous, so to "pause" we throw a DebugPauseSignal.
 * When the user resumes (step/continue), we re-execute the program from
 * the beginning, counting statements to skip past already-executed ones,
 * then pause at the next appropriate point.
 */

import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { Interpreter } from '../interpreter';
import { registerStdlib } from '../stdlib';
import { Program, Statement } from '../types/ast';
import {
  Environment,
  RuntimeValue,
  stringify,
} from '../types/values';
import {
  Breakpoint,
  DebugFrame,
  DebugAction,
  DebugState,
  WatchExpression,
} from './types';
import { getLocalsFromEnv } from './inspector';

export interface DebuggerOptions {
  output?: (msg: string) => void;
}

/**
 * Signal thrown to pause execution from within the debug hook.
 * This is caught by the debugger's run methods.
 */
export class DebugPauseSignal extends Error {
  constructor() {
    super('DebugPauseSignal');
    this.name = 'DebugPauseSignal';
  }
}

/**
 * The Debugger class manages debugging sessions for TinyLang programs.
 * It uses the interpreter's debug hook to intercept execution before each
 * statement, enabling breakpoints, stepping, and inspection.
 */
export class Debugger {
  private source: string;
  private output: (msg: string) => void;
  private program: Program | null = null;

  // Breakpoint management
  private breakpoints: Map<number, Breakpoint> = new Map();
  private nextBreakpointId = 1;

  // State
  private _state: DebugState = 'stopped';
  private currentLine = 0;
  private currentColumn = 0;
  private currentEnv: Environment | null = null;

  // Call stack (updated by the hook)
  private callStack: DebugFrame[] = [];

  // Statement counter for replay-based execution
  private statementsExecuted = 0;

  // Stepping logic
  private pendingAction: DebugAction = 'continue';
  private stepOverDepth = 0;

  // Watch expressions
  private watches: Map<number, WatchExpression> = new Map();
  private nextWatchId = 1;

  // Output suppression during replay
  private suppressOutput = false;
  private outputMessages: string[] = [];

  constructor(source: string, options?: DebuggerOptions) {
    this.source = source;
    this.output = options?.output || (() => { /* noop */ });
  }

  // ============ Breakpoint Management ============

  /**
   * Add a breakpoint at the specified line, optionally with a condition.
   */
  addBreakpoint(line: number, condition?: string): Breakpoint {
    const bp: Breakpoint = {
      id: this.nextBreakpointId++,
      line,
      condition,
      hitCount: 0,
      enabled: true,
    };
    this.breakpoints.set(bp.id, bp);
    return bp;
  }

  /**
   * Remove a breakpoint by its ID.
   */
  removeBreakpoint(id: number): boolean {
    return this.breakpoints.delete(id);
  }

  /**
   * List all breakpoints.
   */
  listBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  // ============ Watch Expression Management ============

  /**
   * Add a watch expression.
   */
  addWatch(expression: string): WatchExpression {
    const watch: WatchExpression = {
      id: this.nextWatchId++,
      expression,
    };
    this.watches.set(watch.id, watch);
    return watch;
  }

  /**
   * Remove a watch expression by its ID.
   */
  removeWatch(id: number): boolean {
    return this.watches.delete(id);
  }

  /**
   * Get all watch expressions with their current evaluated values.
   */
  getWatches(): WatchExpression[] {
    const watches = Array.from(this.watches.values());
    for (const watch of watches) {
      watch.lastValue = this.evaluateWatchExpression(watch.expression);
    }
    return watches;
  }

  // ============ Execution Control ============

  /**
   * Start the debugging session. Parses the source and pauses before
   * the first statement.
   */
  start(): void {
    const lexer = new Lexer(this.source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    this.program = parser.parse();

    this._state = 'running';
    this.statementsExecuted = 0;
    this.outputMessages = [];

    // Always pause at the first statement
    this.pendingAction = 'step_into';

    this.runFromBeginning();
  }

  /**
   * Step over - execute next statement, skip into function calls
   */
  step(): void {
    if (this._state !== 'paused') return;
    this.pendingAction = 'step_over';
    this.stepOverDepth = this.callStack.length;
    this._state = 'running';
    this.runFromBeginning();
  }

  /**
   * Step into - enter function calls
   */
  stepInto(): void {
    if (this._state !== 'paused') return;
    this.pendingAction = 'step_into';
    this._state = 'running';
    this.runFromBeginning();
  }

  /**
   * Step out - run until current function returns
   */
  stepOut(): void {
    if (this._state !== 'paused') return;
    this.pendingAction = 'step_out';
    this.stepOverDepth = this.callStack.length;
    this._state = 'running';
    this.runFromBeginning();
  }

  /**
   * Continue execution until next breakpoint or end.
   */
  continue(): void {
    if (this._state !== 'paused') return;
    this.pendingAction = 'continue';
    this._state = 'running';
    this.runFromBeginning();
  }

  /**
   * Stop the debugging session.
   */
  stop(): void {
    this._state = 'stopped';
    this.callStack = [];
    this.currentEnv = null;
  }

  // ============ Inspection ============

  /**
   * Get local variables from the specified frame (default: current/top frame)
   */
  getLocals(frameIndex?: number): Map<string, RuntimeValue> {
    const idx = frameIndex !== undefined ? frameIndex : this.callStack.length - 1;
    const frame = this.callStack[idx];
    if (!frame) return new Map();
    return getLocalsFromEnv(frame.env);
  }

  /**
   * Get the current call stack.
   */
  getCallStack(): DebugFrame[] {
    return [...this.callStack];
  }

  /**
   * Evaluate an expression in the current debugging context.
   */
  evaluateExpression(expr: string): string {
    if (!this.currentEnv) return '<no context>';
    try {
      const lexer = new Lexer(expr);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      const tempInterpreter = new Interpreter({
        output: () => { /* swallow output */ },
      });

      const result = tempInterpreter.executeInEnvironment(program, this.currentEnv);
      return stringify(result);
    } catch (e) {
      return `<error: ${e instanceof Error ? e.message : String(e)}>`;
    }
  }

  /**
   * Get the current debugger state.
   */
  getState(): DebugState {
    return this._state;
  }

  /**
   * Get the current execution line.
   */
  getCurrentLine(): number {
    return this.currentLine;
  }

  /**
   * Get the current execution column.
   */
  getCurrentColumn(): number {
    return this.currentColumn;
  }

  // ============ Internal Methods ============

  /**
   * Re-run the program from the beginning.
   * Output is suppressed for already-executed statements.
   * The debug hook tracks statement count and pauses appropriately.
   */
  private runFromBeginning(): void {
    if (!this.program) return;

    let statementCounter = 0;
    // The statement counter where we previously paused.
    // Statements 1..(previousPause-1) have fully executed (suppress output).
    // Statement previousPause needs to execute now (was paused, never ran).
    // Statements > previousPause are new territory (check pause logic).
    const previousPause = this.statementsExecuted;

    const interpreter = new Interpreter({
      output: (msg: string) => {
        if (!this.suppressOutput) {
          this.output(msg);
          this.outputMessages.push(msg);
        }
      },
      maxSteps: 10_000_000,
    });

    const globalEnv = interpreter.getGlobalEnvironment();
    registerStdlib(globalEnv, {
      output: (msg: string) => {
        if (!this.suppressOutput) {
          this.output(msg);
          this.outputMessages.push(msg);
        }
      },
    });

    // Set up the debug hook
    interpreter.debugHook = (stmt: Statement, env: Environment, callStack: DebugFrame[]): DebugAction => {
      statementCounter++;

      // Phase 1: Replay completed statements (suppress their side effects)
      if (statementCounter < previousPause) {
        this.suppressOutput = true;
        return 'continue';
      }

      // Phase 2: The previously-paused statement needs to execute now
      if (statementCounter === previousPause) {
        this.suppressOutput = false;
        this.currentLine = stmt.position.line;
        this.currentColumn = stmt.position.column;
        this.currentEnv = env;
        this.callStack = [...callStack];
        return 'continue';
      }

      // Phase 3: New statements - check pause logic
      this.suppressOutput = false;

      // Update current state
      this.currentLine = stmt.position.line;
      this.currentColumn = stmt.position.column;
      this.currentEnv = env;
      this.callStack = [...callStack];

      // Check if we should pause
      if (this.shouldPause(stmt.position.line, env, callStack)) {
        this._state = 'paused';
        this.statementsExecuted = statementCounter;
        throw new DebugPauseSignal();
      }

      return 'continue';
    };

    // Start with output suppressed if we have replay to do
    this.suppressOutput = previousPause > 0;

    try {
      interpreter.executeInEnvironment(this.program, globalEnv);
      // If we get here, execution completed without pausing
      this._state = 'stopped';
    } catch (e) {
      if (e instanceof DebugPauseSignal) {
        // Successfully paused
        return;
      }
      // Runtime error during debugging
      this._state = 'stopped';
      const msg = e instanceof Error ? e.message : String(e);
      this.output(`Runtime error: ${msg}`);
    }
  }

  /**
   * Determine if execution should pause at the current point.
   */
  private shouldPause(line: number, env: Environment, callStack: DebugFrame[]): boolean {
    // Check breakpoints first (they always trigger regardless of step mode)
    if (this.pendingAction === 'continue') {
      return this.checkBreakpoints(line, env);
    }

    // Stepping logic
    switch (this.pendingAction) {
      case 'step_into':
        // Always pause on next statement
        return true;

      case 'step_over':
        // Pause when call depth is same or less than when step was initiated
        if (callStack.length <= this.stepOverDepth) {
          return true;
        }
        // But also check breakpoints while stepping
        return this.checkBreakpoints(line, env);

      case 'step_out':
        // Pause when call depth is less than when step was initiated
        if (callStack.length < this.stepOverDepth) {
          return true;
        }
        // But also check breakpoints while stepping
        return this.checkBreakpoints(line, env);

      default:
        return this.checkBreakpoints(line, env);
    }
  }

  /**
   * Check if any breakpoint matches the current line and conditions.
   */
  private checkBreakpoints(line: number, env: Environment): boolean {
    for (const bp of this.breakpoints.values()) {
      if (!bp.enabled || bp.line !== line) continue;

      // Check condition if one is set
      if (bp.condition) {
        const condResult = this.evaluateCondition(bp.condition, env);
        if (!condResult) continue;
      }

      bp.hitCount++;
      return true;
    }
    return false;
  }

  /**
   * Evaluate a breakpoint condition expression.
   */
  private evaluateCondition(condition: string, env: Environment): boolean {
    try {
      const lexer = new Lexer(condition);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      const tempInterpreter = new Interpreter({
        output: () => { /* swallow */ },
      });

      const result = tempInterpreter.executeInEnvironment(program, env);

      switch (result.type) {
        case 'null': return false;
        case 'boolean': return result.value;
        case 'number': return result.value !== 0;
        case 'string': return result.value.length > 0;
        case 'array': return result.elements.length > 0;
        default: return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Evaluate a watch expression in the current context.
   */
  private evaluateWatchExpression(expression: string): string {
    if (!this.currentEnv) return '<no context>';
    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      const tempInterpreter = new Interpreter({
        output: () => { /* swallow */ },
      });

      const result = tempInterpreter.executeInEnvironment(program, this.currentEnv);
      return stringify(result);
    } catch (e) {
      return `<error: ${e instanceof Error ? e.message : String(e)}>`;
    }
  }
}
