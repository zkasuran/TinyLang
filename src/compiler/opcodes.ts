/**
 * TinyLang Bytecode Opcodes
 *
 * Defines all bytecode instructions used by the compiler and VM.
 * Each opcode is a single byte that identifies the operation to perform.
 */

export enum OpCode {
  // Stack operations
  CONST = 0x01,      // Push a constant from the constant pool
  POP = 0x02,        // Pop the top of stack
  DUP = 0x03,        // Duplicate the top of stack

  // Arithmetic operations
  ADD = 0x10,
  SUB = 0x11,
  MUL = 0x12,
  DIV = 0x13,
  MOD = 0x14,
  POW = 0x15,
  NEGATE = 0x16,

  // Comparison operations
  EQ = 0x20,
  NEQ = 0x21,
  LT = 0x22,
  LTE = 0x23,
  GT = 0x24,
  GTE = 0x25,

  // Logical operations
  NOT = 0x30,
  AND = 0x31,
  OR = 0x32,

  // Control flow
  JMP = 0x40,           // Unconditional jump
  JMP_IF_FALSE = 0x41,  // Jump if top of stack is falsy
  JMP_IF_TRUE = 0x42,   // Jump if top of stack is truthy
  LOOP = 0x43,          // Loop back (jump backwards)

  // Variable access
  LOAD_LOCAL = 0x50,
  STORE_LOCAL = 0x51,
  LOAD_GLOBAL = 0x52,
  STORE_GLOBAL = 0x53,
  LOAD_UPVALUE = 0x54,
  STORE_UPVALUE = 0x55,

  // Functions
  CALL = 0x60,
  RETURN = 0x61,
  CLOSURE = 0x62,

  // Data structures
  ARRAY = 0x70,
  OBJECT = 0x71,
  INDEX = 0x72,
  SET_INDEX = 0x73,
  GET_PROP = 0x74,
  SET_PROP = 0x75,

  // OOP
  CLASS = 0x80,
  METHOD = 0x81,
  INHERIT = 0x82,
  NEW_INSTANCE = 0x83,
  GET_THIS = 0x84,

  // I/O
  PRINT = 0x90,

  // Control
  HALT = 0xFF,
}

/**
 * Get the human-readable name of an opcode
 */
export function opcodeName(op: OpCode): string {
  const names: Record<number, string> = {
    [OpCode.CONST]: 'CONST',
    [OpCode.POP]: 'POP',
    [OpCode.DUP]: 'DUP',
    [OpCode.ADD]: 'ADD',
    [OpCode.SUB]: 'SUB',
    [OpCode.MUL]: 'MUL',
    [OpCode.DIV]: 'DIV',
    [OpCode.MOD]: 'MOD',
    [OpCode.POW]: 'POW',
    [OpCode.NEGATE]: 'NEGATE',
    [OpCode.EQ]: 'EQ',
    [OpCode.NEQ]: 'NEQ',
    [OpCode.LT]: 'LT',
    [OpCode.LTE]: 'LTE',
    [OpCode.GT]: 'GT',
    [OpCode.GTE]: 'GTE',
    [OpCode.NOT]: 'NOT',
    [OpCode.AND]: 'AND',
    [OpCode.OR]: 'OR',
    [OpCode.JMP]: 'JMP',
    [OpCode.JMP_IF_FALSE]: 'JMP_IF_FALSE',
    [OpCode.JMP_IF_TRUE]: 'JMP_IF_TRUE',
    [OpCode.LOOP]: 'LOOP',
    [OpCode.LOAD_LOCAL]: 'LOAD_LOCAL',
    [OpCode.STORE_LOCAL]: 'STORE_LOCAL',
    [OpCode.LOAD_GLOBAL]: 'LOAD_GLOBAL',
    [OpCode.STORE_GLOBAL]: 'STORE_GLOBAL',
    [OpCode.LOAD_UPVALUE]: 'LOAD_UPVALUE',
    [OpCode.STORE_UPVALUE]: 'STORE_UPVALUE',
    [OpCode.CALL]: 'CALL',
    [OpCode.RETURN]: 'RETURN',
    [OpCode.CLOSURE]: 'CLOSURE',
    [OpCode.ARRAY]: 'ARRAY',
    [OpCode.OBJECT]: 'OBJECT',
    [OpCode.INDEX]: 'INDEX',
    [OpCode.SET_INDEX]: 'SET_INDEX',
    [OpCode.GET_PROP]: 'GET_PROP',
    [OpCode.SET_PROP]: 'SET_PROP',
    [OpCode.CLASS]: 'CLASS',
    [OpCode.METHOD]: 'METHOD',
    [OpCode.INHERIT]: 'INHERIT',
    [OpCode.NEW_INSTANCE]: 'NEW_INSTANCE',
    [OpCode.GET_THIS]: 'GET_THIS',
    [OpCode.PRINT]: 'PRINT',
    [OpCode.HALT]: 'HALT',
  };
  return names[op] || `UNKNOWN(${op})`;
}
