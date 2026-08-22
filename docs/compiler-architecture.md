# Compiler Architecture

## Overview

TinyLang has two execution engines: a tree-walk interpreter and a bytecode compiler + virtual machine. The compiler translates source code to a compact bytecode format, and the VM executes it on a stack-based architecture.

```
Source Code (.tiny)
       |
       v
   ┌────────┐
   │ Lexer  │  Tokenize
   └───┬────┘
       |
       v
   ┌────────┐
   │ Parser │  Build AST
   └───┬────┘
       |
       v
   ┌──────────┐
   │ Compiler │  Emit bytecode
   └───┬──────┘
       |
       v
   ┌───────────┐
   │ Optimizer │  Constant folding, dead code elimination
   └───┬───────┘
       |
       v
   ┌────────────┐
   │ Chunk/File │  Binary .tinyc format
   └───┬────────┘
       |
       v
   ┌────┐
   │ VM │  Execute
   └────┘
```

---

## Bytecode Instruction Set

TinyLang uses a 44-opcode instruction set:

### Stack Operations
| Opcode | Operands | Description |
|--------|----------|-------------|
| `CONST` | index (16-bit) | Push constant from pool |
| `POP` | - | Discard top of stack |
| `DUP` | - | Duplicate top of stack |

### Arithmetic
| Opcode | Description |
|--------|-------------|
| `ADD` | a + b |
| `SUB` | a - b |
| `MUL` | a * b |
| `DIV` | a / b |
| `MOD` | a % b |
| `POW` | a ** b |
| `NEGATE` | -a |

### Comparison
| Opcode | Description |
|--------|-------------|
| `EQ` | a == b |
| `NEQ` | a != b |
| `LT` | a < b |
| `LTE` | a <= b |
| `GT` | a > b |
| `GTE` | a >= b |

### Logic
| Opcode | Description |
|--------|-------------|
| `NOT` | !a |
| `AND` | a && b |
| `OR` | a || b |

### Variables
| Opcode | Operands | Description |
|--------|----------|-------------|
| `LOAD_LOCAL` | slot (16-bit) | Push local variable |
| `STORE_LOCAL` | slot (16-bit) | Store to local slot |
| `LOAD_GLOBAL` | name index | Push global variable |
| `STORE_GLOBAL` | name index | Store to global |

### Control Flow
| Opcode | Operands | Description |
|--------|----------|-------------|
| `JMP` | offset (16-bit) | Unconditional jump |
| `JMP_IF_FALSE` | offset (16-bit) | Jump if top is falsy |
| `JMP_IF_TRUE` | offset (16-bit) | Jump if top is truthy |

### Functions
| Opcode | Operands | Description |
|--------|----------|-------------|
| `CALL` | arg count | Call function with N args |
| `RETURN` | - | Return from function |
| `CLOSURE` | fn index, upvalue count | Create closure |

### Data Structures
| Opcode | Operands | Description |
|--------|----------|-------------|
| `ARRAY` | element count | Build array from stack |
| `OBJECT` | pair count | Build object from stack |
| `INDEX` | - | Access array/object by index |
| `SET_INDEX` | - | Set array element |
| `GET_PROP` | name index | Get object property |
| `SET_PROP` | name index | Set object property |

### Classes
| Opcode | Operands | Description |
|--------|----------|-------------|
| `CLASS` | name index | Define class |
| `METHOD` | name index | Define method on class |
| `INHERIT` | - | Set up inheritance |
| `NEW_INSTANCE` | - | Create class instance |

### Special
| Opcode | Description |
|--------|-------------|
| `PRINT` | Print top of stack |
| `HALT` | Stop execution |

---

## Constant Pool

The constant pool stores all literal values referenced by bytecode:
- Numbers (64-bit float)
- Strings (UTF-8)
- Function templates (bytecode + parameter info)
- Class descriptors

Constants are referenced by 16-bit index, allowing up to 65,535 constants per chunk.

---

## Call Frame Architecture

```
┌─────────────────────────┐
│    VM State             │
├─────────────────────────┤
│ Operand Stack           │  <- SP (stack pointer)
│ [val] [val] [val] ...   │
├─────────────────────────┤
│ Call Frame Stack         │  <- FP (frame pointer)
│ ┌─────────────────────┐ │
│ │ Frame 2 (current)   │ │
│ │  ip: instruction ptr │ │
│ │  bp: base pointer    │ │
│ │  locals: [...]       │ │
│ │  function: ref       │ │
│ ├─────────────────────┤ │
│ │ Frame 1             │ │
│ │  ip, bp, locals     │ │
│ ├─────────────────────┤ │
│ │ Frame 0 (top-level) │ │
│ │  ip, bp, locals     │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

Each call frame contains:
- **Instruction pointer (ip)**: Current position in the bytecode
- **Base pointer (bp)**: Start of this frame's local variable slots
- **Locals array**: Local variable values
- **Function reference**: The function being executed (for error reporting)

---

## Closure Implementation

Closures capture variables from enclosing scopes via upvalues:

1. **Open upvalue**: Points to a variable still on the stack
2. **Closed upvalue**: Variable has been captured into heap storage

When a function captures a variable:
- Compiler emits `CLOSURE` with upvalue descriptors
- VM creates upvalue objects pointing to stack slots
- When the enclosing function returns, open upvalues are "closed" (value copied to heap)

---

## Optimization Passes

### Constant Folding
Evaluates constant expressions at compile time:
```
// Before: CONST 2, CONST 3, ADD
// After:  CONST 5
let x = 2 + 3  // optimized to let x = 5
```

### Dead Code Elimination
Removes unreachable code:
```
fn example() {
  return 42
  print("unreachable")  // removed
}
```

---

## Binary Format (.tinyc)

```
Offset  Size   Description
0       4      Magic bytes: "TINY"
4       1      Version byte (currently 1)
5       4      Constant pool size (uint32)
9       N      Constant pool entries (type byte + data)
9+N     4      Instruction count (uint32)
13+N    M      Bytecode instructions
13+N+M  4      Line mapping entries count
...            Line mapping (instruction offset -> source line)
```

---

## Performance

The VM typically executes 3-10x faster than the tree-walk interpreter:
- No AST traversal overhead
- Compact instruction encoding (better cache locality)
- Stack operations are simple pointer arithmetic
- Optimizer eliminates redundant computation

Use `tinylang bench file.tiny` to compare execution speeds.
