/**
 * TinyLang - A Minimal Educational Programming Language
 * 
 * This is the main entry point for the TinyLang library.
 * It exports the core components for use in the CLI, REPL, and web playground.
 */

export { Lexer } from './lexer';
export { Parser } from './parser';
export { Interpreter } from './interpreter';
export type { InterpreterOptions, OutputHandler } from './interpreter';
export { registerStdlib } from './stdlib';
export { TinyLang } from './tinylang';

// Compiler and VM
export { Compiler, Chunk, OpCode, opcodeName, disassemble, optimize, CompilerError } from './compiler';
export type { CompiledFunction } from './compiler';
export { VM } from './vm';
export type { VMOptions } from './vm';

// Debugger
export { Debugger, DebugPauseSignal } from './debugger';
export type { DebuggerOptions } from './debugger';
export { formatVariable, formatCallStack, formatLocals, formatWatches, getLocalsFromEnv, parseCommand, getHelpText } from './debugger';
export type { DebugCommand, Breakpoint, DebugFrame, DebugAction, DebugState, WatchExpression, DebugEvent } from './debugger';

// Re-export types
export * from './types/tokens';
export * from './types/ast';
export * from './types/values';

// Formatter
export { Formatter } from './formatter';
export type { FormatOptions } from './formatter';

// Linter
export { Linter } from './linter';
export type { Diagnostic } from './linter';

// Testing
export { TestRunner, formatTestResults, AssertionError } from './testing';
export type { TestResult } from './testing';
