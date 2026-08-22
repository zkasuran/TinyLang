/**
 * TinyLang Test Runner
 *
 * Discovers and executes test blocks, reporting results.
 */

import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { Interpreter } from '../interpreter/interpreter';
import { Program, TestDeclaration } from '../types/ast';
import { Environment, stringify } from '../types/values';
import { registerStdlib } from '../stdlib/register';
import { assertionFunctions, AssertionError } from './assertions';

export interface TestResult {
  description: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export class TestRunner {
  /**
   * Run all test blocks in a TinyLang source string.
   */
  runTests(source: string): TestResult[] {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    // Find all TestDeclaration nodes
    const tests = this.findTests(program);
    const results: TestResult[] = [];

    for (const test of tests) {
      const result = this.runSingleTest(test, program);
      results.push(result);
    }

    return results;
  }

  private findTests(program: Program): TestDeclaration[] {
    const tests: TestDeclaration[] = [];
    for (const stmt of program.body) {
      if (stmt.type === 'TestDeclaration') {
        tests.push(stmt);
      }
    }
    return tests;
  }

  private runSingleTest(test: TestDeclaration, program: Program): TestResult {
    const description = this.getDescription(test);
    const start = Date.now();

    try {
      // Create a fresh environment for each test
      const env = new Environment();

      // Register stdlib
      registerStdlib(env, { output: () => {} });

      // Register assertion functions
      for (const fn of assertionFunctions) {
        env.define(fn.name, fn);
      }

      // Create interpreter
      const interpreter = new Interpreter({ output: () => {} });

      // First, execute all non-test top-level declarations (functions, classes, variables)
      // so they are available in the test
      const setupProgram: Program = {
        type: 'Program',
        body: program.body.filter(s => s.type !== 'TestDeclaration'),
        position: program.position,
      };
      interpreter.executeInEnvironment(setupProgram, env);

      // Now execute the test body
      const testProgram: Program = {
        type: 'Program',
        body: test.body,
        position: test.position,
      };
      interpreter.executeInEnvironment(testProgram, env);

      const duration = Date.now() - start;
      return { description, passed: true, duration };
    } catch (e) {
      const duration = Date.now() - start;
      let error: string;
      if (e instanceof AssertionError) {
        error = e.message;
      } else if (e instanceof Error) {
        error = e.message;
      } else {
        error = String(e);
      }
      return { description, passed: false, error, duration };
    }
  }

  private getDescription(test: TestDeclaration): string {
    if (test.description.type === 'StringLiteral') {
      return test.description.value;
    }
    return stringify({ type: 'string', value: '<dynamic test>' });
  }
}
