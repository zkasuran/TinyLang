/**
 * TinyLang Bytecode Chunk
 *
 * A chunk represents a compiled unit of bytecode: instructions,
 * a constant pool, and source line info for error reporting.
 * Supports serialization to/from the .tinyc binary format.
 */

import { RuntimeValue } from '../types/values';
import { CompilerError } from './errors';

/** Magic bytes for the .tinyc binary format: 'TINY' */
const MAGIC_BYTES = [0x54, 0x49, 0x4E, 0x59];

/** Current version of the bytecode format */
const FORMAT_VERSION = 1;

/**
 * Largest value a 16-bit operand can hold.
 *
 * Every operand in this bytecode is 16 bits: jump and loop targets are absolute
 * code addresses, and constant-pool and local indices are direct indices. So a
 * chunk cannot exceed 65535 bytes of code, hold more than 65536 constants, or
 * address more than 65536 locals.
 */
const MAX_16BIT_OPERAND = 0xFFFF;

/** Type for constant pool entries - can be RuntimeValues or CompiledFunctions */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConstantValue = RuntimeValue | any;

/**
 * Represents a compiled function or top-level script
 */
export class Chunk {
  /** Bytecode instructions */
  code: number[] = [];
  /** Constant pool - stores literal values referenced by CONST instructions */
  constants: ConstantValue[] = [];
  /** Source line number for each bytecode instruction (for error reporting) */
  lines: number[] = [];
  /** Name of this chunk (for debugging) */
  name: string;

  constructor(name: string = '<script>') {
    this.name = name;
  }

  /**
   * Write a byte (opcode or operand) to the chunk
   */
  write(byte: number, line: number): void {
    this.code.push(byte);
    this.lines.push(line);
  }

  /**
   * Write a 16-bit value as two bytes (big-endian)
   */
  write16(value: number, line: number): void {
    this.checkOperand(value, line);
    this.code.push((value >> 8) & 0xFF);
    this.lines.push(line);
    this.code.push(value & 0xFF);
    this.lines.push(line);
  }

  /**
   * Reject an operand that does not fit in 16 bits.
   *
   * Both write16 and patch16 used to mask with `& 0xFF` and no bounds check, so
   * a program compiling to more than 64KB of bytecode kept compiling: jump
   * targets silently wrapped and the VM jumped to an address 65536 bytes short
   * of the intended one, producing arbitrary misbehaviour with no diagnostic.
   * A clear failure at compile time is the only honest answer.
   */
  private checkOperand(value: number, line?: number): void {
    if (!Number.isInteger(value) || value < 0 || value > MAX_16BIT_OPERAND) {
      throw new CompilerError(
        `Bytecode operand ${value} does not fit in the 16 bits this format ` +
          `allows (0..${MAX_16BIT_OPERAND}). A single chunk cannot exceed ` +
          `${MAX_16BIT_OPERAND} bytes of code, ${MAX_16BIT_OPERAND + 1} constants ` +
          `or ${MAX_16BIT_OPERAND + 1} locals. Split the program into smaller functions.`,
        line
      );
    }
  }

  /**
   * Add a constant to the pool and return its index
   */
  addConstant(value: ConstantValue): number {
    this.constants.push(value);
    return this.constants.length - 1;
  }

  /**
   * Get the current code offset (for patching jumps)
   */
  get currentOffset(): number {
    return this.code.length;
  }

  /**
   * Patch a 16-bit value at a given offset (for backpatching jumps)
   */
  patch16(offset: number, value: number): void {
    this.checkOperand(value, this.lines[offset]);
    this.code[offset] = (value >> 8) & 0xFF;
    this.code[offset + 1] = value & 0xFF;
  }

  /**
   * Read a 16-bit value at a given offset
   */
  read16(offset: number): number {
    return (this.code[offset] << 8) | this.code[offset + 1];
  }

  /**
   * Serialize the chunk to a binary buffer (.tinyc format)
   *
   * Format:
   *   4 bytes: magic ('TINY')
   *   1 byte: version
   *   4 bytes: constant pool JSON length (big-endian)
   *   N bytes: constant pool as JSON
   *   4 bytes: code length (big-endian)
   *   N bytes: bytecode
   *   4 bytes: lines length (big-endian)
   *   N bytes: line numbers as JSON
   */
  serialize(): Buffer {
    const constantsJson = JSON.stringify(this.constants, (_key, value) => {
      if (value instanceof Map) {
        return { __map: Array.from(value.entries()) };
      }
      return value;
    });
    const constantsBuffer = Buffer.from(constantsJson, 'utf-8');
    const linesJson = JSON.stringify(this.lines);
    const linesBuffer = Buffer.from(linesJson, 'utf-8');
    const codeBuffer = Buffer.from(this.code);

    const totalLength = 4 + 1 + 4 + constantsBuffer.length + 4 + codeBuffer.length + 4 + linesBuffer.length;
    const buffer = Buffer.alloc(totalLength);
    let offset = 0;

    // Magic bytes
    for (const b of MAGIC_BYTES) {
      buffer[offset++] = b;
    }

    // Version
    buffer[offset++] = FORMAT_VERSION;

    // Constants pool
    buffer.writeUInt32BE(constantsBuffer.length, offset);
    offset += 4;
    constantsBuffer.copy(buffer, offset);
    offset += constantsBuffer.length;

    // Bytecode
    buffer.writeUInt32BE(codeBuffer.length, offset);
    offset += 4;
    codeBuffer.copy(buffer, offset);
    offset += codeBuffer.length;

    // Line numbers
    buffer.writeUInt32BE(linesBuffer.length, offset);
    offset += 4;
    linesBuffer.copy(buffer, offset);

    return buffer;
  }

  /**
   * Deserialize a chunk from a binary buffer (.tinyc format)
   */
  static deserialize(buffer: Buffer): Chunk {
    let offset = 0;

    // Verify magic bytes
    for (let i = 0; i < MAGIC_BYTES.length; i++) {
      if (buffer[offset++] !== MAGIC_BYTES[i]) {
        throw new Error('Invalid .tinyc file: bad magic bytes');
      }
    }

    // Verify version
    const version = buffer[offset++];
    if (version !== FORMAT_VERSION) {
      throw new Error(`Unsupported .tinyc version: ${version}`);
    }

    // Read constants pool
    const constantsLength = buffer.readUInt32BE(offset);
    offset += 4;
    const constantsJson = buffer.slice(offset, offset + constantsLength).toString('utf-8');
    offset += constantsLength;

    // Read bytecode
    const codeLength = buffer.readUInt32BE(offset);
    offset += 4;
    const code = Array.from(buffer.slice(offset, offset + codeLength));
    offset += codeLength;

    // Read line numbers
    const linesLength = buffer.readUInt32BE(offset);
    offset += 4;
    const linesJson = buffer.slice(offset, offset + linesLength).toString('utf-8');

    const chunk = new Chunk();
    chunk.constants = JSON.parse(constantsJson, (_key, value) => {
      if (value && typeof value === 'object' && value.__map) {
        return new Map(value.__map);
      }
      return value;
    });
    chunk.code = code;
    chunk.lines = JSON.parse(linesJson);

    return chunk;
  }
}
