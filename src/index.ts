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

// Re-export types
export * from './types/tokens';
export * from './types/ast';
export * from './types/values';
