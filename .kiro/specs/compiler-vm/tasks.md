# Compiler & Virtual Machine - Implementation Tasks

## Phase 1: Core Compiler

### Task 1.1: Opcode Definition ✅
- [x] Define OpCode enum with hex values organized by category
- [x] Implement `opcodeName()` helper for disassembly
- [x] Document each opcode with its stack effect and operand layout
- [x] Group opcodes logically (stack, arithmetic, comparison, control, variables, functions, data, OOP)

### Task 1.2: Chunk Data Structure ✅
- [x] Implement Chunk class with code array, constants pool, and line info
- [x] Add `write()` method for emitting bytes with line tracking
- [x] Add `addConstant()` method for constant pool management
- [x] Add serialization methods (`serialize()` / `deserialize()`)
- [x] Define magic bytes and format version constants
- [x] Implement type-tagged constant serialization

### Task 1.3: Expression Compilation ✅
- [x] Compile number, string, boolean, null literals (emit CONST)
- [x] Compile binary expressions (emit left, right, operator opcode)
- [x] Compile unary expressions (emit operand, NEGATE/NOT)
- [x] Compile logical expressions with short-circuit jumps
- [x] Compile ternary expressions using conditional jumps
- [x] Compile array and object literals
- [x] Compile member access and index expressions
- [x] Compile assignment expressions

### Task 1.4: Statement Compilation ✅
- [x] Compile variable declarations (emit initializer, STORE)
- [x] Compile if/else with conditional jumps and backpatching
- [x] Compile while loops with LOOP opcode for backward jumps
- [x] Compile for-in loops (desugar to index-based iteration)
- [x] Compile match/when statements (chained conditional jumps)
- [x] Compile print statements (emit PRINT opcode)
- [x] Compile return statements (emit RETURN opcode)
- [x] Compile break/continue with loop jump tracking

### Task 1.5: Function Compilation ✅
- [x] Compile function declarations into nested Chunks
- [x] Emit CLOSURE opcode with upvalue descriptor array
- [x] Track local variable slots and scope depth
- [x] Handle default parameter values
- [x] Compile arrow functions (same as named functions, anonymous chunk)
- [x] Resolve upvalues for closure captures

### Task 1.6: Class Compilation ✅
- [x] Emit CLASS opcode with class name constant
- [x] Compile method declarations and emit METHOD opcodes
- [x] Handle constructor (init) method specially
- [x] Emit INHERIT opcode for subclass declarations
- [x] Handle `this` references via GET_THIS opcode
- [x] Compile `new ClassName()` as NEW_INSTANCE + CALL

## Phase 2: Virtual Machine

### Task 2.1: VM Core ✅
- [x] Implement operand stack (fixed-size array with stack pointer)
- [x] Implement call frame stack (frames with ip, basePointer, closure)
- [x] Write the main execution loop (fetch-decode-execute)
- [x] Handle stack overflow detection (configurable max depth)
- [x] Implement VM reset and error recovery

### Task 2.2: Arithmetic and Comparison ✅
- [x] Implement ADD for numbers (addition) and strings (concatenation)
- [x] Implement SUB, MUL, DIV, MOD, POW for numeric operands
- [x] Implement NEGATE for numeric negation
- [x] Implement all comparison opcodes (EQ, NEQ, LT, LTE, GT, GTE)
- [x] Implement NOT for boolean negation
- [x] Add type checking with helpful runtime errors

### Task 2.3: Control Flow ✅
- [x] Implement JMP (unconditional jump by offset)
- [x] Implement JMP_IF_FALSE (conditional jump, pops condition)
- [x] Implement JMP_IF_TRUE (conditional jump, pops condition)
- [x] Implement LOOP (backward jump for while/for loops)
- [x] Verify jump offsets are within chunk bounds

### Task 2.4: Variable Access ✅
- [x] Implement LOAD_LOCAL / STORE_LOCAL (stack-slot indexed)
- [x] Implement LOAD_GLOBAL / STORE_GLOBAL (name-based lookup)
- [x] Implement LOAD_UPVALUE / STORE_UPVALUE (closure captures)
- [x] Register stdlib globals before execution begins
- [x] Handle undefined variable errors with suggestions

### Task 2.5: Function Calls ✅
- [x] Implement CALL (push new frame, transfer control)
- [x] Implement RETURN (pop frame, push return value)
- [x] Implement CLOSURE (create closure with upvalue bindings)
- [x] Handle native function calls (stdlib functions)
- [x] Validate argument count against arity

### Task 2.6: Data Structures ✅
- [x] Implement ARRAY (pop N items, create array value)
- [x] Implement OBJECT (pop N key-value pairs, create object)
- [x] Implement INDEX (array/object subscript access)
- [x] Implement SET_INDEX (array/object subscript assignment)
- [x] Implement GET_PROP / SET_PROP (object dot-access)

### Task 2.7: OOP Support ✅
- [x] Implement CLASS (create class value on stack)
- [x] Implement METHOD (bind function as method on class)
- [x] Implement INHERIT (copy parent methods to subclass)
- [x] Implement NEW_INSTANCE (instantiate class, call init)
- [x] Implement GET_THIS (push `this` reference onto stack)

## Phase 3: Optimizer

### Task 3.1: Constant Folding ✅
- [x] Detect CONST-CONST-OP patterns in bytecode
- [x] Evaluate arithmetic operations at compile time
- [x] Evaluate string concatenation at compile time
- [x] Replace three-instruction sequence with single CONST
- [x] Update constant pool with folded values
- [x] Preserve correctness for edge cases (division by zero)

### Task 3.2: Dead Code Elimination ✅
- [x] Identify instructions after unconditional RETURN
- [x] Identify instructions after unconditional JMP (with no incoming jumps)
- [x] Remove dead instructions from bytecode
- [x] Recalculate jump offsets after removal
- [x] Preserve line information mapping

### Task 3.3: Peephole Optimization ✅
- [x] Pattern: NOT(true) -> false, NOT(false) -> true
- [x] Pattern: DUP followed by POP -> remove both
- [x] Pattern: double NEGATE -> remove both
- [x] Implement single-pass pattern matching over bytecode
- [x] Ensure patterns do not cross jump boundaries

## Phase 4: Disassembler & Serialization

### Task 4.1: Disassembler ✅
- [x] Implement `disassemble()` for full chunk listing
- [x] Implement `disassembleInstruction()` for single-instruction output
- [x] Format: offset, line (with `|` for same line), opcode name, operands
- [x] Show constant values inline for CONST instructions
- [x] Recursively disassemble nested function chunks
- [x] Handle variable-length instructions (CLOSURE upvalue descriptors)

### Task 4.2: Binary Serialization ✅
- [x] Write magic bytes and version header
- [x] Serialize chunk name (length-prefixed UTF-8)
- [x] Serialize bytecode array (length-prefixed)
- [x] Serialize line information (parallel array)
- [x] Serialize constant pool with type tags
- [x] Handle nested CompiledFunction constants recursively
- [x] Implement deserialization with format validation
- [x] Reject files with wrong magic bytes or unsupported version

## Phase 5: CLI Integration

### Task 5.1: Compile Command ✅
- [x] Add `compile` subcommand to CLI
- [x] Read source file, lex, parse, compile
- [x] Apply optimizer passes
- [x] Serialize to `.tinyc` file (same name, different extension)
- [x] Report compilation stats (instruction count, constant pool size)
- [x] Handle and report compilation errors gracefully

### Task 5.2: Run Compiled Files ✅
- [x] Detect `.tinyc` extension in `run` command
- [x] Deserialize chunk from binary file
- [x] Execute on VM instead of tree-walk interpreter
- [x] Map runtime errors back to source lines
- [x] Support both interpreted and compiled execution paths

### Task 5.3: Disassemble Command ✅
- [x] Add `disassemble` subcommand to CLI
- [x] Accept `.tiny` (compile first) or `.tinyc` (load directly) files
- [x] Pretty-print the disassembly output with colors
- [x] Show constant pool summary
