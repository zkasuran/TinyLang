/**
 * TinyLang Bytecode Disassembler
 *
 * Produces a human-readable listing of bytecode instructions.
 * Shows offset, opcode name, operands, source line, and constant values.
 */

import { Chunk } from './chunk';
import { OpCode, opcodeName, instructionSize } from './opcodes';
import { stringify } from '../types/values';
import { CompiledFunction } from './compiler';
import type { ConstantValue } from './chunk';

/**
 * Disassemble an entire chunk into a human-readable string
 */
export function disassemble(chunk: Chunk, name?: string): string {
  const lines: string[] = [];
  const label = name || chunk.name || '<script>';
  lines.push(`== ${label} ==`);

  let offset = 0;
  let prevLine = -1;

  while (offset < chunk.code.length) {
    const result = disassembleInstruction(chunk, offset, prevLine);
    lines.push(result.text);
    prevLine = result.line;
    offset = result.nextOffset;
  }

  // Also disassemble any nested function chunks in the constant pool
  for (const constant of chunk.constants) {
    const fn = constant as unknown as CompiledFunction;
    if (fn && fn.type === 'compiled-function') {
      lines.push('');
      lines.push(disassemble(fn.chunk, fn.name));
    }
  }

  return lines.join('\n');
}

interface DisassembledInstruction {
  text: string;
  nextOffset: number;
  line: number;
}

function disassembleInstruction(
  chunk: Chunk,
  offset: number,
  prevLine: number
): DisassembledInstruction {
  const op = chunk.code[offset] as OpCode;
  const line = chunk.lines[offset];
  const lineStr = line === prevLine ? '   |' : String(line).padStart(4);

  const offsetStr = String(offset).padStart(4, '0');

  switch (op) {
    // Simple instructions (no operands)
    case OpCode.POP:
    case OpCode.DUP:
    case OpCode.DUP2:
    case OpCode.ADD:
    case OpCode.SUB:
    case OpCode.MUL:
    case OpCode.DIV:
    case OpCode.MOD:
    case OpCode.POW:
    case OpCode.NEGATE:
    case OpCode.EQ:
    case OpCode.NEQ:
    case OpCode.LT:
    case OpCode.LTE:
    case OpCode.GT:
    case OpCode.GTE:
    case OpCode.NOT:
    case OpCode.AND:
    case OpCode.OR:
    case OpCode.INDEX:
    case OpCode.INDEX_OPTIONAL:
    case OpCode.SET_INDEX:
    case OpCode.INHERIT:
    case OpCode.GET_THIS:
    case OpCode.CHECK_ITERABLE:
    case OpCode.ARRAY_APPEND:
    case OpCode.ARRAY_SPREAD:
    case OpCode.LOAD_ARGC:
    case OpCode.TRY_END:
    case OpCode.THROW:
    case OpCode.RETURN:
    case OpCode.HALT:
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op)}`,
        nextOffset: offset + 1,
        line,
      };

    // 16-bit operand instructions
    case OpCode.CONST: {
      const idx = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
      const value = chunk.constants[idx];
      const valueStr = formatConstant(value);
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op).padEnd(16)} ${idx} (${valueStr})`,
        nextOffset: offset + 3,
        line,
      };
    }

    case OpCode.LOAD_LOCAL:
    case OpCode.STORE_LOCAL:
    case OpCode.LOAD_UPVALUE:
    case OpCode.STORE_UPVALUE:
    case OpCode.DESTRUCT_ELEM:
    case OpCode.ROT:
    case OpCode.COMPOUND: {
      const slot = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op).padEnd(16)} ${slot}`,
        nextOffset: offset + 3,
        line,
      };
    }

    case OpCode.LOAD_GLOBAL:
    case OpCode.STORE_GLOBAL:
    case OpCode.DECLARE_GLOBAL:
    case OpCode.RAISE: {
      const idx = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
      const name = chunk.constants[idx];
      const nameStr = name && name.type === 'string' ? name.value : String(idx);
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op).padEnd(16)} ${idx} (${nameStr})`,
        nextOffset: offset + 3,
        line,
      };
    }

    case OpCode.JMP:
    case OpCode.JMP_IF_FALSE:
    case OpCode.JMP_IF_TRUE:
    case OpCode.JMP_IF_NULL:
    case OpCode.LOOP:
    case OpCode.TRY_BEGIN: {
      const target = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op).padEnd(16)} -> ${target}`,
        nextOffset: offset + 3,
        line,
      };
    }

    case OpCode.CALL:
    case OpCode.ARRAY:
    case OpCode.OBJECT:
    case OpCode.PRINT:
    case OpCode.NEW_INSTANCE: {
      const count = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op).padEnd(16)} ${count}`,
        nextOffset: offset + 3,
        line,
      };
    }

    case OpCode.CLOSURE: {
      const fnIdx = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
      const fn = chunk.constants[fnIdx] as unknown as CompiledFunction;
      const fnName = fn ? fn.name : '<unknown>';
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op).padEnd(16)} ${fnIdx} (${fnName})`,
        nextOffset: offset + 3,
        line,
      };
    }

    case OpCode.CLASS:
    case OpCode.METHOD:
    case OpCode.GET_PROP:
    case OpCode.SET_PROP:
    case OpCode.GET_METHOD:
    case OpCode.DESTRUCT_PROP: {
      const idx = (chunk.code[offset + 1] << 8) | chunk.code[offset + 2];
      const name = chunk.constants[idx];
      const nameStr = name && name.type === 'string' ? name.value : String(idx);
      return {
        text: `${offsetStr} ${lineStr} ${opcodeName(op).padEnd(16)} ${idx} (${nameStr})`,
        nextOffset: offset + 3,
        line,
      };
    }

    default:
      // Advance by the real instruction width so an opcode that has not been
      // given a formatter here cannot desync the rest of the listing.
      return {
        text: `${offsetStr} ${lineStr} UNKNOWN(0x${(op as number).toString(16)})`,
        nextOffset: offset + instructionSize(op),
        line,
      };
  }
}

function formatConstant(value: ConstantValue): string {
  if (!value) return 'undefined';
  const fn = value as unknown as CompiledFunction;
  if (fn && fn.type === 'compiled-function') {
    return `<fn ${fn.name}>`;
  }
  return stringify(value);
}
