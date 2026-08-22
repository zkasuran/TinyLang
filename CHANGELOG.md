# Changelog

All notable changes to TinyLang are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-08-22

### Added

#### Language Features
- String interpolation with f-strings: `f"Hello {name}, you are {age} years old"`
- Try/catch/throw error handling with error propagation
- Spread operator in arrays: `[...arr1, ...arr2]`
- Array and object destructuring: `let [a, b] = [1, 2]`, `let {name, age} = person`
- "Did you mean?" typo suggestions for undefined variables (Levenshtein distance)
- Range expressions: `0..10` generates sequential values

#### Examples
- `13-algorithms.tiny` -- Binary search, quicksort, sieve of Eratosthenes, GCD, matrix multiplication, power set
- `14-data-structures.tiny` -- Stack, Queue, Linked List, Binary Search Tree, HashMap
- `15-game.tiny` -- Text adventure game engine with rooms, items, and player inventory
- `16-compiler-demo.tiny` -- Comprehensive demo of compiler/VM features vs interpreter
- `17-testing.tiny` -- Built-in test framework showcase with 11 test cases

#### Documentation
- Expanded `.kiro/steering/` with 4 new steering files:
  - `error-handling.md` -- Error class hierarchy, message guidelines, recovery strategies
  - `documentation-standards.md` -- Writing style, code examples, API documentation format
  - `performance.md` -- Benchmarking, VM optimization, memory management guidelines
  - `testing-standards.md` -- Test organization, naming, coverage expectations
- Expanded `.kiro/hooks/` with 3 new automation hooks:
  - `pre-commit.json` -- Lint and test before commits
  - `generate-docs.json` -- Reminder to update docs when stdlib changes
  - `benchmark-check.json` -- Run benchmarks when compiler/VM code changes
- New `.kiro/specs/testing-framework/` -- Requirements, design, and tasks for the test runner
- New `.kiro/specs/ide-spec/` -- Requirements, design, and tasks for the Web IDE

### Improved
- Documentation site now has 8 comprehensive HTML pages with responsive design
- README badges updated to reflect 399 passing tests
- All example programs verified to run correctly on both interpreter and VM

### Fixed
- VM stdlib integration bug resolved (dynamic global extraction from Environment)
- Playground default code and syntax highlighter corrections

## [1.0.0] - 2025-07-14

The initial release of TinyLang -- a complete programming language toolchain built from scratch in TypeScript.

### Language

- Complete lexer with position tracking, educational error messages, and escape sequence handling
- Recursive descent parser with Pratt expression parsing for correct operator precedence
- Tree-walk interpreter with environment chains, closures, and full stdlib integration
- 6 data types: number, string, boolean, null, array, object
- Variables with `let` (mutable) and `const` (immutable)
- Functions with default parameters, closures, and arrow syntax
- Classes with constructor (`init`), methods, properties, and inheritance via `extends`
- Control flow: if/else, while, for-in, range expressions (`0..10`), match/when, break, continue
- Compound assignment operators: `+=`, `-=`, `*=`, `/=`
- String repetition operator: `"ha" * 3`
- Ternary expressions

### Compiler and VM

- 44-opcode bytecode instruction set covering all language features
- Constant pool for literals, function templates, and class descriptors
- Upvalue tracking for closure compilation
- Two-pass optimizer: constant folding and dead code elimination
- Binary serialization to `.tinyc` format with magic number and version header
- Stack-based virtual machine with call frame architecture
- VM closure implementation via upvalue pointers (open and closed)
- Execution limits to prevent infinite loops and stack overflow
- Bytecode disassembler for human-readable instruction listing

### CLI Tool

- `run` -- execute source files or compiled bytecode
- `compile` -- compile source to `.tinyc` binary
- `exec` -- compile and immediately execute via VM
- `debug` -- launch interactive debugger session
- `fmt` -- format source code (AST-based)
- `lint` -- static analysis with 5 rules
- `test` -- discover and run inline test blocks
- `doc` -- extract documentation from source
- `check` -- syntax verification without execution
- `repl` -- interactive Read-Eval-Print Loop
- `init` -- scaffold a new TinyLang project
- `bench` -- benchmark interpreted vs compiled execution
- Colorized output with error, warning, success, and info styles
- Educational error messages with hints in all commands

### Interactive Debugger

- Line-based breakpoints (`break 15`)
- Conditional breakpoints (`break 15 when x > 5`)
- Step over, step into, step out execution controls
- Variable inspection at any pause point
- Watch expressions that re-evaluate on each step
- Call stack display with source locations
- Expression evaluation at breakpoints
- Replay-based architecture for consistent state

### Formatter

- AST-based formatting (parse then re-print)
- Idempotent output (formatting twice produces identical result)
- Configurable indent width
- Preserves semantic structure
- Handles all language constructs including nested classes and closures

### Linter

- Rule: `unused-variables` -- detect declared but never-read variables
- Rule: `unreachable-code` -- statements after return/break/continue
- Rule: `no-empty-blocks` -- empty if/while/for/function bodies
- Rule: `prefer-const` -- variables never reassigned should use const
- Rule: `no-shadow` -- inner variables hiding outer scope declarations
- Configurable severity levels (error, warning, info)
- Auto-fix capability with `--fix` flag
- Colored diagnostic output with source context

### Test Runner

- First-class `test "name" { ... }` syntax blocks
- Test discovery within source files
- Assertion functions: `expectToBe`, `expectToBeTrue`, `expectToBeFalse`, `expectToThrow`
- Isolated test execution (tests do not share state)
- Colored pass/fail reporting with summary statistics

### Module System

- Import syntax: `import { x, y } from "module"`
- Module resolution from stdlib and relative paths
- Circular dependency detection with clear error messages
- Standard library exposed as importable modules

### Standard Library

- **IO** (2 functions): `print`, `input`
- **Math** (14 functions): `abs`, `floor`, `ceil`, `round`, `sqrt`, `pow`, `sin`, `cos`, `tan`, `log`, `random`, `randomInt`, `min`, `max` + constants `PI`, `E`, `TAU`, `INFINITY`
- **Strings** (14 functions): `len`, `upper`, `lower`, `trim`, `split`, `join`, `contains`, `replace`, `charAt`, `startsWith`, `endsWith`, `repeat`, `padStart`, `padEnd`
- **Arrays** (14 functions): `push`, `pop`, `shift`, `unshift`, `slice`, `concat`, `indexOf`, `includes`, `sort`, `reverse`, `flatten`, `zip`, `enumerate`, `unique` + methods `.map`, `.filter`, `.reduce`, `.forEach`
- **Types** (9 functions): `type`, `str`, `num`, `bool`, `isNumber`, `isString`, `isArray`, `isNull`, `isFunction`
- **Utils** (8 functions): `range`, `keys`, `values`, `entries`, `time`, `clone`, `assert`, `format`

### Web IDE

- CodeMirror 6 editor with TinyLang syntax highlighting
- Auto-completion for keywords and standard library functions
- Virtual file system with file explorer panel
- Integrated debugger: set breakpoints, step over/into/out, inspect variables
- Real-time AST visualizer panel
- Bytecode disassembly viewer panel
- Performance profiler panel
- Dark and light theme with toggle
- Share programs via URL encoding
- Responsive design for desktop and tablet
- Keyboard shortcuts (Ctrl+Enter to run, Ctrl+S to save)
- 10 preloaded example programs

### Documentation Site

- Getting Started guide (installation, first program, REPL)
- Complete Language Reference (syntax, types, operators, control flow)
- Standard Library API reference (60+ functions with signatures and examples)
- Architecture Guide (system design, data flow, component interactions)
- CLI Reference (all 12 commands with options)
- Examples Gallery (annotated walkthroughs)
- Contributing Guide (setup, standards, workflow)
- Responsive CSS with dark/light mode toggle
- Syntax-highlighted code blocks

### Kiro Integration

- `.kiro/specs/requirements.md` -- 15 user stories with acceptance criteria
- `.kiro/specs/design.md` -- complete system architecture document
- `.kiro/specs/tasks.md` -- phased implementation task list
- 4 subsystem specs (compiler-vm, debugger, toolchain, web-ide) each with requirements, design, and tasks
- 6 steering files: project-overview, coding-standards, language-spec, architecture-decisions, testing-guide, web-ide-guide
- 7 automation hooks: build-check, test-on-save, format-on-save, lint-on-save, validate-examples, docs-check, playground-build

### Testing

- 338 automated tests across 11 test files
- Lexer tests (29): all token types, edge cases, error recovery
- Parser tests (33): all statement and expression node types
- Interpreter tests (53): arithmetic, variables, functions, classes, stdlib
- Compiler tests (57): all opcodes, constant pool, upvalues, optimizer
- VM tests (42): stack operations, call frames, closures, execution limits
- Debugger tests (43): breakpoints, stepping, watches, conditional breaks
- Formatter tests (26): all AST nodes, idempotency, style options
- Linter tests (16): all 5 rules, auto-fix, severity levels
- Test runner tests (12): discovery, assertions, reporting
- CLI tests (18): all commands, argument parsing, error handling
- Integration tests (9): complete program execution

### Examples

- `01-hello.tiny` -- Hello World, variables, string concatenation
- `02-variables.tiny` -- Data types, constants, type checking
- `03-functions.tiny` -- Functions, defaults, recursion, closures, arrows
- `04-arrays.tiny` -- Arrays, map/filter/reduce, chaining
- `05-loops.tiny` -- While, for-in, ranges, break, continue
- `06-classes.tiny` -- Classes, inheritance, methods, OOP
- `07-fibonacci.tiny` -- Recursive vs iterative algorithms
- `08-sorting.tiny` -- Bubble, selection, insertion sort
- `09-functional.tiny` -- Composition, currying, data pipelines
- `10-match.tiny` -- Pattern matching, calculator, FizzBuzz
