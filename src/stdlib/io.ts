/**
 * I/O Standard Library Functions
 * 
 * Provides input/output operations for TinyLang programs.
 */

import {
  RuntimeValue,
  NativeFunctionValue,
  createNull,
  createString,
  stringify,
} from '../types/values';

type OutputHandler = (message: string) => void;
type InputHandler = (prompt: string) => string;

/**
 * Create I/O functions with configurable handlers
 */
export function createIOFunctions(
  outputHandler: OutputHandler,
  inputHandler?: InputHandler
): NativeFunctionValue[] {
  const functions: NativeFunctionValue[] = [];

  // print(...args) - Output values to console
  functions.push({
    type: 'native-function',
    name: 'print',
    arity: -1, // variadic
    fn: (args: RuntimeValue[]) => {
      const message = args.map(stringify).join(' ');
      outputHandler(message);
      return createNull();
    },
  });

  // println(...args) - Output values with trailing newline (same as print in REPL)
  functions.push({
    type: 'native-function',
    name: 'println',
    arity: -1,
    fn: (args: RuntimeValue[]) => {
      const message = args.map(stringify).join(' ');
      outputHandler(message);
      return createNull();
    },
  });

  // input(prompt?) - Read user input
  functions.push({
    type: 'native-function',
    name: 'input',
    arity: -1,
    fn: (args: RuntimeValue[]) => {
      const prompt = args.length > 0 ? stringify(args[0]) : '';
      if (inputHandler) {
        const result = inputHandler(prompt);
        return createString(result);
      }
      // In environments without input (like web), return empty string
      return createString('');
    },
  });

  return functions;
}
