/**
 * TinyLang Bytecode Optimizer
 *
 * Performs optimization passes on compiled bytecode:
 * - Constant folding: evaluate constant expressions at compile time
 * - Dead code elimination: remove unreachable code after RETURN/JMP
 * - Peephole optimizations: simplify instruction sequences
 */

import { Chunk } from './chunk';
import { OpCode } from './opcodes';
import {
  RuntimeValue,
  NumberValue,
  StringValue,
  BooleanValue,
  createNumber,
  createString,
  createBoolean,
} from '../types/values';

/**
 * Optimize a bytecode chunk, returning a new optimized chunk
 */
export function optimize(chunk: Chunk): Chunk {
  let result = constantFolding(chunk);
  result = deadCodeElimination(result);
  result = peepholeOptimize(result);
  return result;
}

/**
 * Constant folding: replace sequences like CONST a, CONST b, ADD
 * with a single CONST (a+b) when both operands are compile-time constants.
 */
function constantFolding(chunk: Chunk): Chunk {
  const newChunk = new Chunk(chunk.name);
  newChunk.constants = [...chunk.constants];

  let i = 0;
  while (i < chunk.code.length) {
    // Look for pattern: CONST idx1, CONST idx2, <arithmetic op>
    if (
      i + 6 < chunk.code.length &&
      chunk.code[i] === OpCode.CONST &&
      chunk.code[i + 3] === OpCode.CONST
    ) {
      const idx1 = (chunk.code[i + 1] << 8) | chunk.code[i + 2];
      const idx2 = (chunk.code[i + 4] << 8) | chunk.code[i + 5];
      const op = chunk.code[i + 6];
      const val1 = chunk.constants[idx1];
      const val2 = chunk.constants[idx2];

      const folded = tryFoldBinary(val1, val2, op);
      if (folded !== null) {
        const newIdx = newChunk.constants.length;
        newChunk.constants.push(folded);
        const line = chunk.lines[i];
        newChunk.write(OpCode.CONST, line);
        newChunk.write16(newIdx, line);
        i += 7; // Skip past CONST, CONST, OP
        continue;
      }
    }

    // Look for pattern: CONST idx, NEGATE (for negative numbers)
    if (
      i + 3 < chunk.code.length &&
      chunk.code[i] === OpCode.CONST &&
      chunk.code[i + 3] === OpCode.NEGATE
    ) {
      const idx = (chunk.code[i + 1] << 8) | chunk.code[i + 2];
      const val = chunk.constants[idx];
      if (val && val.type === 'number') {
        const newIdx = newChunk.constants.length;
        newChunk.constants.push(createNumber(-val.value));
        const line = chunk.lines[i];
        newChunk.write(OpCode.CONST, line);
        newChunk.write16(newIdx, line);
        i += 4; // Skip CONST + NEGATE
        continue;
      }
    }

    // Look for pattern: CONST idx, NOT (for boolean negation)
    if (
      i + 3 < chunk.code.length &&
      chunk.code[i] === OpCode.CONST &&
      chunk.code[i + 3] === OpCode.NOT
    ) {
      const idx = (chunk.code[i + 1] << 8) | chunk.code[i + 2];
      const val = chunk.constants[idx];
      if (val && val.type === 'boolean') {
        const newIdx = newChunk.constants.length;
        newChunk.constants.push(createBoolean(!val.value));
        const line = chunk.lines[i];
        newChunk.write(OpCode.CONST, line);
        newChunk.write16(newIdx, line);
        i += 4; // Skip CONST + NOT
        continue;
      }
    }

    // No optimization possible, copy instruction
    newChunk.write(chunk.code[i], chunk.lines[i]);
    i++;
  }

  return newChunk;
}

/**
 * Dead code elimination: remove code after unconditional RETURN or JMP
 * that is not a jump target.
 */
function deadCodeElimination(chunk: Chunk): Chunk {
  // First, collect all jump targets
  const jumpTargets = new Set<number>();
  let i = 0;
  while (i < chunk.code.length) {
    const op = chunk.code[i];
    switch (op) {
      case OpCode.JMP:
      case OpCode.JMP_IF_FALSE:
      case OpCode.JMP_IF_TRUE:
      case OpCode.LOOP: {
        const target = (chunk.code[i + 1] << 8) | chunk.code[i + 2];
        jumpTargets.add(target);
        i += 3;
        break;
      }
      case OpCode.CONST:
      case OpCode.LOAD_LOCAL:
      case OpCode.STORE_LOCAL:
      case OpCode.LOAD_GLOBAL:
      case OpCode.STORE_GLOBAL:
      case OpCode.LOAD_UPVALUE:
      case OpCode.STORE_UPVALUE:
      case OpCode.CALL:
      case OpCode.CLOSURE:
      case OpCode.ARRAY:
      case OpCode.OBJECT:
      case OpCode.PRINT:
      case OpCode.NEW_INSTANCE:
      case OpCode.CLASS:
      case OpCode.METHOD:
      case OpCode.GET_PROP:
      case OpCode.SET_PROP:
        i += 3;
        break;
      default:
        i += 1;
        break;
    }
  }

  // Now eliminate dead code
  const newChunk = new Chunk(chunk.name);
  newChunk.constants = [...chunk.constants];

  let dead = false;
  i = 0;
  while (i < chunk.code.length) {
    // If this is a jump target, code is reachable again
    if (jumpTargets.has(i)) {
      dead = false;
    }

    if (dead) {
      // Skip this instruction
      const op = chunk.code[i];
      i += instructionSize(op);
      continue;
    }

    const op = chunk.code[i];

    // Copy instruction
    const size = instructionSize(op);
    for (let j = 0; j < size; j++) {
      newChunk.write(chunk.code[i + j], chunk.lines[i + j]);
    }

    // After RETURN or unconditional JMP, mark as dead
    if (op === OpCode.RETURN || op === OpCode.JMP) {
      dead = true;
    }

    i += size;
  }

  return newChunk;
}

/**
 * Peephole optimizations: simplify short instruction sequences
 */
function peepholeOptimize(chunk: Chunk): Chunk {
  const newChunk = new Chunk(chunk.name);
  newChunk.constants = [...chunk.constants];

  let i = 0;
  while (i < chunk.code.length) {
    // Pattern: PUSH, POP -> remove both (if no side effects)
    if (
      i + 3 < chunk.code.length &&
      chunk.code[i] === OpCode.CONST &&
      chunk.code[i + 3] === OpCode.POP
    ) {
      i += 4; // Skip both
      continue;
    }

    // Pattern: DUP, POP -> nothing
    if (
      i + 1 < chunk.code.length &&
      chunk.code[i] === OpCode.DUP &&
      chunk.code[i + 1] === OpCode.POP
    ) {
      i += 2;
      continue;
    }

    // No optimization, copy instruction
    const op = chunk.code[i];
    const size = instructionSize(op);
    for (let j = 0; j < size; j++) {
      newChunk.write(chunk.code[i + j], chunk.lines[i + j]);
    }
    i += size;
  }

  return newChunk;
}

/**
 * Try to fold a binary operation on two constant values
 */
function tryFoldBinary(a: RuntimeValue, b: RuntimeValue, op: number): RuntimeValue | null {
  if (a.type === 'number' && b.type === 'number') {
    const av = (a as NumberValue).value;
    const bv = (b as NumberValue).value;
    switch (op) {
      case OpCode.ADD: return createNumber(av + bv);
      case OpCode.SUB: return createNumber(av - bv);
      case OpCode.MUL: return createNumber(av * bv);
      case OpCode.DIV: return bv !== 0 ? createNumber(av / bv) : null;
      case OpCode.MOD: return createNumber(av % bv);
      case OpCode.POW: return createNumber(Math.pow(av, bv));
      case OpCode.EQ: return createBoolean(av === bv);
      case OpCode.NEQ: return createBoolean(av !== bv);
      case OpCode.LT: return createBoolean(av < bv);
      case OpCode.LTE: return createBoolean(av <= bv);
      case OpCode.GT: return createBoolean(av > bv);
      case OpCode.GTE: return createBoolean(av >= bv);
    }
  }
  if (a.type === 'string' && b.type === 'string' && op === OpCode.ADD) {
    return createString((a as StringValue).value + (b as StringValue).value);
  }
  if (a.type === 'boolean' && b.type === 'boolean') {
    const av = (a as BooleanValue).value;
    const bv = (b as BooleanValue).value;
    switch (op) {
      case OpCode.EQ: return createBoolean(av === bv);
      case OpCode.NEQ: return createBoolean(av !== bv);
    }
  }
  return null;
}

/**
 * Get the total byte size of an instruction (opcode + operands)
 */
function instructionSize(op: number): number {
  switch (op) {
    case OpCode.CONST:
    case OpCode.LOAD_LOCAL:
    case OpCode.STORE_LOCAL:
    case OpCode.LOAD_GLOBAL:
    case OpCode.STORE_GLOBAL:
    case OpCode.LOAD_UPVALUE:
    case OpCode.STORE_UPVALUE:
    case OpCode.JMP:
    case OpCode.JMP_IF_FALSE:
    case OpCode.JMP_IF_TRUE:
    case OpCode.LOOP:
    case OpCode.CALL:
    case OpCode.CLOSURE:
    case OpCode.ARRAY:
    case OpCode.OBJECT:
    case OpCode.PRINT:
    case OpCode.NEW_INSTANCE:
    case OpCode.CLASS:
    case OpCode.METHOD:
    case OpCode.GET_PROP:
    case OpCode.SET_PROP:
      return 3;
    default:
      return 1;
  }
}
