/**
 * Standard Library Registration
 * 
 * Registers all built-in functions and constants into a given environment.
 * This is called once when the interpreter initializes.
 */

import { Environment, createNumber } from '../types/values';
import { createIOFunctions } from './io';
import { mathFunctions, mathConstants } from './math';
import { stringFunctions } from './strings';
import { arrayFunctions } from './arrays';
import { typeFunctions } from './types';
import { utilFunctions } from './utils';

type OutputHandler = (message: string) => void;
type InputHandler = (prompt: string) => string;

export interface StdlibOptions {
  output?: OutputHandler;
  input?: InputHandler;
}

/**
 * Register all standard library functions and constants into the environment
 */
export function registerStdlib(env: Environment, options: StdlibOptions = {}): void {
  const outputHandler = options.output || ((msg: string) => console.log(msg));
  const inputHandler = options.input;

  // Register I/O functions
  const ioFunctions = createIOFunctions(outputHandler, inputHandler);
  for (const fn of ioFunctions) {
    env.define(fn.name, fn);
  }

  // Register math functions
  for (const fn of mathFunctions) {
    env.define(fn.name, fn);
  }

  // Register math constants
  for (const [name, value] of Object.entries(mathConstants)) {
    env.define(name, createNumber(value), true); // constants
  }

  // Register string functions
  for (const fn of stringFunctions) {
    env.define(fn.name, fn);
  }

  // Register array functions
  for (const fn of arrayFunctions) {
    env.define(fn.name, fn);
  }

  // Register type functions
  for (const fn of typeFunctions) {
    env.define(fn.name, fn);
  }

  // Register utility functions
  for (const fn of utilFunctions) {
    env.define(fn.name, fn);
  }
}
