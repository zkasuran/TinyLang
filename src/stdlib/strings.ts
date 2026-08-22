/**
 * String Standard Library Functions
 * 
 * Provides string manipulation operations for TinyLang programs.
 * Note: Many string operations are also available as methods (e.g., str.upper())
 */

import {
  RuntimeValue,
  NativeFunctionValue,
  createString,
  createNumber,
  createArray,
  createBoolean,
  RuntimeError,
  stringify,
} from '../types/values';

function expectString(value: RuntimeValue, fnName: string): string {
  if (value.type !== 'string') {
    throw new RuntimeError(`${fnName}() expects a string argument, got ${value.type}`);
  }
  return value.value;
}

export const stringFunctions: NativeFunctionValue[] = [
  // len(value) - Get length of string or array
  {
    type: 'native-function',
    name: 'len',
    arity: 1,
    fn: (args) => {
      const val = args[0];
      if (val.type === 'string') return createNumber(val.value.length);
      if (val.type === 'array') return createNumber(val.elements.length);
      if (val.type === 'object') return createNumber(val.properties.size);
      throw new RuntimeError(`len() works with strings, arrays, and objects, but got ${val.type}`);
    },
  },

  // split(str, delimiter) - Split string into array
  {
    type: 'native-function',
    name: 'split',
    arity: 2,
    fn: (args) => {
      const str = expectString(args[0], 'split');
      const delim = expectString(args[1], 'split');
      return createArray(str.split(delim).map(createString));
    },
  },

  // join(array, delimiter) - Join array into string
  {
    type: 'native-function',
    name: 'join',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`join() expects an array as first argument, got ${args[0].type}`);
      }
      const delim = expectString(args[1], 'join');
      return createString(args[0].elements.map(stringify).join(delim));
    },
  },

  // upper(str) - Convert to uppercase
  {
    type: 'native-function',
    name: 'upper',
    arity: 1,
    fn: (args) => createString(expectString(args[0], 'upper').toUpperCase()),
  },

  // lower(str) - Convert to lowercase
  {
    type: 'native-function',
    name: 'lower',
    arity: 1,
    fn: (args) => createString(expectString(args[0], 'lower').toLowerCase()),
  },

  // trim(str) - Remove whitespace from both ends
  {
    type: 'native-function',
    name: 'trim',
    arity: 1,
    fn: (args) => createString(expectString(args[0], 'trim').trim()),
  },

  // contains(str, substr) - Check if string contains substring
  {
    type: 'native-function',
    name: 'contains',
    arity: 2,
    fn: (args) => {
      const str = expectString(args[0], 'contains');
      const substr = expectString(args[1], 'contains');
      return createBoolean(str.includes(substr));
    },
  },

  // replace(str, pattern, replacement) - Replace occurrences
  {
    type: 'native-function',
    name: 'replace',
    arity: 3,
    fn: (args) => {
      const str = expectString(args[0], 'replace');
      const pattern = expectString(args[1], 'replace');
      const replacement = expectString(args[2], 'replace');
      return createString(str.split(pattern).join(replacement));
    },
  },

  // charAt(str, index) - Get character at index
  {
    type: 'native-function',
    name: 'charAt',
    arity: 2,
    fn: (args) => {
      const str = expectString(args[0], 'charAt');
      if (args[1].type !== 'number') {
        throw new RuntimeError(`charAt() expects a number index, got ${args[1].type}`);
      }
      const idx = Math.floor(args[1].value);
      if (idx < 0 || idx >= str.length) return createString('');
      return createString(str[idx]);
    },
  },

  // startsWith(str, prefix) - Check if starts with
  {
    type: 'native-function',
    name: 'startsWith',
    arity: 2,
    fn: (args) => {
      const str = expectString(args[0], 'startsWith');
      const prefix = expectString(args[1], 'startsWith');
      return createBoolean(str.startsWith(prefix));
    },
  },

  // endsWith(str, suffix) - Check if ends with
  {
    type: 'native-function',
    name: 'endsWith',
    arity: 2,
    fn: (args) => {
      const str = expectString(args[0], 'endsWith');
      const suffix = expectString(args[1], 'endsWith');
      return createBoolean(str.endsWith(suffix));
    },
  },

  // repeat(str, count) - Repeat string
  {
    type: 'native-function',
    name: 'repeat',
    arity: 2,
    fn: (args) => {
      const str = expectString(args[0], 'repeat');
      if (args[1].type !== 'number') {
        throw new RuntimeError(`repeat() expects a number count, got ${args[1].type}`);
      }
      return createString(str.repeat(Math.max(0, Math.floor(args[1].value))));
    },
  },

  // padStart(str, length, padChar?) - Pad from start
  {
    type: 'native-function',
    name: 'padStart',
    arity: -1,
    fn: (args) => {
      if (args.length < 2) throw new RuntimeError('padStart() requires at least 2 arguments');
      const str = expectString(args[0], 'padStart');
      if (args[1].type !== 'number') throw new RuntimeError('padStart() second argument must be a number');
      const pad = args.length > 2 ? expectString(args[2], 'padStart') : ' ';
      return createString(str.padStart(args[1].value, pad));
    },
  },

  // padEnd(str, length, padChar?) - Pad from end
  {
    type: 'native-function',
    name: 'padEnd',
    arity: -1,
    fn: (args) => {
      if (args.length < 2) throw new RuntimeError('padEnd() requires at least 2 arguments');
      const str = expectString(args[0], 'padEnd');
      if (args[1].type !== 'number') throw new RuntimeError('padEnd() second argument must be a number');
      const pad = args.length > 2 ? expectString(args[2], 'padEnd') : ' ';
      return createString(str.padEnd(args[1].value, pad));
    },
  },
];
