# TinyLang — Implementation Tasks

## Phase 1: Core Language Engine

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

### Task 1.2: Parser Implementation
- [ ] Implement recursive descent parser structure
- [ ] Parse variable declarations (let, const)
- [ ] Parse function declarations with parameters and defaults
- [ ] Parse class declarations with methods and properties
- [ ] Parse if/else if/else statements
- [ ] Parse while loops
- [ ] Parse for...in loops
- [ ] Parse match/when statements
- [ ] Parse return, break, continue statements
- [ ] Parse print statement
- [ ] Implement Pratt parsing for expressions with precedence
- [ ] Parse literals (number, string, boolean, null, array, object)
- [ ] Parse binary, unary, logical expressions
- [ ] Parse call expressions
- [ ] Parse member access (dot notation) and index access (brackets)
- [ ] Parse arrow functions
- [ ] Parse ternary expressions
- [ ] Parse range expressions (0..10)
- [ ] Create ParseError with friendly messages
- [ ] Implement error recovery (synchronize to next statement)

### Task 1.3: Interpreter Implementation
- [ ] Create Environment class with scoping (done in types)
- [ ] Implement statement evaluation (all statement types)
- [ ] Implement expression evaluation (all expression types)
- [ ] Implement variable lookup and assignment with scope chains
- [ ] Implement function calls with closures
- [ ] Implement class instantiation and method dispatch
- [ ] Implement control flow signals (Return, Break, Continue)
- [ ] Implement inheritance and super method lookup
- [ ] Create RuntimeError with source context

### Task 1.4: Standard Library
- [ ] Implement I/O functions (print, input)
- [ ] Implement math functions (abs, floor, ceil, round, sqrt, random, min, max)
- [ ] Implement string functions (len, split, join, upper, lower, trim, contains, replace)
- [ ] Implement array functions (push, pop, shift, map, filter, reduce, sort, reverse, slice)
- [ ] Implement type functions (type, str, num, bool)
- [ ] Implement utility functions (range, keys, values, time)
- [ ] Register all stdlib functions in global environment

## Phase 2: User Interfaces

### Task 2.1: CLI Tool
- [ ] Set up Commander.js with version and help
- [ ] Implement `run` command (read file, execute, display output/errors)
- [ ] Implement `repl` command (start interactive mode)
- [ ] Implement `check` command (parse only, report errors)
- [ ] Implement `format` command (pretty-print AST back to source)
- [ ] Add colorized output with chalk
- [ ] Handle file not found and permission errors gracefully
- [ ] Add shebang support for `#!/usr/bin/env tinylang`

### Task 2.2: REPL
- [ ] Implement basic read-eval-print loop
- [ ] Detect multi-line input (unclosed braces/parens)
- [ ] Auto-print expression results
- [ ] Implement dot commands (.help, .clear, .exit, .examples)
- [ ] Colorize output (values in green, errors in red, hints in yellow)
- [ ] Persist environment between lines
- [ ] Show welcome banner with language version

### Task 2.3: Web Playground
- [ ] Create single-page HTML application
- [ ] Implement code editor with basic highlighting
- [ ] Bundle interpreter for browser execution
- [ ] Add Run button and Ctrl+Enter shortcut
- [ ] Add output console panel
- [ ] Add example program dropdown selector
- [ ] Style with responsive CSS
- [ ] Add share-via-URL feature (base64 encoding)

## Phase 3: Quality & Polish

### Task 3.1: Test Suite
- [ ] Lexer unit tests (all token types, edge cases, errors)
- [ ] Parser unit tests (all statement/expression types)
- [ ] Interpreter unit tests (evaluation correctness)
- [ ] Stdlib unit tests (all built-in functions)
- [ ] Integration tests (complete programs)
- [ ] Error message tests (verify hints are helpful)
- [ ] Edge case tests (empty programs, deeply nested, large inputs)

### Task 3.2: Example Programs
- [ ] hello.tiny — Hello World
- [ ] variables.tiny — Variable declarations and types
- [ ] math.tiny — Arithmetic and math functions
- [ ] strings.tiny — String operations
- [ ] arrays.tiny — Array manipulation
- [ ] functions.tiny — Function definitions and closures
- [ ] loops.tiny — All loop types with break/continue
- [ ] classes.tiny — OOP with inheritance
- [ ] fibonacci.tiny — Classic algorithm
- [ ] guess-game.tiny — Interactive number guessing game
- [ ] todo-list.tiny — Data structure manipulation
- [ ] sorting.tiny — Implement sorting algorithms

### Task 3.3: Documentation
- [ ] Comprehensive README with badges, screenshots, architecture
- [ ] Language Reference (complete syntax documentation)
- [ ] Installation and setup instructions (< 3 steps)
- [ ] "How Kiro Was Used" section with screenshots/descriptions
- [ ] Contributing guide
- [ ] Architecture diagram (text-based)
- [ ] CHANGELOG

## Phase 4: Kiro Integration Showcase

### Task 4.1: Kiro Configuration
- [x] Steering files (coding standards, language spec, project overview)
- [x] Feature specs (requirements, design, tasks)
- [ ] Hooks (format on save, test on commit)
- [ ] Document Kiro workflow in README
