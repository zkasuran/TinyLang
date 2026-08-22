/**
 * Math Standard Library Functions
 * 
 * Provides mathematical operations for TinyLang programs.
 */

import {
  RuntimeValue,
  NativeFunctionValue,
  createNumber,
  createNull,
  RuntimeError,
} from '../types/values';

function expectNumber(value: RuntimeValue, fnName: string): number {
  if (value.type !== 'number') {
    throw new RuntimeError(`${fnName}() expects a number argument, got ${value.type}`);
  }
  return value.value;
}

export const mathFunctions: NativeFunctionValue[] = [
  // abs(n) - Absolute value
  {
    type: 'native-function',
    name: 'abs',
    arity: 1,
    fn: (args) => createNumber(Math.abs(expectNumber(args[0], 'abs'))),
  },

  // floor(n) - Round down
  {
    type: 'native-function',
    name: 'floor',
    arity: 1,
    fn: (args) => createNumber(Math.floor(expectNumber(args[0], 'floor'))),
  },

  // ceil(n) - Round up
  {
    type: 'native-function',
    name: 'ceil',
    arity: 1,
    fn: (args) => createNumber(Math.ceil(expectNumber(args[0], 'ceil'))),
  },

  // round(n) - Round to nearest integer
  {
    type: 'native-function',
    name: 'round',
    arity: 1,
    fn: (args) => createNumber(Math.round(expectNumber(args[0], 'round'))),
  },

  // sqrt(n) - Square root
  {
    type: 'native-function',
    name: 'sqrt',
    arity: 1,
    fn: (args) => {
      const n = expectNumber(args[0], 'sqrt');
      if (n < 0) {
        throw new RuntimeError(`sqrt() cannot be called with a negative number (${n}). Square roots of negative numbers are not real numbers.`);
      }
      return createNumber(Math.sqrt(n));
    },
  },

  // pow(base, exp) - Power/exponentiation
  {
    type: 'native-function',
    name: 'pow',
    arity: 2,
    fn: (args) => {
      const base = expectNumber(args[0], 'pow');
      const exp = expectNumber(args[1], 'pow');
      return createNumber(Math.pow(base, exp));
    },
  },

  // random() - Random number between 0 and 1
  {
    type: 'native-function',
    name: 'random',
    arity: 0,
    fn: () => createNumber(Math.random()),
  },

  // randomInt(min, max) - Random integer in [min, max]
  {
    type: 'native-function',
    name: 'randomInt',
    arity: 2,
    fn: (args) => {
      const min = Math.ceil(expectNumber(args[0], 'randomInt'));
      const max = Math.floor(expectNumber(args[1], 'randomInt'));
      return createNumber(Math.floor(Math.random() * (max - min + 1)) + min);
    },
  },

  // min(...args) - Minimum value
  {
    type: 'native-function',
    name: 'min',
    arity: -1,
    fn: (args) => {
      if (args.length === 0) return createNull() as RuntimeValue;
      if (args.length === 1 && args[0].type === 'array') {
        const nums = args[0].elements.map((el, i) => expectNumber(el, `min[${i}]`));
        return createNumber(Math.min(...nums));
      }
      const nums = args.map((a, i) => expectNumber(a, `min arg ${i}`));
      return createNumber(Math.min(...nums));
    },
  },

  // max(...args) - Maximum value
  {
    type: 'native-function',
    name: 'max',
    arity: -1,
    fn: (args) => {
      if (args.length === 0) return createNull() as RuntimeValue;
      if (args.length === 1 && args[0].type === 'array') {
        const nums = args[0].elements.map((el, i) => expectNumber(el, `max[${i}]`));
        return createNumber(Math.max(...nums));
      }
      const nums = args.map((a, i) => expectNumber(a, `max arg ${i}`));
      return createNumber(Math.max(...nums));
    },
  },

  // sin(n), cos(n), tan(n) - Trigonometry
  {
    type: 'native-function',
    name: 'sin',
    arity: 1,
    fn: (args) => createNumber(Math.sin(expectNumber(args[0], 'sin'))),
  },
  {
    type: 'native-function',
    name: 'cos',
    arity: 1,
    fn: (args) => createNumber(Math.cos(expectNumber(args[0], 'cos'))),
  },
  {
    type: 'native-function',
    name: 'tan',
    arity: 1,
    fn: (args) => createNumber(Math.tan(expectNumber(args[0], 'tan'))),
  },

  // log(n) - Natural logarithm
  {
    type: 'native-function',
    name: 'log',
    arity: 1,
    fn: (args) => {
      const n = expectNumber(args[0], 'log');
      if (n <= 0) {
        throw new RuntimeError(`log() requires a positive number, got ${n}`);
      }
      return createNumber(Math.log(n));
    },
  },
];

// Math constants to register as variables
export const mathConstants: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
  TAU: Math.PI * 2,
  INFINITY: Infinity,
};
