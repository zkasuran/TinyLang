/**
 * Crypto Standard Library Functions
 *
 * Provides hashing, base64 and UUID helpers for TinyLang programs.
 *
 * These are built on the platform-independent primitives in ./digest, not on
 * node:crypto. The Node-only `import * as crypto from 'crypto'` and `Buffer`
 * this module used to rely on made the interpreter impossible to bundle for the
 * Web IDE (esbuild: 'Could not resolve "crypto"'), so the shipped playground
 * silently went stale. Everything here now behaves identically under Node and
 * in the browser.
 *
 * hash() supports sha256 (the default) and md5. Any other algorithm is
 * rejected by name rather than silently falling back to one of these.
 */

import {
  NativeFunctionValue,
  createString,
  RuntimeError,
} from '../types/values';
import {
  sha256,
  md5,
  base64Encode as encodeBase64,
  base64Decode as decodeBase64,
  randomUUID as generateUUID,
} from './digest';

/** Hash algorithms this module implements, by their canonical lowercase name. */
const ALGORITHMS: Record<string, (input: string) => string> = {
  sha256,
  md5,
};

export const cryptoFunctions: NativeFunctionValue[] = [
  // randomUUID() - Generate a random UUID v4
  {
    type: 'native-function',
    name: 'randomUUID',
    arity: 0,
    fn: () => createString(generateUUID()),
  },

  // hash(str, algo?) - Hash a string with the given algorithm (default: sha256)
  {
    type: 'native-function',
    name: 'hash',
    arity: -1,
    fn: (args) => {
      if (args.length === 0 || args[0].type !== 'string') {
        throw new RuntimeError('hash() expects a string as first argument');
      }

      const requested =
        args.length > 1 && args[1].type === 'string' ? args[1].value : 'sha256';
      const algorithm = ALGORITHMS[requested.toLowerCase()];

      if (!algorithm) {
        // Naming the supported set is more useful than a generic failure, and
        // far better than quietly hashing with a different algorithm.
        throw new RuntimeError(
          `hash() does not support '${requested}'. Supported algorithms: ` +
            `${Object.keys(ALGORITHMS).sort().join(', ')}.`
        );
      }

      return createString(algorithm(args[0].value));
    },
  },

  // base64Encode(str) - Base64 encode a string
  {
    type: 'native-function',
    name: 'base64Encode',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'string') {
        throw new RuntimeError(
          `base64Encode() expects a string argument, got ${args[0].type}`
        );
      }
      return createString(encodeBase64(args[0].value));
    },
  },

  // base64Decode(str) - Base64 decode a string
  {
    type: 'native-function',
    name: 'base64Decode',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'string') {
        throw new RuntimeError(
          `base64Decode() expects a string argument, got ${args[0].type}`
        );
      }
      try {
        return createString(decodeBase64(args[0].value));
      } catch (e) {
        throw new RuntimeError(
          `base64Decode() failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
  },
];
