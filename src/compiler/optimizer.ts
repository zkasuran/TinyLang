/**
 * TinyLang Bytecode Optimizer
 *
 * Performs optimization passes on compiled bytecode:
 * - Constant folding: evaluate constant expressions at compile time
 * - Dead code elimination: remove unreachable code after RETURN/JMP
 * - Peephole optimizations: simplify instruction sequences
 *
 * Every pass here changes how many bytes the code occupies, and TinyLang jump
 * operands are *absolute* addresses. So the passes never rewrite bytes in
 * place: they decode the chunk into a list of instructions, transform that
 * list, and re-encode it while remapping every address operand. Editing the
 * byte array directly silently corrupted control flow, because removing or
 * shortening an instruction shifted every later address while the jumps
 * pointing at them kept their old values.
 */

import { Chunk } from './chunk';
import type { CompiledFunction } from './compiler';
import { OpCode, instructionSize, hasAddressOperand } from './opcodes';
import {
  RuntimeValue,
  NumberValue,
  StringValue,
  BooleanValue,
  createNumber,
  createString,
  createBoolean,
} from '../types/values';

/** A decoded instruction. */
interface Instruction {
  /** Offset in the original chunk. Used to remap jump targets. */
  offset: number;
  op: number;
  /** 16-bit operand, or undefined for operand-less opcodes. */
  operand?: number;
  line: number;
}

/**
 * Optimize a bytecode chunk, returning a new optimized chunk
 */
export function optimize(chunk: Chunk): Chunk {
  // Optimize nested function bodies too, into fresh CompiledFunction objects so
  // the returned chunk shares no mutable state with the input. Previously the
  // constant pool was copied by reference, which meant function and method
  // bodies came out byte-identical: everything below the top level went
  // unoptimized, and the two chunks aliased the same function objects.
  const constants = chunk.constants.map((constant) => {
    const fn = constant as CompiledFunction | undefined;
    if (fn && fn.type === 'compiled-function') {
      return { ...fn, chunk: optimize(fn.chunk) };
    }
    return constant;
  });

  let instructions = decode(chunk);

  instructions = constantFolding(instructions, constants);
  instructions = deadCodeElimination(instructions);
  instructions = peepholeOptimize(instructions);

  return encode(chunk.name, instructions, constants, chunk.code.length);
}

/**
 * Decode a chunk into instructions, stepping by instruction rather than by
 * byte so operand bytes are never mistaken for opcodes.
 */
function decode(chunk: Chunk): Instruction[] {
  const instructions: Instruction[] = [];
  let offset = 0;
  while (offset < chunk.code.length) {
    const op = chunk.code[offset];
    const size = instructionSize(op);
    instructions.push({
      offset,
      op,
      operand: size === 3 ? chunk.read16(offset + 1) : undefined,
      line: chunk.lines[offset],
    });
    offset += size;
  }
  return instructions;
}

/**
 * Re-encode instructions, remapping every absolute address operand from old
 * offsets to new ones.
 *
 * @param originalLength Length of the original code, so a jump to the very end
 *   of the chunk still resolves.
 */
function encode(
  name: string,
  instructions: Instruction[],
  constants: RuntimeValue[],
  originalLength: number
): Chunk {
  // Where each surviving instruction will land.
  const newOffsets = new Map<number, number>();
  let cursor = 0;
  for (const instr of instructions) {
    newOffsets.set(instr.offset, cursor);
    cursor += instructionSize(instr.op);
  }

  // An address may point at an instruction that was removed, or at the end of
  // the chunk. Resolve it to the next surviving instruction, walking backwards
  // so every old offset gets an answer.
  const remap = new Map<number, number>();
  let next = cursor;
  for (let offset = originalLength; offset >= 0; offset--) {
    if (newOffsets.has(offset)) {
      next = newOffsets.get(offset)!;
    }
    remap.set(offset, next);
  }

  const chunk = new Chunk(name);
  chunk.constants = constants;
  for (const instr of instructions) {
    chunk.write(instr.op, instr.line);
    if (instr.operand !== undefined) {
      const operand = hasAddressOperand(instr.op)
        ? remap.get(instr.operand) ?? instr.operand
        : instr.operand;
      chunk.write16(operand, instr.line);
    }
  }
  return chunk;
}

/** Offsets that some jump points at; these must not be folded away. */
function jumpTargets(instructions: Instruction[]): Set<number> {
  const targets = new Set<number>();
  for (const instr of instructions) {
    if (hasAddressOperand(instr.op) && instr.operand !== undefined) {
      targets.add(instr.operand);
    }
  }
  return targets;
}

/**
 * Constant folding: replace sequences like CONST a, CONST b, ADD
 * with a single CONST (a+b) when both operands are compile-time constants.
 *
 * The folded instruction keeps the first CONST's offset so jumps to it stay
 * valid. A triple is left alone if anything jumps into the middle of it.
 */
function constantFolding(
  instructions: Instruction[],
  constants: RuntimeValue[]
): Instruction[] {
  const targets = jumpTargets(instructions);
  const result: Instruction[] = [];

  let i = 0;
  while (i < instructions.length) {
    const first = instructions[i];
    const second = instructions[i + 1];
    const third = instructions[i + 2];

    // CONST, CONST, <binary op>
    if (
      second &&
      third &&
      first.op === OpCode.CONST &&
      second.op === OpCode.CONST &&
      !targets.has(second.offset) &&
      !targets.has(third.offset)
    ) {
      const folded = tryFoldBinary(
        constants[first.operand!],
        constants[second.operand!],
        third.op
      );
      if (folded !== null) {
        constants.push(folded);
        result.push({
          offset: first.offset,
          op: OpCode.CONST,
          operand: constants.length - 1,
          line: first.line,
        });
        i += 3;
        continue;
      }
    }

    // CONST, NEGATE / NOT
    if (
      second &&
      first.op === OpCode.CONST &&
      (second.op === OpCode.NEGATE || second.op === OpCode.NOT) &&
      !targets.has(second.offset)
    ) {
      const value = constants[first.operand!];
      const folded = tryFoldUnary(value, second.op);
      if (folded !== null) {
        constants.push(folded);
        result.push({
          offset: first.offset,
          op: OpCode.CONST,
          operand: constants.length - 1,
          line: first.line,
        });
        i += 2;
        continue;
      }
    }

    result.push(first);
    i++;
  }

  return result;
}

/**
 * Dead code elimination: remove code after unconditional RETURN or JMP
 * that is not a jump target.
 */
function deadCodeElimination(instructions: Instruction[]): Instruction[] {
  const targets = jumpTargets(instructions);
  const result: Instruction[] = [];

  let dead = false;
  for (const instr of instructions) {
    // A jump target is reachable again.
    if (targets.has(instr.offset)) {
      dead = false;
    }

    if (dead) {
      continue;
    }

    result.push(instr);

    if (
      instr.op === OpCode.RETURN ||
      instr.op === OpCode.JMP ||
      instr.op === OpCode.LOOP ||
      instr.op === OpCode.THROW ||
      instr.op === OpCode.HALT
    ) {
      dead = true;
    }
  }

  return result;
}

/**
 * Peephole optimizations: simplify short instruction sequences
 */
function peepholeOptimize(instructions: Instruction[]): Instruction[] {
  const targets = jumpTargets(instructions);
  const result: Instruction[] = [];

  let i = 0;
  while (i < instructions.length) {
    const first = instructions[i];
    const second = instructions[i + 1];

    // Pushing a constant and immediately discarding it has no effect.
    // Skipped when either instruction is jumped to, so no address is lost.
    if (
      second &&
      second.op === OpCode.POP &&
      (first.op === OpCode.CONST || first.op === OpCode.DUP) &&
      !targets.has(first.offset) &&
      !targets.has(second.offset)
    ) {
      i += 2;
      continue;
    }

    result.push(first);
    i++;
  }

  return result;
}

/**
 * Try to fold a binary operation on two constant values.
 *
 * Returns null (declining to fold) for anything it cannot prove safe, including
 * operands that are absent from the constant pool.
 */
function tryFoldBinary(
  a: RuntimeValue | undefined,
  b: RuntimeValue | undefined,
  op: number
): RuntimeValue | null {
  if (a === undefined || b === undefined) {
    return null;
  }

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

/** Try to fold NEGATE or NOT applied to a constant. */
function tryFoldUnary(
  value: RuntimeValue | undefined,
  op: number
): RuntimeValue | null {
  if (value === undefined) {
    return null;
  }
  if (op === OpCode.NEGATE && value.type === 'number') {
    return createNumber(-(value as NumberValue).value);
  }
  if (op === OpCode.NOT && value.type === 'boolean') {
    return createBoolean(!(value as BooleanValue).value);
  }
  return null;
}
