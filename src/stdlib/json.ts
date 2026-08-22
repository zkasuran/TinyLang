/**
 * JSON Standard Library Functions
 *
 * Provides JSON parsing and stringification for TinyLang programs.
 */

import {
  RuntimeValue,
  NativeFunctionValue,
  createNumber,
  createString,
  createBoolean,
  createNull,
  createArray,
  RuntimeError,
  stringify,
} from '../types/values';

/**
 * Convert a JavaScript value (from JSON.parse) to a TinyLang RuntimeValue
 */
function jsToRuntime(value: unknown): RuntimeValue {
  if (value === null || value === undefined) {
    return createNull();
  }
  if (typeof value === 'number') {
    return createNumber(value);
  }
  if (typeof value === 'boolean') {
    return createBoolean(value);
  }
  if (typeof value === 'string') {
    return createString(value);
  }
  if (Array.isArray(value)) {
    return createArray(value.map(jsToRuntime));
  }
  if (typeof value === 'object') {
    const props = new Map<string, RuntimeValue>();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      props.set(k, jsToRuntime(v));
    }
    return { type: 'object', properties: props };
  }
  return createNull();
}

/**
 * Convert a TinyLang RuntimeValue to a plain JavaScript value for JSON.stringify
 */
function runtimeToJs(value: RuntimeValue): unknown {
  switch (value.type) {
    case 'number':
      return value.value;
    case 'string':
      return value.value;
    case 'boolean':
      return value.value;
    case 'null':
      return null;
    case 'array':
      return value.elements.map(runtimeToJs);
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of value.properties) {
        obj[k] = runtimeToJs(v);
      }
      return obj;
    }
    default:
      return stringify(value);
  }
}

export const jsonFunctions: NativeFunctionValue[] = [
  // jsonParse(str) - Parse a JSON string into a TinyLang value
  {
    type: 'native-function',
    name: 'jsonParse',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'string') {
        throw new RuntimeError(`jsonParse() expects a string argument, got ${args[0].type}`);
      }
      try {
        const parsed = JSON.parse(args[0].value);
        return jsToRuntime(parsed);
      } catch (e) {
        throw new RuntimeError(
          `jsonParse() failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
  },

  // jsonStringify(value, indent?) - Convert a TinyLang value to JSON string
  {
    type: 'native-function',
    name: 'jsonStringify',
    arity: -1,
    fn: (args) => {
      if (args.length === 0) {
        throw new RuntimeError('jsonStringify() requires at least 1 argument');
      }
      const jsValue = runtimeToJs(args[0]);
      const indent = args.length > 1 && args[1].type === 'number'
        ? args[1].value
        : undefined;
      try {
        return createString(JSON.stringify(jsValue, null, indent));
      } catch (e) {
        throw new RuntimeError(
          `jsonStringify() failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
  },
];
