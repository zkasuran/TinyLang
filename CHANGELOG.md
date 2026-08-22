# Changelog

All notable changes to TinyLang are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Conditional expression: `cond ? whenTrue : whenFalse`. Right-associative, binds
  looser than every operator except assignment, and only evaluates the taken arm.
  The AST node and both backends' handling already existed but were unreachable
  because the lexer rejected a bare `?`.

### Fixed

- **`tinylang fmt` no longer deletes every comment in the file.** The lexer
  discarded comments as it scanned, so by the time the formatter rendered from the
  AST there was nothing left to print - `fmt --write` stripped all 230 lines of
  commentary from `examples/`, and `fmt --check` reported all 18 files as needing
  reformatting for that reason alone. Comments are now retained by the lexer,
  attached to the statement, class member, match arm or enum variant they belong
  to, and printed back with the author's blank lines. Formatting is verified
  against comment loss the same way it is verified against meaning loss: the
  output is re-lexed and its comments compared with the input's, and the formatter
  throws rather than return output that dropped, added or altered one. The AST
  round-trip check could not catch this on its own, because comments are not in
  the AST.
- **`tinylang fmt` no longer collapses a hand-broken method chain onto one long
  line.** The formatter was width-aware for array and object literals but not for
  call chains, so it joined every chain regardless of the result: in
  `examples/09-functional.tiny` a three-call chain became a single 98-column line.
  Multi-line chaining is a supported shape - the parser treats a newline before a
  `.` as a continuation - so this both hurt the examples and undid a deliberate
  authoring choice. A chain of two or more `.method(...)` calls is now rendered on
  one line only if it fits within `maxLineWidth`; otherwise the receiver stays on
  the first line and each call moves to its own continuation line, indented one
  level. A single call is never broken, since it has no natural break point, and
  plain member access (`a.b.c`) is untouched. Two shapes are deliberately left
  flat because the parser cannot read them back: a line may not begin with `?.`,
  so an optional step stays with the receiver, and it may not begin with `|>`, so
  `PipeMethodExpression` is unchanged. Note the width test measures the chain, not
  the finished line - the statement prefix is not counted, the same approximation
  the literal formatters have always made - so a chain can still exceed the limit
  once `let x = ` is prepended.
- **WASM target no longer emits functions with a placeholder in place of real
  work.** Unsupported constructs were collected into a module-wide warning list
  and `(i32.const 0)` was substituted for them, so e.g.
  `fn usesString(name) { return "hello " + name }` produced an export that
  assembled, validated and returned a number while having dropped the string
  operation. Such a function is now left out of the module and not exported, with
  the reason reported per function; `tinylang wasm` exits non-zero.
- **Bytecode operands that do not fit in 16 bits are rejected** instead of being
  truncated. A chunk over 64KB silently wrapped its jump targets.
- **VM arity-checks native builtins.** `abs(-3, 99)` used to succeed there.
- **The step limit is uncatchable in both engines.** The interpreter raised a
  plain `RuntimeError`, so a `catch` inside the runaway loop swallowed it and the
  loop then spun forever. Both engines now raise `StepLimitExceeded` with the
  same message.
- **Redeclaration in the same scope is rejected by both engines.** The VM
  silently overwrote, including over stdlib names.
- **Reading a method as a property no longer binds the receiver in the VM.**
  `let m = t.show; m()` worked there and failed in the interpreter.
- **`this` outside a method is reported** rather than reading as `null` in the VM.
- **The VM's undefined-variable error includes the "Did you mean?" hint**, and
  `print` renders a VM closure as `<fn name>` rather than `<unknown>`.

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
