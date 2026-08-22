# Compiler & Virtual Machine - Design Document

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Compilation Pipeline                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐  │
│  │   AST   │───>│ Compiler │───>│ Optimizer │───>│Serializer │  │
│  │(Program)│    │ (Chunk)  │    │  (Chunk)  │    │  (.tinyc) │  │
│  └─────────┘    └──────────┘    └───────────┘    └───────────┘  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                   Execution Pipeline                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐    ┌──────────────┐    ┌────────┐    ┌──────────┐  │
│  │ .tinyc  │───>│ Deserializer │───>│   VM   │───>│  Output  │  │
│  │  File   │    │   (Chunk)    │    │(Stack) │    │ (stdout)  │  │
│  └─────────┘    └──────────────┘    └────────┘    └──────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Bytecode Compiler (`src/compiler/compiler.ts`)

The compiler performs a single-pass walk of the AST, emitting bytecode instructions into a `Chunk`. It maintains a scope stack for local variable resolution and emits closure upvalue references.

**Key Responsibilities:**
- Walk the AST and emit corresponding opcodes
- Resolve local variables by index (no name lookup at runtime)
- Emit jump instructions with backpatching for control flow
- Compile closures with upvalue captures
- Compile class declarations with methods

**Scope Resolution:**
```
Global Scope (load/store via name index in constant pool)
  └─ Function Scope (load/store by stack slot index)
       └─ Block Scope (same frame, incremented slot indices)
            └─ Closure (upvalues reference parent's locals or upvalues)
```

### 2. Opcodes (`src/compiler/opcodes.ts`)

All 63 bytecode instructions organized by category:

| Category | Opcodes | Hex Range |
|----------|---------|-----------|
| Stack | CONST, POP, DUP, DUP2, ROT | 0x01-0x05 |
| Arithmetic | ADD, SUB, MUL, DIV, MOD, POW, NEGATE, COMPOUND | 0x10-0x17 |
| Comparison | EQ, NEQ, LT, LTE, GT, GTE | 0x20-0x25 |
| Logical | NOT, AND, OR | 0x30-0x32 |
| Control Flow | JMP, JMP_IF_FALSE, JMP_IF_TRUE, LOOP, JMP_IF_NULL | 0x40-0x44 |
| Variables | LOAD_LOCAL, STORE_LOCAL, LOAD_GLOBAL, STORE_GLOBAL, LOAD_UPVALUE, STORE_UPVALUE, LOAD_ARGC, DECLARE_GLOBAL, DECLARE_CONST_GLOBAL | 0x50-0x58 |
| Functions | CALL, RETURN, CLOSURE | 0x60-0x62 |
| Data Structures | ARRAY, OBJECT, INDEX, SET_INDEX, GET_PROP, SET_PROP, ARRAY_APPEND, ARRAY_SPREAD, DESTRUCT_ELEM, DESTRUCT_PROP, INDEX_OPTIONAL, GET_METHOD, CHECK_ITERABLE | 0x70-0x7C |
| OOP | CLASS, METHOD, INHERIT, NEW_INSTANCE, GET_THIS | 0x80-0x84 |
| I/O | PRINT | 0x90 |
| Error Handling | TRY_BEGIN, TRY_END, THROW, RAISE | 0xA0-0xA3 |
| Control | HALT | 0xFF |

**Instruction Encoding:**
- Single-byte opcodes (no operand): POP, DUP, ADD, SUB, etc.
- One-byte operand: LOAD_LOCAL, STORE_LOCAL, CALL (argument count)
- Two-byte operand (16-bit): CONST (constant pool index), JMP, JMP_IF_FALSE, LOOP (offset)
- Variable-length: CLOSURE (function index + upvalue descriptors)

### 3. Chunk (`src/compiler/chunk.ts`)

A Chunk is the compiled representation of a function or script:

```typescript
class Chunk {
  code: number[]           // Bytecode instructions
  constants: ConstantValue[] // Constant pool (literals, function refs)
  lines: number[]          // Source line for each byte (for errors)
  name: string             // Debug name ("<script>" or function name)
}
```

**Constant Pool Entry Types:**
- Number (64-bit float)
- String (UTF-8)
- Boolean
- Null
- CompiledFunction (nested Chunk + metadata)

### 4. Virtual Machine (`src/vm/vm.ts`)

Stack-based execution engine with call frames:

```
┌───────────────────────────────────────┐
│            Call Frame Stack            │
├───────────────────────────────────────┤
│  Frame 3: inner()   [ip=12, bp=24]   │
│  Frame 2: outer()   [ip=8,  bp=16]   │
│  Frame 1: main()    [ip=42, bp=8]    │
│  Frame 0: <script>  [ip=5,  bp=0]    │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│           Operand Stack               │
├───────────────────────────────────────┤
│  [0..7]   <script> locals             │
│  [8..15]  main() locals               │
│  [16..23] outer() locals              │
│  [24..31] inner() locals + temps      │  <-- sp
└───────────────────────────────────────┘
```

**Call Frame Structure:**
```typescript
interface CallFrame {
  chunk: Chunk          // Bytecode being executed
  ip: number           // Instruction pointer (index into chunk.code)
  basePointer: number  // Start of this frame's stack window
  closure: Closure     // For upvalue access
}
```

**Execution Loop:**
```
while (frame.ip < frame.chunk.code.length):
  opcode = readByte()
  switch (opcode):
    CONST -> push(constants[readShort()])
    ADD   -> push(pop() + pop())
    CALL  -> pushFrame(target, argCount)
    ...
```

### 5. Optimizer (`src/compiler/optimizer.ts`)

Three optimization passes applied in sequence:

**Pass 1: Constant Folding**
- Pattern: `CONST a, CONST b, <arith_op>` where both are numeric
- Replacement: `CONST (a op b)` - single constant with pre-computed result
- Also folds string concatenation of two string constants

**Pass 2: Dead Code Elimination**
- Scans for RETURN or unconditional JMP instructions
- Removes all subsequent instructions until the next jump target
- Preserves jump target alignment

**Pass 3: Peephole Optimization**
- `CONST true, NOT` becomes `CONST false`
- `CONST false, NOT` becomes `CONST true`
- `POP` immediately after `DUP` cancels both
- `NEGATE, NEGATE` cancels to nothing

### 6. Serialization Format (`.tinyc`)

Binary format for storing compiled bytecode:

```
Header:
  [4 bytes] Magic: 0x54 0x49 0x4E 0x59 ("TINY")
  [1 byte]  Version: 0x01

Chunk:
  [2 bytes] Name length (N)
  [N bytes] Name (UTF-8)
  [4 bytes] Code length (M)
  [M bytes] Bytecode instructions
  [4 bytes] Lines length (same as code length)
  [M*4 bytes] Line numbers (32-bit each)
  [2 bytes] Constants count (K)
  [K entries] Constant pool entries

Constant Entry:
  [1 byte] Type tag:
    0x01 = Number (followed by 8 bytes IEEE 754)
    0x02 = String (followed by 2-byte length + UTF-8 data)
    0x03 = Boolean (followed by 1 byte: 0 or 1)
    0x04 = Null (no payload)
    0x05 = Function (followed by arity byte + chunk data)
```

### 7. Disassembler (`src/compiler/disassembler.ts`)

Produces human-readable bytecode listings:

```
== <script> ==
0000    1 CONST          0 'Hello'
0003    | CONST          1 'World'
0006    | ADD
0007    | PRINT
0008    2 CONST          2 42
0011    | LOAD_LOCAL     0
0013    | ADD
0014    | STORE_LOCAL    1
0016    3 HALT
```

Format: `offset line opcode [operand] ['constant value']`

## Data Flow

```
Source (.tiny)
  |  Lexer
  v
Tokens
  |  Parser
  v
AST (Program)
  |  Compiler
  v
Chunk (unoptimized bytecode)
  |  Optimizer
  v
Chunk (optimized bytecode)
  |  Serializer
  v
.tinyc file (binary)
  |  Deserializer
  v
Chunk (in memory)
  |  VM
  v
Program Output
```

## Key Design Decisions

1. **Stack-based over register-based VM** - Simpler to implement, easier to understand for educational purposes, well-suited for expression-heavy languages.

2. **Single-pass compiler** - The compiler walks the AST once, emitting bytecode as it goes. No intermediate representation (IR) phase. This keeps the architecture simple.

3. **16-bit constant pool indices** - Limits to 65,536 constants per chunk, which is more than sufficient for any educational program.

4. **Upvalue-based closures** - Variables captured by closures are tracked as upvalues (indices into the parent frame or parent's upvalue array). This avoids heap-allocating all locals.

5. **Optimization is optional** - The optimizer is a separate pass that can be enabled/disabled via CLI flags. Unoptimized code is correct and runs fine.

6. **Binary format versioning** - The `.tinyc` format includes a version byte so future changes to the instruction set can be detected and handled gracefully.
