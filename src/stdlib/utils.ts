/**
 * Utility Standard Library Functions
 * 
 * Provides general-purpose utility functions.
 */

import {
  RuntimeValue,
  NativeFunctionValue,
  createNumber,
  createArray,
  createString,
  createNull,
  createBoolean,
  RuntimeError,
  stringify,
} from '../types/values';

export const utilFunctions: NativeFunctionValue[] = [
  // range(start, end, step?) - Generate a range of numbers
  {
    type: 'native-function',
    name: 'range',
    arity: -1,
    fn: (args) => {
      if (args.length === 0) {
        throw new RuntimeError('range() requires at least 1 argument');
      }

      let start: number, end: number, step: number;

      if (args.length === 1) {
        if (args[0].type !== 'number') throw new RuntimeError('range() arguments must be numbers');
        start = 0;
        end = args[0].value;
        step = 1;
      } else if (args.length === 2) {
        if (args[0].type !== 'number' || args[1].type !== 'number') {
          throw new RuntimeError('range() arguments must be numbers');
        }
        start = args[0].value;
        end = args[1].value;
        step = start <= end ? 1 : -1;
      } else {
        if (args[0].type !== 'number' || args[1].type !== 'number' || args[2].type !== 'number') {
          throw new RuntimeError('range() arguments must be numbers');
        }
        start = args[0].value;
        end = args[1].value;
        step = args[2].value;
        if (step === 0) {
          throw new RuntimeError('range() step cannot be zero (would create an infinite range)');
        }
      }

      const elements: RuntimeValue[] = [];
      if (step > 0) {
        for (let i = start; i < end; i += step) {
          elements.push(createNumber(i));
          if (elements.length > 10000) {
            throw new RuntimeError('range() too large! Maximum 10,000 elements.');
          }
        }
      } else {
        for (let i = start; i > end; i += step) {
          elements.push(createNumber(i));
          if (elements.length > 10000) {
            throw new RuntimeError('range() too large! Maximum 10,000 elements.');
          }
        }
      }

      return createArray(elements);
    },
  },

  // keys(object) - Get keys of an object
  {
    type: 'native-function',
    name: 'keys',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`keys() expects an object argument, got ${args[0].type}`);
      }
      return createArray(Array.from(args[0].properties.keys()).map(createString));
    },
  },

  // values(object) - Get values of an object
  {
    type: 'native-function',
    name: 'values',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`values() expects an object argument, got ${args[0].type}`);
      }
      return createArray(Array.from(args[0].properties.values()));
    },
  },

  // entries(object) - Get [key, value] pairs
  {
    type: 'native-function',
    name: 'entries',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`entries() expects an object argument, got ${args[0].type}`);
      }
      const pairs = Array.from(args[0].properties.entries()).map(([k, v]) =>
        createArray([createString(k), v])
      );
      return createArray(pairs);
    },
  },

  // time() - Current timestamp in milliseconds
  {
    type: 'native-function',
    name: 'time',
    arity: 0,
    fn: () => createNumber(Date.now()),
  },

  // clone(value) - Deep clone a value
  {
    type: 'native-function',
    name: 'clone',
    arity: 1,
    fn: (args) => {
      return deepClone(args[0]);
    },
  },

  // assert(condition, message?) - Assert a condition is true
  {
    type: 'native-function',
    name: 'assert',
    arity: -1,
    fn: (args) => {
      if (args.length === 0) {
        throw new RuntimeError('assert() requires at least 1 argument');
      }
      const condition = args[0];
      if (condition.type === 'boolean' && !condition.value ||
          condition.type === 'null' ||
          (condition.type === 'number' && condition.value === 0) ||
          (condition.type === 'string' && condition.value === '')) {
        const message = args.length > 1 ? stringify(args[1]) : 'Assertion failed';
        throw new RuntimeError(`Assertion Error: ${message}`);
      }
      return createBoolean(true);
    },
  },

  // format(template, ...args) - String formatting
  {
    type: 'native-function',
    name: 'format',
    arity: -1,
    fn: (args) => {
      if (args.length === 0 || args[0].type !== 'string') {
        throw new RuntimeError('format() expects a string template as first argument');
      }
      let template = args[0].value;
      for (let i = 1; i < args.length; i++) {
        template = template.replace('{}', stringify(args[i]));
      }
      return createString(template);
    },
  },

  // sleep(ms) - Synchronous delay (simplified for educational use)
  {
    type: 'native-function',
    name: 'sleep',
    arity: 1,
    fn: (_args) => {
      // In an educational context, we just acknowledge the call
      // Real sleep would block the event loop
      return createNull();
    },
  },

  // typeof(value) - Alias for type()
  {
    type: 'native-function',
    name: 'typeof',
    arity: 1,
    fn: (args) => {
      const val = args[0];
      switch (val.type) {
        case 'number': return createString('number');
        case 'string': return createString('string');
        case 'boolean': return createString('boolean');
        case 'null': return createString('null');
        case 'array': return createString('array');
        case 'object': return createString('object');
        case 'function':
        case 'native-function': return createString('function');
        case 'class': return createString('class');
        case 'instance': return createString('instance');
        default: return createString('unknown');
      }
    },
  },
];

function deepClone(value: RuntimeValue): RuntimeValue {
  switch (value.type) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'null':
      return value; // Primitives are immutable
    case 'array':
      return createArray(value.elements.map(deepClone));
    case 'object': {
      const props = new Map<string, RuntimeValue>();
      for (const [k, v] of value.properties) {
        props.set(k, deepClone(v));
      }
      return { type: 'object', properties: props };
    }
    default:
      return value; // Functions, classes, instances are reference types
  }
}
