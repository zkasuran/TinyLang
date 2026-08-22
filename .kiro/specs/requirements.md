# TinyLang - Requirements

## Overview

TinyLang is a complete educational programming language with a full professional toolchain: interpreter, bytecode compiler, virtual machine, interactive debugger, code formatter, linter, test runner, module system, CLI, REPL, and Web IDE. It teaches programming concepts to beginners through friendly syntax, helpful error messages, and an interactive learning environment.

## Subsystem Specs

Detailed requirements for each major subsystem are in their own directories:

- **[Compiler & VM](./compiler-vm/requirements.md)** - Bytecode compilation, stack-based VM, optimizer, disassembler
- **[Debugger](./debugger/requirements.md)** - Breakpoints, stepping, variable inspection, watch expressions
- **[Web IDE](./web-ide/requirements.md)** - Browser-based IDE with CodeMirror editor, debugger panel, AST viewer
- **[Toolchain](./toolchain/requirements.md)** - Formatter, linter, test runner, module system

## Core Language User Stories

### US-1: Running Programs
As a beginner programmer, I want to write TinyLang code in a file and run it from the command line so that I can see my programs execute.

**Acceptance Criteria:**
- [x] Can execute `.tiny` files via `tinylang run <file.tiny>`
- [x] Program output appears in stdout
- [x] Errors display with line numbers and helpful hints
- [x] Exit code 0 on success, 1 on error

### US-2: Interactive REPL
As a learner, I want an interactive mode where I can type expressions and see results immediately so that I can experiment with the language.

**Acceptance Criteria:**
- [x] REPL starts with `tinylang repl`
- [x] Each expression result is displayed automatically
- [x] Multi-line input supported (blocks with `{`)
- [x] History and arrow key navigation
- [x] `.help`, `.clear`, `.exit` commands

### US-3: Variable Declaration
As a beginner, I want to declare variables with clear keywords so I understand the concept of storing values.

**Acceptance Criteria:**
- [x] `let` declares mutable variables
- [x] `const` declares immutable constants
- [x] Reassigning a `const` produces a clear error message
- [x] Variables must be declared before use

### US-4: Functions
As a learner, I want to define and call functions so I understand code reuse and abstraction.

**Acceptance Criteria:**
- [x] Functions defined with `fn name(params) { body }`
- [x] Functions can return values with `return`
- [x] Default parameter values supported
- [x] Arrow function syntax for short functions
- [x] Closures work correctly (functions capture their environment)

### US-5: Control Flow
As a student, I want if/else, loops, and match statements so I can write programs with logic and repetition.

**Acceptance Criteria:**
- [x] `if/else if/else` chains work
- [x] `while` loops with `break` and `continue`
- [x] `for...in` loops over arrays and ranges
- [x] `match/when` pattern matching
- [x] Nested control flow works correctly

### US-6: Data Structures
As a programmer, I want arrays and objects so I can organize and work with collections of data.

**Acceptance Criteria:**
- [x] Array literals: `[1, 2, 3]`
- [x] Array indexing: `arr[0]`
- [x] Object literals: `{key: value}`
- [x] Object property access: `obj.key`
- [x] Built-in methods: `push`, `pop`, `len`, `map`, `filter`

### US-7: Classes and OOP
As an intermediate learner, I want classes so I can learn object-oriented programming concepts.

**Acceptance Criteria:**
- [x] Class declaration with `class Name { }`
- [x] Constructor via `fn init(...)`
- [x] Instance methods and properties
- [x] Inheritance with `extends`
- [x] `this` keyword for self-reference
- [x] `new ClassName()` for instantiation

### US-8: Educational Errors
As a beginner, I want errors that explain what went wrong and how to fix it so I don't get stuck.

**Acceptance Criteria:**
- [x] Every error shows the exact line and column
- [x] Error messages avoid jargon
- [x] Each error includes a "hint" suggesting the fix
- [x] Source context is shown with a pointer to the error location

### US-9: Web Playground
As a teacher, I want a browser-based playground so students can try TinyLang without installing anything.

**Acceptance Criteria:**
- [x] Code editor with syntax highlighting (CodeMirror 6)
- [x] Run button executes code
- [x] Output panel shows results
- [x] Example programs loadable from a dropdown
- [x] Works entirely client-side (no server needed)
- [x] Debugger panel with step execution
- [x] AST and bytecode viewer panels

### US-10: Standard Library
As a developer, I want built-in functions for common tasks so I can be productive without importing external code.

**Acceptance Criteria:**
- [x] I/O: `print`, `input`
- [x] Math: `abs`, `floor`, `ceil`, `round`, `random`, `min`, `max`, `sqrt`
- [x] Strings: `len`, `split`, `join`, `upper`, `lower`, `trim`, `contains`
- [x] Arrays: `push`, `pop`, `shift`, `map`, `filter`, `reduce`, `sort`, `reverse`
- [x] Type system: `type`, `str`, `num`, `bool`
- [x] Utilities: `range`, `keys`, `values`

### US-11: Bytecode Compiler
As a developer, I want to compile TinyLang programs to bytecode for faster execution and portable distribution.

**Acceptance Criteria:**
- [x] `tinylang compile <file.tiny>` produces `.tinyc` bytecode
- [x] `tinylang run <file.tinyc>` executes compiled bytecode on the VM
- [x] `tinylang disassemble <file>` shows human-readable instruction listing
- [x] Optimizer applies constant folding and dead code elimination
- [x] See [Compiler & VM Spec](./compiler-vm/requirements.md) for full details

### US-12: Interactive Debugger
As a learner, I want to step through code with breakpoints and variable inspection so I can understand execution flow.

**Acceptance Criteria:**
- [x] `tinylang debug <file.tiny>` starts an interactive debug session
- [x] Set breakpoints by line number (with optional conditions)
- [x] Step through code one statement at a time
- [x] Inspect variables and evaluate expressions at any pause point
- [x] See [Debugger Spec](./debugger/requirements.md) for full details

### US-13: Code Formatter
As a developer, I want automatic code formatting so my programs follow a consistent style.

**Acceptance Criteria:**
- [x] `tinylang format <file.tiny>` reformats source in place
- [x] Formatter is AST-based and idempotent
- [x] See [Toolchain Spec](./toolchain/requirements.md) for full details

### US-14: Code Linter
As a developer, I want static analysis to catch common mistakes before runtime.

**Acceptance Criteria:**
- [x] `tinylang lint <file.tiny>` reports diagnostics
- [x] Five built-in rules (unused-variables, unreachable-code, no-empty-blocks, prefer-const, no-shadow)
- [x] See [Toolchain Spec](./toolchain/requirements.md) for full details

### US-15: Test Runner
As a developer, I want to write and run tests for my TinyLang programs.

**Acceptance Criteria:**
- [x] Inline `test "description" { ... }` blocks in any file
- [x] Built-in assertion functions (assert, assertEqual, assertNotEqual, assertThrows)
- [x] `tinylang test <file.tiny>` discovers and runs all tests
- [x] See [Toolchain Spec](./toolchain/requirements.md) for full details

## Non-Functional Requirements

### NFR-1: Performance
- Programs with <1000 lines execute in <1 second (interpreted)
- Bytecode execution is measurably faster than tree-walk
- REPL response time <100ms for simple expressions
- Formatter/linter process 1000 lines in <300ms

### NFR-2: Compatibility
- Works on Node.js 18+ (LTS versions)
- Web playground works in modern browsers (Chrome, Firefox, Safari, Edge)
- CLI works on Linux, macOS, and Windows

### NFR-3: Code Quality
- 90%+ test coverage on core modules (lexer, parser, interpreter)
- No `any` types in TypeScript (strict mode)
- All public APIs documented with JSDoc
- 338+ automated tests passing

### NFR-4: Usability
- Installation via `npm install` + `npm run build`
- REPL available within 3 seconds of running the command
- Web playground loads in <2 seconds
- All errors include actionable hints
