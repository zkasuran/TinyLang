/**
 * Type Conversion & Inspection Functions
 * 
 * Provides type checking and conversion operations.
 */

import {
  NativeFunctionValue,
  createString,
  createNumber,
  createBoolean,
  RuntimeError,
  stringify,
} from '../types/values';

export const typeFunctions: NativeFunctionValue[] = [
  // type(value) - Get the type of a value as a string
  {
    type: 'native-function',
    name: 'type',
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

  // str(value) - Convert value to string
  {
    type: 'native-function',
    name: 'str',
    arity: 1,
    fn: (args) => createString(stringify(args[0])),
  },

  // num(value) - Convert value to number
  {
    type: 'native-function',
    name: 'num',
    arity: 1,
    fn: (args) => {
      const val = args[0];
      switch (val.type) {
        case 'number': return val;
        case 'string': {
          const n = Number(val.value);
          if (isNaN(n)) {
            throw new RuntimeError(
              `Cannot convert "${val.value}" to a number. The string must contain a valid number.`
            );
          }
          return createNumber(n);
        }
        case 'boolean': return createNumber(val.value ? 1 : 0);
        case 'null': return createNumber(0);
        default:
          throw new RuntimeError(
            `Cannot convert ${val.type} to a number. Only strings, booleans, and null can be converted.`
          );
      }
    },
  },

  // bool(value) - Convert value to boolean
  {
    type: 'native-function',
    name: 'bool',
    arity: 1,
    fn: (args) => {
      const val = args[0];
      switch (val.type) {
        case 'boolean': return val;
        case 'number': return createBoolean(val.value !== 0);
        case 'string': return createBoolean(val.value.length > 0);
        case 'null': return createBoolean(false);
        case 'array': return createBoolean(val.elements.length > 0);
        default: return createBoolean(true);
      }
    },
  },

  // isNumber(value) - Check if value is a number
  {
    type: 'native-function',
    name: 'isNumber',
    arity: 1,
    fn: (args) => createBoolean(args[0].type === 'number'),
  },

  // isString(value) - Check if value is a string
  {
    type: 'native-function',
    name: 'isString',
    arity: 1,
    fn: (args) => createBoolean(args[0].type === 'string'),
  },

  // isArray(value) - Check if value is an array
  {
    type: 'native-function',
    name: 'isArray',
    arity: 1,
    fn: (args) => createBoolean(args[0].type === 'array'),
  },

  // isNull(value) - Check if value is null
  {
    type: 'native-function',
    name: 'isNull',
    arity: 1,
    fn: (args) => createBoolean(args[0].type === 'null'),
  },

  // isFunction(value) - Check if value is a function
  {
    type: 'native-function',
    name: 'isFunction',
    arity: 1,
    fn: (args) => createBoolean(args[0].type === 'function' || args[0].type === 'native-function'),
  },
];
