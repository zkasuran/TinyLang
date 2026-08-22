# Toolchain - Implementation Tasks

## Phase 1: Code Formatter

### Task 1.1: Formatter Core ✅
- [x] Create `src/formatter/formatter.ts` with Formatter class
- [x] Implement `format(source: string): string` entry point
- [x] Parse source to AST (lex -> parse pipeline)
- [x] Implement recursive AST pretty-printing
- [x] Track indentation level (increment for blocks)
- [x] Emit newlines between statements

### Task 1.2: Statement Formatting ✅
- [x] Format variable declarations (`let`/`const` with spacing)
- [x] Format function declarations (name, params, body block)
- [x] Format class declarations (name, extends, methods)
- [x] Format if/else chains (braces, spacing, else-if)
- [x] Format while loops (condition, body)
- [x] Format for-in loops (variable, iterable, body)
- [x] Format match/when statements (cases, default)
- [x] Format return, break, continue statements
- [x] Format print statements
- [x] Format import statements
- [x] Format test declarations

### Task 1.3: Expression Formatting ✅
- [x] Format binary expressions with operator spacing
- [x] Format unary expressions (prefix operators)
- [x] Format logical expressions (and, or, not)
- [x] Format call expressions (function name + args)
- [x] Format member access (dot notation)
- [x] Format index access (bracket notation)
- [x] Format array literals (brackets, comma-separated)
- [x] Format object literals (braces, key-value pairs)
- [x] Format arrow functions (params => body)
- [x] Format ternary expressions (condition ? then : else)
- [x] Format parenthesized expressions (preserve necessary parens)

### Task 1.4: Edge Cases ✅
- [x] Preserve comments (attach to nearest AST node)
- [x] Handle empty blocks (format as `{}` on same line)
- [x] Handle long lines (prefer wrapping at 80 chars)
- [x] Ensure idempotency (format(format(x)) === format(x))
- [x] Handle programs with parse errors (return original source)

### Task 1.5: CLI Integration ✅
- [x] Add `format` subcommand to CLI
- [x] `format <file>` reformats file in place
- [x] `format --check <file>` reports if changes needed (exit 0/1)
- [x] Support formatting from stdin (pipe mode)
- [x] Colorized diff output showing changes

## Phase 2: Code Linter

### Task 2.1: Linter Infrastructure ✅
- [x] Create `src/linter/linter.ts` with Linter class
- [x] Define `Diagnostic` interface (rule, severity, message, position)
- [x] Define `LintRule` type (function taking AST, returning diagnostics)
- [x] Implement rule registration and execution
- [x] Sort diagnostics by line number for output

### Task 2.2: Lint Rules Implementation ✅
- [x] `unused-variables` rule: detect declared-but-unused variables
- [x] `unreachable-code` rule: detect code after return/break/continue
- [x] `no-empty-blocks` rule: detect empty if/while/fn bodies
- [x] `prefer-const` rule: detect `let` variables that are never reassigned
- [x] `no-shadow` rule: detect variables that shadow outer scope names
- [x] Each rule in its own file under `src/linter/rules/`

### Task 2.3: Diagnostic Display ✅
- [x] Format diagnostics with file:line:col prefix
- [x] Color-code by severity (error=red, warning=yellow, info=blue)
- [x] Show source context line with pointer
- [x] Group diagnostics by file
- [x] Summary line: "X errors, Y warnings, Z info"

### Task 2.4: CLI Integration ✅
- [x] Add `lint` subcommand to CLI
- [x] `lint <file>` runs all rules and displays diagnostics
- [x] Exit code 1 if any errors found, 0 otherwise
- [x] Support `--fix` flag to apply auto-fixes
- [x] Support multiple file arguments

## Phase 3: Test Runner

### Task 3.1: Test Syntax ✅
- [x] Add `test` keyword to lexer token types
- [x] Parse `test "description" { body }` in parser
- [x] Create `TestDeclaration` AST node type
- [x] Test blocks can appear at top level of any file
- [x] Test blocks have access to all declarations in the file

### Task 3.2: Assertion Functions ✅
- [x] Implement `assert(condition)` with meaningful failure messages
- [x] Implement `assertEqual(actual, expected)` with diff display
- [x] Implement `assertNotEqual(actual, expected)`
- [x] Implement `assertThrows(fn)` for error testing
- [x] Create `AssertionError` class with detailed info
- [x] Register assertion functions in test environment

### Task 3.3: Test Runner Implementation ✅
- [x] Create `src/testing/runner.ts` with TestRunner class
- [x] Discover `TestDeclaration` nodes in parsed AST
- [x] Execute each test in isolated environment
- [x] Capture assertion errors as test failures
- [x] Capture unexpected errors as test errors
- [x] Time each test execution
- [x] Collect results into `TestResult[]` array

### Task 3.4: Result Reporting ✅
- [x] Display results in formatted table
- [x] Green checkmarks for passing tests
- [x] Red X marks for failing tests
- [x] Show failure messages with expected vs actual values
- [x] Summary: "N passed, M failed (duration)"
- [x] Exit code: 0 if all pass, 1 if any fail

### Task 3.5: CLI Integration ✅
- [x] Add `test` subcommand to CLI
- [x] `test <file>` runs tests in a single file
- [x] `test <directory>` discovers and runs all `.tiny` files with test blocks
- [x] Support `--filter` flag to run tests matching a pattern
- [x] Colorized output with pass/fail indicators

## Phase 4: Module System

### Task 4.1: Import Parsing ✅
- [x] Add `import` and `from` keywords to lexer
- [x] Parse `import { name1, name2 } from "path"` syntax
- [x] Create `ImportStatement` AST node
- [x] Support multiple named imports in one statement
- [x] Report helpful errors for malformed import syntax

### Task 4.2: Module Resolution ✅
- [x] Create `src/modules/resolver.ts` with ModuleResolver class
- [x] Resolve standard library modules by name (no file lookup)
- [x] Resolve relative paths (./foo -> ./foo.tiny)
- [x] Resolve project paths (lib/foo -> <root>/lib/foo.tiny)
- [x] Try `.tiny` extension and `/index.tiny` fallback
- [x] Report clear errors for unresolved modules

### Task 4.3: Module Loader ✅
- [x] Create `src/modules/loader.ts` with ModuleLoader class
- [x] Load and execute module files (lex -> parse -> interpret)
- [x] Cache module environments (execute only once)
- [x] Detect circular dependencies (track loading stack)
- [x] Extract named exports from module environment
- [x] Bind imports to the importing file's scope

### Task 4.4: Standard Library Modules ✅
- [x] Register `math` module (sqrt, PI, abs, etc.)
- [x] Register `strings` module (split, join, upper, lower, etc.)
- [x] Register `arrays` module (map, filter, reduce, sort, etc.)
- [x] Standard library modules use the STDLIB_PREFIX for identification
- [x] Module functions are native (implemented in TypeScript)
