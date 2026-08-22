/**
 * Collections Standard Library Functions
 *
 * Provides Set and Map data structure operations for TinyLang programs.
 * Sets are backed by arrays with uniqueness enforcement.
 * Maps are backed by objects.
 */

import {
  RuntimeValue,
  NativeFunctionValue,
  createNumber,
  createBoolean,
  createNull,
  createArray,
  RuntimeError,
  valueEquals,
} from '../types/values';

export const collectionsFunctions: NativeFunctionValue[] = [
  // ============ Set Operations ============

  // Set_new() - Create a new empty set (backed by array)
  {
    type: 'native-function',
    name: 'Set_new',
    arity: 0,
    fn: () => {
      return createArray([]);
    },
  },

  // Set_add(set, value) - Add a value to the set (if not already present)
  {
    type: 'native-function',
    name: 'Set_add',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`Set_add() expects a set (array) as first argument, got ${args[0].type}`);
      }
      const set = args[0];
      const value = args[1];
      const exists = set.elements.some(el => valueEquals(el, value));
      if (!exists) {
        set.elements.push(value);
      }
      return set;
    },
  },

  // Set_has(set, value) - Check if a value exists in the set
  {
    type: 'native-function',
    name: 'Set_has',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`Set_has() expects a set (array) as first argument, got ${args[0].type}`);
      }
      const exists = args[0].elements.some(el => valueEquals(el, args[1]));
      return createBoolean(exists);
    },
  },

  // Set_remove(set, value) - Remove a value from the set
  {
    type: 'native-function',
    name: 'Set_remove',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`Set_remove() expects a set (array) as first argument, got ${args[0].type}`);
      }
      const set = args[0];
      const idx = set.elements.findIndex(el => valueEquals(el, args[1]));
      if (idx !== -1) {
        set.elements.splice(idx, 1);
      }
      return set;
    },
  },

  // Set_size(set) - Get the number of elements in the set
  {
    type: 'native-function',
    name: 'Set_size',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'array') {
        throw new RuntimeError(`Set_size() expects a set (array) as first argument, got ${args[0].type}`);
      }
      return createNumber(args[0].elements.length);
    },
  },

  // ============ Map Operations ============

  // Map_new() - Create a new empty map (backed by object)
  {
    type: 'native-function',
    name: 'Map_new',
    arity: 0,
    fn: () => {
      return { type: 'object' as const, properties: new Map<string, RuntimeValue>() };
    },
  },

  // Map_set(map, key, value) - Set a key-value pair in the map
  {
    type: 'native-function',
    name: 'Map_set',
    arity: 3,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`Map_set() expects a map (object) as first argument, got ${args[0].type}`);
      }
      if (args[1].type !== 'string') {
        throw new RuntimeError(`Map_set() expects a string key as second argument, got ${args[1].type}`);
      }
      args[0].properties.set(args[1].value, args[2]);
      return args[0];
    },
  },

  // Map_get(map, key) - Get the value for a key in the map
  {
    type: 'native-function',
    name: 'Map_get',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`Map_get() expects a map (object) as first argument, got ${args[0].type}`);
      }
      if (args[1].type !== 'string') {
        throw new RuntimeError(`Map_get() expects a string key as second argument, got ${args[1].type}`);
      }
      return args[0].properties.get(args[1].value) || createNull();
    },
  },

  // Map_has(map, key) - Check if a key exists in the map
  {
    type: 'native-function',
    name: 'Map_has',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`Map_has() expects a map (object) as first argument, got ${args[0].type}`);
      }
      if (args[1].type !== 'string') {
        throw new RuntimeError(`Map_has() expects a string key as second argument, got ${args[1].type}`);
      }
      return createBoolean(args[0].properties.has(args[1].value));
    },
  },

  // Map_delete(map, key) - Delete a key from the map
  {
    type: 'native-function',
    name: 'Map_delete',
    arity: 2,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`Map_delete() expects a map (object) as first argument, got ${args[0].type}`);
      }
      if (args[1].type !== 'string') {
        throw new RuntimeError(`Map_delete() expects a string key as second argument, got ${args[1].type}`);
      }
      args[0].properties.delete(args[1].value);
      return args[0];
    },
  },

  // Map_keys(map) - Get all keys in the map
  {
    type: 'native-function',
    name: 'Map_keys',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`Map_keys() expects a map (object) as first argument, got ${args[0].type}`);
      }
      const keys = Array.from(args[0].properties.keys()).map(k => ({ type: 'string' as const, value: k }));
      return createArray(keys);
    },
  },

  // Map_size(map) - Get the number of entries in the map
  {
    type: 'native-function',
    name: 'Map_size',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'object') {
        throw new RuntimeError(`Map_size() expects a map (object) as first argument, got ${args[0].type}`);
      }
      return createNumber(args[0].properties.size);
    },
  },
];
