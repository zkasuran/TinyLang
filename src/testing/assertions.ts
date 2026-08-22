/**
 * TinyLang Test Assertions
 *
 * Provides assertion native functions for use inside test blocks.
 */

import {
  NativeFunctionValue,
  RuntimeValue,
  RuntimeError,
  isTruthy,
  stringify,
} from '../types/values';

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

function createAssertionFn(
  name: string,
  arity: number,
  fn: (args: RuntimeValue[]) => RuntimeValue
): NativeFunctionValue {
  return {
    type: 'native-function',
    name,
    arity,
    fn: (args) => fn(args),
  };
}

export const assertionFunctions: NativeFunctionValue[] = [
  createAssertionFn('expectToBe', 2, (args) => {
    const [actual, expected] = args;
    if (!valuesEqual(actual, expected)) {
      throw new AssertionError(
        `Expected ${stringify(actual)} to be ${stringify(expected)}`
      );
    }
    return { type: 'null', value: null };
  }),

  createAssertionFn('expectToBeGreaterThan', 2, (args) => {
    const [actual, n] = args;
    if (actual.type !== 'number' || n.type !== 'number') {
      throw new AssertionError(
        `expectToBeGreaterThan requires numbers, got ${actual.type} and ${n.type}`
      );
    }
    if (!(actual.value > n.value)) {
      throw new AssertionError(
        `Expected ${actual.value} to be greater than ${n.value}`
      );
    }
    return { type: 'null', value: null };
  }),

  createAssertionFn('expectToBeLessThan', 2, (args) => {
    const [actual, n] = args;
    if (actual.type !== 'number' || n.type !== 'number') {
      throw new AssertionError(
        `expectToBeLessThan requires numbers, got ${actual.type} and ${n.type}`
      );
    }
    if (!(actual.value < n.value)) {
      throw new AssertionError(
        `Expected ${actual.value} to be less than ${n.value}`
      );
    }
    return { type: 'null', value: null };
  }),

  createAssertionFn('expectToContain', 2, (args) => {
    const [haystack, needle] = args;
    if (haystack.type === 'array') {
      const found = haystack.elements.some(el => valuesEqual(el, needle));
      if (!found) {
        throw new AssertionError(
          `Expected ${stringify(haystack)} to contain ${stringify(needle)}`
        );
      }
    } else if (haystack.type === 'string' && needle.type === 'string') {
      if (!haystack.value.includes(needle.value)) {
        throw new AssertionError(
          `Expected "${haystack.value}" to contain "${needle.value}"`
        );
      }
    } else {
      throw new AssertionError(
        `expectToContain requires an array or string as first argument, got ${haystack.type}`
      );
    }
    return { type: 'null', value: null };
  }),

  createAssertionFn('expectToBeNull', 1, (args) => {
    const [actual] = args;
    if (actual.type !== 'null') {
      throw new AssertionError(
        `Expected ${stringify(actual)} to be null`
      );
    }
    return { type: 'null', value: null };
  }),

  createAssertionFn('expectToBeTrue', 1, (args) => {
    const [actual] = args;
    if (!isTruthy(actual)) {
      throw new AssertionError(
        `Expected ${stringify(actual)} to be truthy`
      );
    }
    return { type: 'null', value: null };
  }),

  createAssertionFn('expectToBeFalse', 1, (args) => {
    const [actual] = args;
    if (isTruthy(actual)) {
      throw new AssertionError(
        `Expected ${stringify(actual)} to be falsy`
      );
    }
    return { type: 'null', value: null };
  }),

  createAssertionFn('expectToThrow', 1, (args) => {
    const [fn] = args;
    if (fn.type !== 'function' && fn.type !== 'native-function') {
      throw new AssertionError(
        `expectToThrow requires a function argument, got ${fn.type}`
      );
    }
    // We cannot easily invoke a TinyLang function here from a native function,
    // so we use a special mechanism: wrap in try/catch via the runtime
    // For native functions, we can call them directly
    if (fn.type === 'native-function') {
      try {
        fn.fn([], null as never);
        throw new AssertionError('Expected function to throw, but it did not');
      } catch (e) {
        if (e instanceof AssertionError && e.message === 'Expected function to throw, but it did not') {
          throw e;
        }
        // It threw - that's what we wanted
        return { type: 'null', value: null };
      }
    }
    // For regular functions, we need interpreter help - done via a wrapper
    // The test runner handles this by providing a special implementation
    throw new RuntimeError(
      'expectToThrow with TinyLang functions requires the test runner context'
    );
  }),
];

function valuesEqual(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'null': return true;
    case 'number': return a.value === (b as typeof a).value;
    case 'string': return a.value === (b as typeof a).value;
    case 'boolean': return a.value === (b as typeof a).value;
    case 'array': {
      const bArr = b as typeof a;
      if (a.elements.length !== bArr.elements.length) return false;
      return a.elements.every((el, i) => valuesEqual(el, bArr.elements[i]));
    }
    default: return a === b;
  }
}
