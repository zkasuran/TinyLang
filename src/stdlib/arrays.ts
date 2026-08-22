/**
 * Array Standard Library Functions
 * 
 * Provides array manipulation operations for TinyLang programs.
 * Note: Many array operations are also available as methods (e.g., arr.push())
 */

import {
  RuntimeValue,
  NativeFunctionValue,
  createArray,
  createNumber,
  createNull,
  createBoolean,
  RuntimeError,
  valueEquals,
  stringify,
} from '../types/values';

export const arrayFunctions: NativeFunctionValue[] = [
  // push(array, value) - Add element to end
  {
    type: 'native-function',
    name: 'push',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`push() expects an array as first argument, got ${args[0].type}`);
      }
      args[0].elements.push(args[1]);
      return createNumber(args[0].elements.length);
    },
  },

  // pop(array) - Remove and return last element
  {
    type: 'native-function',
    name: 'pop',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`pop() expects an array argument, got ${args[0].type}`);
      }
      return args[0].elements.pop() || createNull();
    },
  },

  // shift(array) - Remove and return first element
  {
    type: 'native-function',
    name: 'shift',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`shift() expects an array argument, got ${args[0].type}`);
      }
      return args[0].elements.shift() || createNull();
    },
  },

  // unshift(array, value) - Add element to beginning
  {
    type: 'native-function',
    name: 'unshift',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`unshift() expects an array as first argument, got ${args[0].type}`);
      }
      args[0].elements.unshift(args[1]);
      return createNumber(args[0].elements.length);
    },
  },

  // slice(array, start, end?) - Extract a section
  {
    type: 'native-function',
    name: 'slice',
    arity: -1,
    fn: (args) => {
      if (args.length < 1 || args[0].type !== 'array') {
        throw new RuntimeError(`slice() expects an array as first argument`);
      }
      const start = args.length > 1 && args[1].type === 'number' ? args[1].value : 0;
      const end = args.length > 2 && args[2].type === 'number' ? args[2].value : args[0].elements.length;
      return createArray(args[0].elements.slice(start, end));
    },
  },

  // concat(array1, array2) - Concatenate arrays
  {
    type: 'native-function',
    name: 'concat',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array' || args[1].type !== 'array') {
        throw new RuntimeError(`concat() expects two array arguments`);
      }
      return createArray([...args[0].elements, ...args[1].elements]);
    },
  },

  // indexOf(array, value) - Find index of element
  {
    type: 'native-function',
    name: 'indexOf',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`indexOf() expects an array as first argument, got ${args[0].type}`);
      }
      const idx = args[0].elements.findIndex(el => valueEquals(el, args[1]));
      return createNumber(idx);
    },
  },

  // includes(array, value) - Check if element exists
  {
    type: 'native-function',
    name: 'includes',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`includes() expects an array as first argument, got ${args[0].type}`);
      }
      const found = args[0].elements.some(el => valueEquals(el, args[1]));
      return createBoolean(found);
    },
  },

  // reverse(array) - Return reversed copy
  {
    type: 'native-function',
    name: 'reverse',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`reverse() expects an array argument, got ${args[0].type}`);
      }
      return createArray([...args[0].elements].reverse());
    },
  },

  // sort(array) - Return sorted copy
  {
    type: 'native-function',
    name: 'sort',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`sort() expects an array argument, got ${args[0].type}`);
      }
      const sorted = [...args[0].elements].sort((a, b) => {
        if (a.type === 'number' && b.type === 'number') return a.value - b.value;
        return stringify(a).localeCompare(stringify(b));
      });
      return createArray(sorted);
    },
  },

  // flatten(array) - Flatten one level of nesting
  {
    type: 'native-function',
    name: 'flatten',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`flatten() expects an array argument, got ${args[0].type}`);
      }
      const flattened: RuntimeValue[] = [];
      for (const el of args[0].elements) {
        if (el.type === 'array') {
          flattened.push(...el.elements);
        } else {
          flattened.push(el);
        }
      }
      return createArray(flattened);
    },
  },

  // zip(array1, array2) - Combine two arrays into array of pairs
  {
    type: 'native-function',
    name: 'zip',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array' || args[1].type !== 'array') {
        throw new RuntimeError(`zip() expects two array arguments`);
      }
      const len = Math.min(args[0].elements.length, args[1].elements.length);
      const result: RuntimeValue[] = [];
      for (let i = 0; i < len; i++) {
        result.push(createArray([args[0].elements[i], args[1].elements[i]]));
      }
      return createArray(result);
    },
  },

  // enumerate(array) - Return array of [index, value] pairs
  {
    type: 'native-function',
    name: 'enumerate',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`enumerate() expects an array argument, got ${args[0].type}`);
      }
      const result = args[0].elements.map((el, i) =>
        createArray([createNumber(i), el])
      );
      return createArray(result);
    },
  },

  // unique(array) - Return array with duplicates removed
  {
    type: 'native-function',
    name: 'unique',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`unique() expects an array argument, got ${args[0].type}`);
      }
      const seen: RuntimeValue[] = [];
      const result: RuntimeValue[] = [];
      for (const el of args[0].elements) {
        if (!seen.some(s => valueEquals(s, el))) {
          seen.push(el);
          result.push(el);
        }
      }
      return createArray(result);
    },
  },
];
