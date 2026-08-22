/**
 * Compiler error type.
 *
 * Lives in its own module so that both the compiler and the bytecode chunk can
 * raise it without chunk.ts having to import from compiler.ts, which imports
 * chunk.ts.
 */
export class CompilerError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
    this.name = 'CompilerError';
  }
}
