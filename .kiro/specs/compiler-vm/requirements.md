# Compiler & Virtual Machine - Requirements

## Overview

TinyLang needs a bytecode compilation pipeline that transforms AST into an efficient bytecode representation, then executes it on a stack-based virtual machine. This enables faster execution of TinyLang programs (compared to tree-walk interpretation), provides a disassembly view for educational purposes, and produces portable `.tinyc` binary files.

## User Stories

### US-1: Compile TinyLang Source to Bytecode

As a developer, I want to compile `.tiny` source files into `.tinyc` bytecode files so that I can distribute and execute programs without re-parsing.

**Acceptance Criteria:**
- [x] `tinylang compile <file.tiny>` produces a `.tinyc` binary file
- [x] The compiler handles all language features (variables, functions, classes, control flow)
- [x] Compilation errors report the source location and a helpful hint
- [x] Compiled output is portable (no host-specific paths embedded)

### US-2: Execute Bytecode on the VM

As a developer, I want to run compiled `.tinyc` files on the virtual machine so that programs execute faster than tree-walk interpretation.

**Acceptance Criteria:**
- [x] `tinylang run <file.tinyc>` loads and executes bytecode
- [x] The VM correctly handles all opcodes (arithmetic, control flow, functions, classes)
- [x] Stack overflow is detected and produces a helpful error
- [x] Runtime errors include the source line from the original `.tiny` file

### US-3: Disassemble Bytecode

As a learner, I want to see a human-readable listing of bytecode instructions so that I can understand how compilation works.

**Acceptance Criteria:**
- [x] `tinylang disassemble <file.tinyc>` shows the instruction listing
- [x] Each instruction shows offset, opcode name, operands, and source line
- [x] Constant pool values are displayed inline
- [x] Nested function chunks are disassembled recursively

### US-4: Bytecode Optimization

As a developer, I want the compiler to optimize bytecode so that programs run efficiently without manual tuning.

**Acceptance Criteria:**
- [x] Constant folding evaluates compile-time constant expressions
- [x] Dead code elimination removes unreachable instructions after RETURN/JMP
- [x] Peephole optimization simplifies redundant instruction sequences
- [x] Optimizations preserve program semantics (correctness over speed)

### US-5: Serialization Format

As a developer, I want a well-defined binary format for `.tinyc` files so that bytecode can be stored, transmitted, and versioned.

**Acceptance Criteria:**
- [x] Binary format starts with magic bytes `TINY` (0x54 0x49 0x4E 0x59)
- [x] Format includes a version number for forward compatibility
- [x] Constant pool is serialized with type tags for each value
- [x] Line information is preserved for runtime error reporting
- [x] Nested function chunks are serialized recursively

## Non-Functional Requirements

### NFR-1: Compilation Speed
- Compilation of programs under 1000 lines completes in under 500ms
- No exponential blowup on deeply nested expressions

### NFR-2: VM Execution Speed
- Bytecode execution is measurably faster than tree-walk interpretation
- Fibonacci(30) completes in under 2 seconds

### NFR-3: Binary Size
- Compiled `.tinyc` files are smaller than the source `.tiny` files for non-trivial programs
- No unnecessary padding or alignment in the binary format
