/**
 * TinyLang - High-Level API
 * 
 * Provides a simple interface for running TinyLang programs.
 * Combines the lexer, parser, interpreter, and standard library
 * into a single, easy-to-use class.
 */

import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter, InterpreterOptions, OutputHandler } from './interpreter';
import { registerStdlib } from './stdlib';
import { Environment, stringify } from './types/values';
import { LexerError } from './lexer/errors';
import { ParseError } from './parser/errors';
import { RuntimeError } from './types/values';
import { Compiler } from './compiler/compiler';
import { Chunk } from './compiler/chunk';
import { VM } from './vm/vm';

export interface RunResult {
  success: boolean;
  output: string[];
  result: string;
  error?: {
    type: 'LexerError' | 'ParseError' | 'RuntimeError';
    message: string;
    line?: number;
    column?: number;
    hint?: string;
  };
}

export class TinyLang {
  private interpreter: Interpreter;
  private globalEnv: Environment;
  private outputBuffer: string[] = [];
  private outputHandler: OutputHandler;

  constructor(options: InterpreterOptions = {}) {
    this.outputBuffer = [];
    this.outputHandler = options.output || ((msg) => {
      this.outputBuffer.push(msg);
    });

    // Always capture to buffer AND forward to custom handler
    const captureOutput = (msg: string) => {
      this.outputBuffer.push(msg);
      if (options.output) {
        options.output(msg);
      }
    };

    this.interpreter = new Interpreter({
      ...options,
      output: captureOutput,
    });

    this.globalEnv = this.interpreter.getGlobalEnvironment();

    // Register standard library
    registerStdlib(this.globalEnv, {
      output: captureOutput,
      input: options.input,
    });
  }

  /**
   * Run a TinyLang source string and return the result
   */
  run(source: string): RunResult {
    this.outputBuffer = [];

    try {
      // Phase 1: Tokenize
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();

      // Phase 2: Parse
      const parser = new Parser(tokens);
      const program = parser.parse();

      // Phase 3: Interpret
      const result = this.interpreter.executeInEnvironment(program, this.globalEnv);

      return {
        success: true,
        output: [...this.outputBuffer],
        result: stringify(result),
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Run a file (source string with file context for error messages)
   */
  runFile(source: string, _filename?: string): RunResult {
    return this.run(source);
  }

  /**
   * Evaluate a single expression and return its string representation
   * (Used by REPL for auto-printing expression results)
   */
  evaluate(source: string): RunResult {
    return this.run(source);
  }

  /**
   * Check syntax without executing (useful for "check" command)
   */
  check(source: string): RunResult {
    try {
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      parser.parse();

      return {
        success: true,
        output: [],
        result: 'OK - No syntax errors found',
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Reset the interpreter state (clear all variables)
   */
  reset(): void {
    this.globalEnv = new Environment();
    registerStdlib(this.globalEnv, {
      output: this.outputHandler,
    });
  }

  /**
   * Get the current environment (for REPL inspection)
   */
  getEnvironment(): Environment {
    return this.globalEnv;
  }

  /**
   * Compile a TinyLang source string to bytecode
   */
  compile(source: string): Chunk {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();
    const compiler = new Compiler();
    return compiler.compile(program);
  }

  /**
   * Execute a compiled bytecode chunk and return the result
   */
  runCompiled(chunk: Chunk): RunResult {
    this.outputBuffer = [];

    try {
      const vm = new VM({
        output: (msg: string) => {
          this.outputBuffer.push(msg);
        },
      });
      const result = vm.run(chunk);

      return {
        success: true,
        output: [...this.outputBuffer],
        result: stringify(result),
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Compile and run source code using the bytecode compiler and VM
   */
  compileAndRun(source: string): RunResult {
    try {
      const chunk = this.compile(source);
      return this.runCompiled(chunk);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown): RunResult {
    if (error instanceof LexerError) {
      return {
        success: false,
        output: [...this.outputBuffer],
        result: '',
        error: {
          type: 'LexerError',
          message: error.message,
          line: error.position.line,
          column: error.position.column,
          hint: error.hint,
        },
      };
    }

    if (error instanceof ParseError) {
      return {
        success: false,
        output: [...this.outputBuffer],
        result: '',
        error: {
          type: 'ParseError',
          message: error.message,
          line: error.position.line,
          column: error.position.column,
          hint: error.hint,
        },
      };
    }

    if (error instanceof RuntimeError) {
      return {
        success: false,
        output: [...this.outputBuffer],
        result: '',
        error: {
          type: 'RuntimeError',
          message: error.message,
          line: error.line,
          column: error.column,
        },
      };
    }

    // Unknown error
    return {
      success: false,
      output: [...this.outputBuffer],
      result: '',
      error: {
        type: 'RuntimeError',
        message: String(error),
      },
    };
  }
}
