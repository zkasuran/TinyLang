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
  DUP2 = 0x04,       // Duplicate the top two values, preserving their order
  ROT = 0x05,        // Move the deepest of the top N values to the top

  // Arithmetic operations
  ADD = 0x10,
  SUB = 0x11,
  MUL = 0x12,
  DIV = 0x13,
  MOD = 0x14,
  POW = 0x15,
  NEGATE = 0x16,
  COMPOUND = 0x17,   // Apply a compound-assignment operator (see CompoundOp)

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
  JMP_IF_NULL = 0x44,   // Jump if top of stack is null (peeks, used by ?. and ??)

  // Variable access
  LOAD_LOCAL = 0x50,
  STORE_LOCAL = 0x51,
  LOAD_GLOBAL = 0x52,
  STORE_GLOBAL = 0x53,
  LOAD_UPVALUE = 0x54,
  STORE_UPVALUE = 0x55,
  LOAD_ARGC = 0x56,     // Push the number of arguments actually passed to this frame
  DECLARE_GLOBAL = 0x57, // Like STORE_GLOBAL, but rejects a name already bound
  DECLARE_CONST_GLOBAL = 0x58, // DECLARE_GLOBAL, and the name may never be stored to again

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
  CHECK_ITERABLE = 0x7C, // Verify the top of stack can be iterated by a for loop
  ARRAY_APPEND = 0x76,   // Append top of stack to the array beneath it
  ARRAY_SPREAD = 0x77,   // Spread top of stack (array/string) into the array beneath it
  DESTRUCT_ELEM = 0x78,  // Extract element N from the array on top (null if absent)
  DESTRUCT_PROP = 0x79,  // Extract property <const> from the object on top (null if absent)
  INDEX_OPTIONAL = 0x7A, // Like INDEX but yields null instead of throwing when out of range
  GET_METHOD = 0x7B,     // Resolve a property as a callable method (see VM.performGetMethod)

  // OOP
  CLASS = 0x80,
  METHOD = 0x81,
  INHERIT = 0x82,
  NEW_INSTANCE = 0x83,
  GET_THIS = 0x84,

  // I/O
  PRINT = 0x90,

  // Error handling
  TRY_BEGIN = 0xA0,  // Install a catch handler at the given address
  TRY_END = 0xA1,    // Uninstall the innermost catch handler
  THROW = 0xA2,      // Throw the value on top of the stack as an error
  RAISE = 0xA3,      // Raise a RuntimeError with the message at <const>

  // Control
  HALT = 0xFF,
}

/**
 * Operand values for OpCode.COMPOUND.
 *
 * Compound assignment is not the same as the matching binary operator: the
 * language restricts it to numbers and reports different messages, so it gets
 * its own instruction rather than reusing ADD/SUB/MUL/DIV.
 */
export enum CompoundOp {
  ADD = 0,
  SUB = 1,
  MUL = 2,
  DIV = 3,
}

/**
 * Opcodes that carry a single 16-bit operand. Everything else is operand-less.
 *
 * This is the single source of truth for instruction width. Keeping a separate
 * copy in each consumer is how the optimizer came to mis-decode bytecode: it
 * walked one byte at a time and read operand bytes as opcodes.
 */
const TWO_BYTE_OPERAND: ReadonlySet<number> = new Set<number>([
  OpCode.CONST,
  OpCode.ROT,
  OpCode.COMPOUND,
  OpCode.JMP,
  OpCode.JMP_IF_FALSE,
  OpCode.JMP_IF_TRUE,
  OpCode.JMP_IF_NULL,
  OpCode.LOOP,
  OpCode.LOAD_LOCAL,
  OpCode.STORE_LOCAL,
  OpCode.LOAD_GLOBAL,
  OpCode.STORE_GLOBAL,
  OpCode.DECLARE_GLOBAL,
  OpCode.DECLARE_CONST_GLOBAL,
  OpCode.LOAD_UPVALUE,
  OpCode.STORE_UPVALUE,
  OpCode.CALL,
  OpCode.CLOSURE,
  OpCode.ARRAY,
  OpCode.OBJECT,
  OpCode.GET_PROP,
  OpCode.SET_PROP,
  OpCode.GET_METHOD,
  OpCode.DESTRUCT_ELEM,
  OpCode.DESTRUCT_PROP,
  OpCode.CLASS,
  OpCode.METHOD,
  OpCode.NEW_INSTANCE,
  OpCode.PRINT,
  OpCode.TRY_BEGIN,
  OpCode.RAISE,
]);

/**
 * Opcodes whose operand is an absolute code address. These must be remapped
 * whenever instructions are added or removed.
 */
const ADDRESS_OPERAND: ReadonlySet<number> = new Set<number>([
  OpCode.JMP,
  OpCode.JMP_IF_FALSE,
  OpCode.JMP_IF_TRUE,
  OpCode.JMP_IF_NULL,
  OpCode.LOOP,
  OpCode.TRY_BEGIN,
]);

/** Total size in bytes of an instruction, including its operand. */
export function instructionSize(op: number): number {
  return TWO_BYTE_OPERAND.has(op) ? 3 : 1;
}

/** Whether an opcode's operand is an absolute code address. */
export function hasAddressOperand(op: number): boolean {
  return ADDRESS_OPERAND.has(op);
}

/**
 * Get the human-readable name of an opcode
 */
export function opcodeName(op: OpCode): string {
  const names: Record<number, string> = {
    [OpCode.CONST]: 'CONST',
    [OpCode.POP]: 'POP',
    [OpCode.DUP]: 'DUP',
    [OpCode.DUP2]: 'DUP2',
    [OpCode.ROT]: 'ROT',
    [OpCode.COMPOUND]: 'COMPOUND',
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
    [OpCode.JMP_IF_NULL]: 'JMP_IF_NULL',
    [OpCode.LOAD_LOCAL]: 'LOAD_LOCAL',
    [OpCode.STORE_LOCAL]: 'STORE_LOCAL',
    [OpCode.LOAD_GLOBAL]: 'LOAD_GLOBAL',
    [OpCode.STORE_GLOBAL]: 'STORE_GLOBAL',
    [OpCode.DECLARE_GLOBAL]: 'DECLARE_GLOBAL',
    [OpCode.DECLARE_CONST_GLOBAL]: 'DECLARE_CONST_GLOBAL',
    [OpCode.LOAD_UPVALUE]: 'LOAD_UPVALUE',
    [OpCode.STORE_UPVALUE]: 'STORE_UPVALUE',
    [OpCode.LOAD_ARGC]: 'LOAD_ARGC',
    [OpCode.CALL]: 'CALL',
    [OpCode.RETURN]: 'RETURN',
    [OpCode.CLOSURE]: 'CLOSURE',
    [OpCode.ARRAY]: 'ARRAY',
    [OpCode.OBJECT]: 'OBJECT',
    [OpCode.INDEX]: 'INDEX',
    [OpCode.SET_INDEX]: 'SET_INDEX',
    [OpCode.GET_PROP]: 'GET_PROP',
    [OpCode.SET_PROP]: 'SET_PROP',
    [OpCode.CHECK_ITERABLE]: 'CHECK_ITERABLE',
    [OpCode.ARRAY_APPEND]: 'ARRAY_APPEND',
    [OpCode.ARRAY_SPREAD]: 'ARRAY_SPREAD',
    [OpCode.DESTRUCT_ELEM]: 'DESTRUCT_ELEM',
    [OpCode.DESTRUCT_PROP]: 'DESTRUCT_PROP',
    [OpCode.INDEX_OPTIONAL]: 'INDEX_OPTIONAL',
    [OpCode.GET_METHOD]: 'GET_METHOD',
    [OpCode.CLASS]: 'CLASS',
    [OpCode.METHOD]: 'METHOD',
    [OpCode.INHERIT]: 'INHERIT',
    [OpCode.NEW_INSTANCE]: 'NEW_INSTANCE',
    [OpCode.GET_THIS]: 'GET_THIS',
    [OpCode.PRINT]: 'PRINT',
    [OpCode.TRY_BEGIN]: 'TRY_BEGIN',
    [OpCode.TRY_END]: 'TRY_END',
    [OpCode.THROW]: 'THROW',
    [OpCode.RAISE]: 'RAISE',
    [OpCode.HALT]: 'HALT',
  };
  return names[op] || `UNKNOWN(${op})`;
}
