# TinyLang - Implementation Tasks

## Subsystem Task Lists

Detailed task breakdowns for each major subsystem:

- **[Compiler & VM Tasks](./compiler-vm/tasks.md)** - Opcode definition, compiler passes, VM implementation, optimizer, serialization
- **[Debugger Tasks](./debugger/tasks.md)** - Debug hooks, breakpoints, stepping, inspection, CLI
- **[Web IDE Tasks](./web-ide/tasks.md)** - Build system, editor, execution, panels, themes, sharing
- **[Toolchain Tasks](./toolchain/tasks.md)** - Formatter, linter, test runner, module system

## Phase 1: Core Language Engine ✅

### Task 1.1: Lexer Implementation ✅
- [x] Define token types enum (TokenType)
- [x] Implement Lexer class with `tokenize()` method
- [x] Handle single-char tokens (parens, brackets, operators)
- [x] Handle multi-char tokens (==, !=, <=, >=, =>, **, +=, etc.)
- [x] Implement string literal scanning with escape sequences
- [x] Implement number literal scanning (int and float)
- [x] Implement identifier/keyword scanning
- [x] Handle single-line (//) and multi-line (/* */) comments
- [x] Track line and column for all tokens
- [x] Implement meaningful newline handling (statement separators)
- [x] Create LexerError with friendly messages and hints

### Task 1.2: Parser Implementation ✅
- [x] Implement recursive descent parser structure
- [x] Parse variable declarations (let, const)
- [x] Parse function declarations with parameters and defaults
- [x] Parse class declarations with methods and properties
- [x] Parse if/else if/else statements
- [x] Parse while loops
- [x] Parse for...in loops
- [x] Parse match/when statements
- [x] Parse return, break, continue statements
- [x] Parse print statement
- [x] Implement Pratt parsing for expressions with precedence
- [x] Parse literals (number, string, boolean, null, array, object)
- [x] Parse binary, unary, logical expressions
- [x] Parse call expressions
- [x] Parse member access (dot notation) and index access (brackets)
- [x] Parse arrow functions
- [x] Parse ternary expressions
- [x] Parse range expressions (0..10)
- [x] Create ParseError with friendly messages
- [x] Implement error recovery (synchronize to next statement)

### Task 1.3: Interpreter Implementation ✅
- [x] Create Environment class with scoping (done in types)
- [x] Implement statement evaluation (all statement types)
- [x] Implement expression evaluation (all expression types)
- [x] Implement variable lookup and assignment with scope chains
- [x] Implement function calls with closures
- [x] Implement class instantiation and method dispatch
- [x] Implement control flow signals (Return, Break, Continue)
- [x] Implement inheritance and super method lookup
- [x] Create RuntimeError with source context

### Task 1.4: Standard Library ✅
- [x] Implement I/O functions (print, input)
- [x] Implement math functions (abs, floor, ceil, round, sqrt, random, min, max)
- [x] Implement string functions (len, split, join, upper, lower, trim, contains, replace)
- [x] Implement array functions (push, pop, shift, map, filter, reduce, sort, reverse, slice)
- [x] Implement type functions (type, str, num, bool)
- [x] Implement utility functions (range, keys, values, time)
- [x] Register all stdlib functions in global environment

## Phase 2: User Interfaces ✅

### Task 2.1: CLI Tool ✅
- [x] Set up CLI with version and help
- [x] Implement `run` command (read file, execute, display output/errors)
- [x] Implement `repl` command (start interactive mode)
- [x] Implement `check` command (parse only, report errors)
- [x] Implement `format` command (pretty-print AST back to source)
- [x] Implement `lint` command (run linter rules)
- [x] Implement `test` command (discover and run test blocks)
- [x] Implement `compile` command (produce .tinyc bytecode)
- [x] Implement `disassemble` command (show bytecode listing)
- [x] Implement `debug` command (interactive debugger)
- [x] Add colorized output with ANSI codes
- [x] Handle file not found and permission errors gracefully

### Task 2.2: REPL ✅
- [x] Implement basic read-eval-print loop
- [x] Detect multi-line input (unclosed braces/parens)
- [x] Auto-print expression results
- [x] Implement dot commands (.help, .clear, .exit, .examples)
- [x] Colorize output (values in green, errors in red, hints in yellow)
- [x] Persist environment between lines
- [x] Show welcome banner with language version

### Task 2.3: Web IDE ✅
- [x] Create build system (esbuild IIFE bundle)
- [x] Implement CodeMirror 6 editor with TinyLang syntax
- [x] Implement execution engine with output capture
- [x] Implement file explorer with virtual filesystem
- [x] Implement debugger panel with visual controls
- [x] Implement AST viewer with collapsible tree
- [x] Implement bytecode viewer with disassembly
- [x] Add theme support (light/dark)
- [x] Add code sharing via URL
- [x] Add example program dropdown
- [x] Responsive design

## Phase 3: Quality & Polish ✅

### Task 3.1: Test Suite ✅
- [x] Lexer unit tests (all token types, edge cases, errors)
- [x] Parser unit tests (all statement/expression types)
- [x] Interpreter unit tests (evaluation correctness)
- [x] Compiler unit tests (instruction emission)
- [x] VM unit tests (opcode execution)
- [x] Optimizer unit tests (transform correctness)
- [x] Debugger integration tests (session control)
- [x] Formatter unit tests (idempotency)
- [x] Linter unit tests (each rule)
- [x] Test runner tests (discovery and execution)
- [x] Stdlib unit tests (all built-in functions)
- [x] Integration tests (complete programs)
- [x] Error message tests (verify hints are helpful)
- [x] Edge case tests (empty programs, deeply nested, large inputs)

### Task 3.2: Example Programs ✅
- [x] 01-hello.tiny - Hello World
- [x] 02-variables.tiny - Variable declarations and types
- [x] 03-functions.tiny - Function definitions and closures
- [x] 04-arrays.tiny - Array manipulation
- [x] 05-loops.tiny - Loops, ranges, break/continue
- [x] 06-classes.tiny - OOP with inheritance
- [x] 07-fibonacci.tiny - Classic algorithm
- [x] 08-sorting.tiny - Sorting algorithms
- [x] 09-functional.tiny - Functional composition and pipelines
- [x] 10-match.tiny - Pattern matching
- [x] 10-new-features.tiny - Newer language features

### Task 3.3: Documentation ✅
- [x] Comprehensive README with badges, architecture, features
- [x] Documentation site with multiple pages
- [x] Installation and setup instructions
- [x] "How Kiro Was Used" section
- [x] Contributing guide
- [x] Architecture diagrams

## Phase 4: Kiro Integration Showcase ✅

### Task 4.1: Kiro Configuration ✅
- [x] Steering files (coding standards, language spec, project overview)
- [x] Feature specs (requirements, design, tasks) for all subsystems
- [x] Hooks (format on save, test on save, build check, lint, validate examples)
- [x] Testing guide steering file
- [x] Architecture decisions steering file
- [x] Web IDE guide steering file

## Phase 5: Compiler, VM & Advanced Features ✅

### Task 5.1: Bytecode Compiler ✅
- [x] Define 63 opcodes organized by category
- [x] Implement single-pass AST-to-bytecode compilation
- [x] Handle all language features (vars, functions, classes, control flow)
- [x] Implement closure compilation with upvalues
- [x] Implement class compilation with methods and inheritance

### Task 5.2: Virtual Machine ✅
- [x] Implement stack-based execution engine
- [x] Implement all opcodes (arithmetic, control flow, functions, OOP)
- [x] Implement call frame stack for function calls
- [x] Stack overflow detection
- [x] Native function integration

### Task 5.3: Optimizer ✅
- [x] Constant folding pass
- [x] Dead code elimination pass
- [x] Peephole optimization pass

### Task 5.4: Serialization ✅
- [x] Binary format with TINY magic bytes and versioning
- [x] Type-tagged constant pool serialization
- [x] Nested function chunk serialization
- [x] Deserialization with format validation

### Task 5.5: Debugger ✅
- [x] Replay-based architecture
- [x] Breakpoints (line-based and conditional)
- [x] Step execution (step, over, out, continue)
- [x] Variable inspection
- [x] Watch expressions
- [x] Call stack display

### Task 5.6: Toolchain ✅
- [x] AST-based formatter
- [x] Rule-based linter (5 rules)
- [x] Inline test runner with assertions
- [x] Module system with caching and circular dependency detection

## Phase 6: Advanced Language Features ✅

### Task 6.1: String Interpolation ✅
- [x] Implement f-string prefix parsing in lexer
- [x] Parse interpolation expressions inside {braces}
- [x] Evaluate interpolated expressions at runtime
- [x] Support arbitrary expressions including function calls
- [x] Handle nested braces and edge cases
- [x] Add tests for all interpolation scenarios

### Task 6.2: Error Handling (Try/Catch/Throw) ✅
- [x] Add try/catch/throw keywords to lexer
- [x] Parse try/catch blocks as statements
- [x] Parse throw expressions
- [x] Implement try/catch execution in interpreter
- [x] Error propagation through call stack
- [x] Error objects with message property
- [x] Add comprehensive tests

### Task 6.3: Spread Operator ✅
- [x] Parse spread syntax (...expr) in array literals
- [x] Evaluate spread in array construction
- [x] Support spreading arrays and strings
- [x] Add tests for spread behavior

### Task 6.4: Destructuring ✅
- [x] Parse array destructuring patterns in let/const
- [x] Parse object destructuring patterns in let/const
- [x] Implement array destructuring assignment
- [x] Implement object destructuring assignment
- [x] Handle edge cases (missing values, extra values)
- [x] Add tests for all destructuring patterns

### Task 6.5: Developer Experience ✅
- [x] "Did you mean?" typo suggestions using Levenshtein distance
- [x] AST command for CLI (display parse tree)
- [x] Profile command for CLI (execution statistics)
- [x] Add tests for typo suggestions
