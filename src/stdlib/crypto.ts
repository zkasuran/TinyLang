/**
 * Crypto Standard Library Functions
 *
 * Provides cryptographic utilities for TinyLang programs.
 * Uses Node.js crypto module for hash operations.
 */

import {
  NativeFunctionValue,
  createString,
  RuntimeError,
} from '../types/values';
import * as crypto from 'crypto';

export const cryptoFunctions: NativeFunctionValue[] = [
  // randomUUID() - Generate a random UUID v4
  {
    type: 'native-function',
    name: 'randomUUID',
    arity: 0,
    fn: () => {
      return createString(crypto.randomUUID());
    },
  },

  // hash(str, algo?) - Hash a string with given algorithm (default: sha256)
  {
    type: 'native-function',
    name: 'hash',
    arity: -1,
    fn: (args) => {
      if (args.length === 0 || args[0].type !== 'string') {
        throw new RuntimeError('hash() expects a string as first argument');
      }
      const algo = args.length > 1 && args[1].type === 'string'
        ? args[1].value
        : 'sha256';
      try {
        const h = crypto.createHash(algo);
        h.update(args[0].value);
        return createString(h.digest('hex'));
      } catch (e) {
        throw new RuntimeError(
          `hash() failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
  },

  // base64Encode(str) - Base64 encode a string
  {
    type: 'native-function',
    name: 'base64Encode',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'string') {
        throw new RuntimeError(`base64Encode() expects a string argument, got ${args[0].type}`);
      }
      return createString(Buffer.from(args[0].value, 'utf-8').toString('base64'));
    },
  },

  // base64Decode(str) - Base64 decode a string
  {
    type: 'native-function',
    name: 'base64Decode',
    arity: 1,
    fn: (args) => {
      if (args[0].type !== 'string') {
        throw new RuntimeError(`base64Decode() expects a string argument, got ${args[0].type}`);
      }
      try {
        return createString(Buffer.from(args[0].value, 'base64').toString('utf-8'));
      } catch (e) {
        throw new RuntimeError(
          `base64Decode() failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
  },
];
