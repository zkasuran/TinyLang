<![CDATA[<div align="center">

# 🧩 TinyLang

### A complete programming language toolchain built from scratch

*Lexer, Parser, Interpreter, Bytecode Compiler, Virtual Machine, Debugger, Formatter, Linter, Test Runner, Module System, Web IDE, and Documentation Site -- all in TypeScript.*

[![Tests](https://img.shields.io/badge/tests-338%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

</div>

---

## Overview

TinyLang is a **professional-grade programming language toolchain** implemented entirely from scratch in TypeScript. It demonstrates every major component of a modern language platform:

| Component | Description |
|-----------|-------------|
| **Language** | Clean syntax with closures, classes, inheritance, pattern matching |
| **Compiler** | 44-opcode bytecode compiler with constant folding and dead code elimination |
| **Virtual Machine** | Stack-based VM with call frames, upvalue closures, and execution limits |
| **Debugger** | Interactive debugger with breakpoints, stepping, watch expressions, call stack |
| **Formatter** | AST-based code formatter (idempotent, configurable style) |
| **Linter** | Rule-based static analysis with 5 rules and auto-fix capability |
| **Test Runner** | Built-in test framework with assertion functions and colored reporting |
| **Module System** | Import/export with circular dependency detection |
| **CLI** | 12 commands with colorized output and educational error messages |
| **Web IDE** | Full-featured browser IDE with editor, debugger, AST viewer, bytecode panel |
| **Documentation** | 8-page documentation site with language reference, stdlib API, architecture guide |
| **Standard Library** | 60+ functions across 6 modules (IO, Math, Strings, Arrays, Types, Utils) |

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/user/tinylang.git
cd tinylang
npm install

# 2. Build
npm run build

# 3. Run your first program
node dist/cli/index.js run examples/01-hello.tiny
```

### Try the Web IDE (No Installation Required)

Open `playground/index.html` in any modern browser for a full IDE experience with syntax highlighting, debugging, and AST visualization.

### Example Program

```
fn fibonacci(n) {
  if n <= 1 { return n }
  let a = 0
  let b = 1
  for i in 2..n + 1 {
    let temp = b
    b = a + b
    a = temp
  }
  return b
}

for i in 0..10 {
  print("fib(" + str(i) + ") = " + str(fibonacci(i)))
}
```

---

## Why TinyLang?

TinyLang is not a toy -- it is a **real, working implementation** of every major component found in production language toolchains. It demonstrates:

- **Compiler theory**: Lexical analysis, recursive descent parsing, Pratt expression parsing, bytecode generation, optimization passes
- **Virtual machine design**: Stack-based execution, call frames, closure upvalues, constant pools
- **Developer tooling**: AST-based formatting, rule-based linting with auto-fix, module resolution, test discovery
- **Interactive debugging**: Replay-based architecture, conditional breakpoints, expression evaluation at pause points
- **IDE engineering**: CodeMirror 6 integration, virtual filesystem, real-time AST visualization, bytecode disassembly

Every feature actually works. No stubs, no simulated output, no hard-coded responses. Run any command, set any breakpoint, format any file -- it all executes real logic end-to-end.

---

## CLI Reference

```bash
node dist/cli/index.js <command> [options]
```

| Command | Description |
|---------|-------------|
| `run <file>` | Execute a `.tiny` source file or `.tinyc` bytecode file |
| `compile <file>` | Compile source to `.tinyc` bytecode binary |
| `exec <file>` | Compile and immediately execute via the VM |
| `debug <file>` | Launch interactive debugger session |
| `fmt <file>` | Format source code (AST-based, idempotent) |
| `lint <file>` | Run static analysis (5 rules, auto-fix with `--fix`) |
| `test <file>` | Discover and run inline test blocks |
| `doc <file>` | Extract documentation from source |
| `check <file>` | Syntax check without execution |
| `repl` | Start interactive Read-Eval-Print Loop |
| `init` | Create a new TinyLang project |
| `bench <file>` | Benchmark execution (interpreted vs compiled) |

### Usage Examples

```bash
# Run a program
node dist/cli/index.js run examples/07-fibonacci.tiny

# Compile to bytecode and execute
node dist/cli/index.js compile examples/07-fibonacci.tiny
node dist/cli/index.js run examples/07-fibonacci.tinyc

# Debug interactively (set breakpoints, step through code)
node dist/cli/index.js debug examples/06-classes.tiny

# Format and lint
node dist/cli/index.js fmt examples/03-functions.tiny
node dist/cli/index.js lint examples/04-arrays.tiny --fix

# Run tests defined in a file
node dist/cli/index.js test examples/07-fibonacci.tiny

# Start REPL
node dist/cli/index.js repl
```

---

## Language Quick Reference

### Variables and Types

```
let x = 42              // mutable
const PI = 3.14159      // immutable
let arr = [1, 2, 3]    // arrays
let obj = {a: 1, b: 2} // objects
```

### Functions and Closures

```
fn greet(name = "World") {
  return "Hello, " + name + "!"
}

let double = (x) => x * 2      // arrow functions
let adder = (n) => (x) => x + n  // closures
```

### Control Flow

```
if x > 0 { print("positive") }
else { print("non-positive") }

for item in [1, 2, 3] { print(item) }
for i in 0..10 { print(i) }

match statusCode {
  when 200 => print("OK")
  when 404 => print("Not Found")
  else => print("Unknown")
}
```

### Classes and Inheritance

```
class Animal {
  fn init(name, sound) {
    this.name = name
    this.sound = sound
  }
  fn speak() { print(this.name + " says " + this.sound) }
}

class Dog extends Animal {
  fn init(name) { this.name = name; this.sound = "Woof" }
  fn fetch() { print(this.name + " fetches!") }
}

let dog = new Dog("Rex")
dog.speak()   // "Rex says Woof"
```

### Module System

```
import { sqrt, PI } from "math"
import { map, filter } from "arrays"
```

### Built-in Test Framework

```
test "fibonacci correctness" {
  expectToBe(fibonacci(0), 0)
  expectToBe(fibonacci(10), 55)
  expectToBeTrue(fibonacci(20) > 1000)
}
```

---

## Architecture

```
                         ┌─────────────────────────────┐
                         │     Source Code (.tiny)      │
                         └──────────────┬──────────────┘
                                        │
                                        v
                         ┌─────────────────────────────┐
                         │   Lexer (Tokenization)       │
                         │   Position tracking,         │
                         │   educational error messages │
                         └──────────────┬──────────────┘
                                        │
                                        v
                         ┌─────────────────────────────┐
                         │   Parser (AST Generation)    │
                         │   Recursive descent +        │
                         │   Pratt expression parsing   │
                         └──────────┬─────────┬────────┘
                                    │         │
               ┌────────────────────┘         └───────────────────┐
               v                                                   v
┌──────────────────────────┐                     ┌──────────────────────────┐
│   Tree-Walk Interpreter  │                     │   Bytecode Compiler      │
│   Environment chains,    │                     │   44 opcodes, constant   │
│   closures, stdlib       │                     │   pool, upvalue tracking │
└──────────────┬───────────┘                     └──────────────┬───────────┘
               │                                                │
               v                                                v
┌──────────────────────────┐                     ┌──────────────────────────┐
│   Interactive Debugger   │                     │   Optimizer              │
│   Breakpoints, stepping, │                     │   Constant folding,      │
│   watch expressions      │                     │   dead code elimination  │
└──────────────────────────┘                     └──────────────┬───────────┘
                                                                │
                                                                v
                                                 ┌──────────────────────────┐
                                                 │   Stack-Based VM         │
                                                 │   Call frames, closures, │
                                                 │   execution limits       │
                                                 └──────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              Toolchain Layer                                   │
│                                                                                │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Formatter │  │  Linter  │  │Test Runner│  │  Module  │  │    REPL    │  │
│  │ AST-based │  │ 5 rules  │  │ Discovery │  │  Loader  │  │ Multi-line │  │
│  │ Idempotent│  │ Auto-fix │  │ Assertions│  │ Circular │  │ History    │  │
│  └───────────┘  └──────────┘  └───────────┘  │ Detection│  └────────────┘  │
│                                                └──────────┘                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                              Interface Layer                                   │
│                                                                                │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────────┐   │
│  │ CLI (12 commands, colors)   │  │  Web IDE (CodeMirror 6, debugger,    │   │
│  │ run, compile, exec, debug,  │  │  AST viewer, bytecode panel,         │   │
│  │ fmt, lint, test, doc, repl, │  │  file explorer, dark/light theme,    │   │
│  │ init, bench, check          │  │  share via URL, keyboard shortcuts)  │   │
│  └─────────────────────────────┘  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Web IDE

The TinyLang Web IDE (`playground/index.html`) is a full-featured browser-based development environment:

**To use:** Open `playground/index.html` in any modern browser. No server required.

### Features

- **CodeMirror 6 Editor** with TinyLang syntax highlighting and autocomplete
- **File Explorer** with virtual filesystem for managing multiple files
- **Integrated Debugger** -- set breakpoints, step over/into/out, inspect variables
- **AST Visualizer** -- see the parse tree in real-time as you type
- **Bytecode Disassembly** -- view compiled instructions and constant pool
- **Performance Profiler** -- measure execution time across different modes
- **Dark/Light Theme** -- toggle between themes
- **Share via URL** -- encode programs in the URL for sharing
- **Keyboard Shortcuts** -- Ctrl+Enter to run, Ctrl+S to save, etc.
- **Responsive Design** -- works on desktop and tablet screens
- **10 Example Programs** -- preloaded from the examples/ directory

---

## Documentation Site

The `docs/` directory contains a comprehensive static documentation site. Open `docs/index.html` in a browser.

### Pages

| Page | Content |
|------|---------|
| Getting Started | Installation, first program, REPL usage |
| Language Reference | Complete syntax, types, operators, control flow |
| Standard Library | All 60+ functions with signatures and examples |
| Architecture Guide | System design, data flow, component interactions |
| CLI Reference | All 12 commands with options and examples |
| Examples Gallery | Annotated walkthroughs of all 10 example programs |
| Contributing Guide | Development setup, coding standards, PR workflow |

The documentation features responsive design, dark/light mode toggle, and syntax-highlighted code blocks.

---

## Testing

```bash
# Run all 338 tests
npx vitest run

# Run with verbose output
npx vitest run --reporter=verbose

# Run a specific test file
npx vitest run tests/compiler/compiler.test.ts
```

### Test Coverage by Module

| Module | Tests | What's Covered |
|--------|-------|----------------|
| Lexer | 29 | All token types, edge cases, error messages |
| Parser | 33 | All statement and expression AST nodes |
| Interpreter | 53 | Arithmetic, variables, functions, classes, stdlib |
| Compiler | 57 | All 44 opcodes, constant pool, upvalues, optimizer |
| VM | 42 | Stack operations, call frames, closures, GC limits |
| Debugger | 43 | Breakpoints, stepping, watches, conditional breaks |
| Formatter | 26 | All AST node types, idempotency, style options |
| Linter | 16 | All 5 rules, auto-fix, severity levels |
| Test Runner | 12 | Discovery, assertions, reporting |
| CLI | 18 | All commands, argument parsing, error handling |
| Integration | 9 | Complete programs (fibonacci, sorting, classes) |
| **Total** | **338** | **All passing** |

---

## Project Structure

```
tinylang/
├── .kiro/                          # Kiro spec-driven development config
│   ├── specs/                      # Requirements, design, and task specs
│   │   ├── requirements.md         # 15 user stories with acceptance criteria
│   │   ├── design.md               # System architecture and data flow
│   │   ├── tasks.md                # Implementation phases and checklists
│   │   ├── compiler-vm/            # Compiler & VM subsystem spec
│   │   ├── debugger/               # Debugger subsystem spec
│   │   ├── toolchain/              # Formatter/Linter/Test Runner spec
│   │   └── web-ide/                # Web IDE subsystem spec
│   ├── steering/                   # Persistent development guidance
│   │   ├── project-overview.md     # Architecture overview and decisions
│   │   ├── coding-standards.md     # TypeScript guidelines, error handling
│   │   ├── language-spec.md        # Complete TinyLang syntax reference
│   │   ├── architecture-decisions.md # ADRs for key design choices
│   │   ├── testing-guide.md        # Testing philosophy and patterns
│   │   └── web-ide-guide.md        # Web IDE implementation guide
│   └── hooks/                      # Automation hooks
│       ├── build-check.json        # TypeScript type-check on save
│       ├── format-on-save.json     # Auto-format with Prettier
│       ├── lint-on-save.json       # ESLint fixes on save
│       ├── test-on-save.json       # Run tests when source changes
│       ├── validate-examples.json  # Syntax-check .tiny files on save
│       ├── docs-check.json         # Validate documentation links
│       └── playground-build.json   # Rebuild playground on change
├── src/                            # TypeScript source code
│   ├── types/                      # Token, AST, and runtime value types
│   ├── lexer/                      # Tokenizer with position tracking
│   ├── parser/                     # Recursive descent + Pratt parser
│   ├── interpreter/                # Tree-walk evaluator with environments
│   ├── compiler/                   # Bytecode compiler (44 opcodes)
│   ├── vm/                         # Stack-based virtual machine
│   ├── debugger/                   # Interactive debugger
│   ├── formatter/                  # AST-based code formatter
│   ├── linter/                     # Rule-based static analysis
│   │   └── rules/                  # Individual lint rules
│   ├── testing/                    # Built-in test framework
│   ├── modules/                    # Module loader and resolver
│   ├── stdlib/                     # Standard library (60+ functions)
│   ├── repl/                       # Interactive REPL
│   ├── cli/                        # CLI entry point and commands
│   ├── utils/                      # Shared utilities
│   ├── tinylang.ts                 # High-level API facade
│   └── index.ts                    # Barrel exports
├── tests/                          # Vitest test suites (338 tests)
│   ├── lexer/                      # Lexer unit tests
│   ├── parser/                     # Parser unit tests
│   ├── interpreter/                # Interpreter unit tests
│   ├── compiler/                   # Compiler + optimizer tests
│   ├── vm/                         # VM execution tests
│   ├── debugger/                   # Debugger interaction tests
│   ├── formatter/                  # Formatter output tests
│   ├── linter/                     # Linter rule tests
│   ├── testing/                    # Test runner tests
│   ├── cli/                        # CLI command tests
│   └── integration/                # Full program execution tests
├── examples/                       # 10 example .tiny programs
│   ├── 01-hello.tiny               # Hello World, basics
│   ├── 02-variables.tiny           # Data types, constants
│   ├── 03-functions.tiny           # Functions, closures, arrows
│   ├── 04-arrays.tiny              # Arrays, map/filter/reduce
│   ├── 05-loops.tiny               # While, for-in, ranges
│   ├── 06-classes.tiny             # Classes, inheritance, OOP
│   ├── 07-fibonacci.tiny           # Recursive + iterative
│   ├── 08-sorting.tiny             # Bubble, selection, insertion sort
│   ├── 09-functional.tiny          # Composition, currying, pipelines
│   └── 10-match.tiny               # Pattern matching
├── playground/                     # Web IDE (browser-based)
│   ├── index.html                  # Self-contained IDE application
│   ├── build.js                    # esbuild bundler script
│   ├── src/                        # IDE source modules
│   └── public/                     # Static assets
├── docs/                           # Documentation site (static HTML)
│   ├── index.html                  # Landing page
│   ├── getting-started.html        # Installation and first steps
│   ├── language-reference.html     # Complete syntax reference
│   ├── stdlib.html                 # Standard library API docs
│   ├── architecture.html           # System design guide
│   ├── cli-reference.html          # CLI command reference
│   ├── examples.html               # Annotated examples gallery
│   ├── contributing.html           # Development and contribution guide
│   └── styles.css                  # Responsive CSS with dark/light mode
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration (strict)
├── vitest.config.ts                # Test runner configuration
├── CHANGELOG.md                    # Version history
└── README.md                       # This file
```

---

## How Kiro Was Used

TinyLang was built using [Kiro's](https://kiro.dev) **spec-driven development** workflow. Rather than writing code ad-hoc, every component was first specified, then designed, then broken into tasks -- with steering files guiding implementation quality and hooks automating verification at every step.

### The Workflow: Spec to Ship

```
Requirements  -->  Design  -->  Tasks  -->  Implementation  -->  Verification
   (what)         (how)       (steps)      (guided by         (automated by
                                            steering)           hooks)
```

### 1. Requirements Specification

**File:** `.kiro/specs/requirements.md` + 4 subsystem requirement docs

Each feature starts as a user story with clear acceptance criteria. The main spec defines 15 user stories (US-1 through US-15) covering everything from "Running Programs" to "Interactive Debugger" to "Code Formatter". Each subsystem (Compiler/VM, Debugger, Web IDE, Toolchain) has its own detailed requirements document.

Example from `requirements.md`:
```
### US-11: Bytecode Compiler
As a developer, I want to compile TinyLang programs to bytecode for faster
execution and portable distribution.

Acceptance Criteria:
- [x] `tinylang compile <file.tiny>` produces `.tinyc` bytecode
- [x] `tinylang run <file.tinyc>` executes compiled bytecode on the VM
- [x] Optimizer applies constant folding and dead code elimination
```

### 2. Architecture Design

**File:** `.kiro/specs/design.md` + 4 subsystem design docs

The design document specifies the complete system architecture before any code is written: component interfaces, data flow, operator precedence tables, error handling strategy, and testing approach. Subsystem designs define bytecode format, opcode tables, VM stack layout, debugger state machines, and formatter algorithms.

### 3. Task Breakdown

**File:** `.kiro/specs/tasks.md` + 4 subsystem task lists

Implementation is organized into phases with granular checkboxes. Phase 1 covers the core language engine (lexer, parser, interpreter). Phase 2 adds the compiler and VM. Phase 3 builds developer tooling. Phase 4 delivers the Web IDE and documentation. Each task references its parent requirement.

### 4. Steering Files (Persistent Guidance)

**Directory:** `.kiro/steering/` (6 files)

Steering files provide context that persists across implementation sessions:

| File | Purpose |
|------|---------|
| `project-overview.md` | Architecture overview, tech stack, key decisions |
| `coding-standards.md` | TypeScript strict mode, no `any`, JSDoc required, error handling philosophy |
| `language-spec.md` | Complete TinyLang syntax reference (used as source of truth during implementation) |
| `architecture-decisions.md` | ADRs: why tree-walk + bytecode, why hand-written parser, why replay debugger |
| `testing-guide.md` | Testing philosophy, patterns, module-specific strategies |
| `web-ide-guide.md` | Browser constraints, bundling strategy, panel architecture |

### 5. Automation Hooks

**Directory:** `.kiro/hooks/` (7 hooks)

Hooks run automatically during development to maintain quality:

| Hook | Trigger | Action |
|------|---------|--------|
| `build-check.json` | Source file saved | TypeScript type-check (`tsc --noEmit`) |
| `test-on-save.json` | Source/test file saved | Run related tests (`vitest run`) |
| `format-on-save.json` | Source file saved | Auto-format with Prettier |
| `lint-on-save.json` | Source file saved | ESLint auto-fix |
| `validate-examples.json` | `.tiny` file saved | Syntax-check with `tinylang check` |
| `docs-check.json` | Docs changed | Validate links and structure |
| `playground-build.json` | Playground source changed | Rebuild with esbuild |

### 6. Subsystem Specs (4 Major Components)

Each major subsystem has its own complete spec cycle (requirements + design + tasks):

```
.kiro/specs/compiler-vm/     # Bytecode format, 44 opcodes, VM architecture, optimizer
.kiro/specs/debugger/        # State machine, breakpoint types, stepping algorithms
.kiro/specs/toolchain/       # Formatter algorithm, lint rules, test discovery
.kiro/specs/web-ide/         # Panel architecture, bundling, state management
```

### Impact

The spec-driven workflow with Kiro ensured:
- **No feature drift** -- every implemented feature traces back to a requirement
- **Consistent quality** -- steering files enforce coding standards across all 15,000+ lines
- **Automated verification** -- hooks catch regressions immediately
- **Clear architecture** -- design docs prevent ad-hoc decisions that create tech debt
- **Traceable progress** -- task checklists show exactly what's done and what remains

---

## Technical Highlights

### Bytecode Compiler (44 Opcodes)

The compiler translates AST nodes into a flat instruction sequence stored in a `Chunk` with a constant pool. Opcodes cover stack manipulation, arithmetic, comparison, control flow, closures, classes, and method dispatch. The binary `.tinyc` format includes a magic number, version header, and serialized constant pool.

### Optimizer (Two Passes)

- **Constant Folding**: Evaluates compile-time-known expressions (`2 + 3` becomes `5`)
- **Dead Code Elimination**: Removes unreachable instructions after unconditional jumps and returns

### Stack-Based VM

The VM executes bytecode using a value stack and call frame stack. Closures are implemented via upvalues (pointers to stack slots that get "closed over" when the enclosing scope exits). Execution limits prevent infinite loops.

### Replay-Based Debugger

The debugger records execution state at each statement, enabling:
- Line breakpoints and conditional breakpoints (`break 15 when x > 5`)
- Step over, step into, step out
- Variable inspection at any pause point
- Watch expressions that re-evaluate on each step
- Full call stack with source locations

### AST-Based Formatter

Unlike text-based formatters, TinyLang's formatter re-prints from the AST, guaranteeing:
- Idempotency (formatting twice produces the same output)
- Structural correctness (output always parses back to the same AST)
- Configurable indent width and style

### Rule-Based Linter with Auto-Fix

Five rules with configurable severity (error/warning/info):
1. **unused-variables** -- detects declared but never-read variables
2. **unreachable-code** -- statements after return/break/continue
3. **no-empty-blocks** -- empty if/while/for/function bodies
4. **prefer-const** -- variables never reassigned should use `const`
5. **no-shadow** -- inner variables hiding outer declarations

Each rule can produce auto-fix suggestions applied with `--fix`.

### Built-in Test Framework

Test blocks are first-class syntax: `test "name" { ... }`. The test runner discovers all test blocks in a file, executes them in isolation, and reports results with colored pass/fail output. Assertion functions: `expectToBe`, `expectToBeTrue`, `expectToBeFalse`, `expectToThrow`.

---

## Development

### Setup

```bash
git clone https://github.com/user/tinylang.git
cd tinylang
npm install
npm run build
```

### Development Workflow

```bash
# Build TypeScript
npm run build

# Run all tests (338)
npx vitest run

# Type check without emitting
npx tsc --noEmit

# Run a specific test file
npx vitest run tests/compiler/compiler.test.ts

# Test a TinyLang program
node dist/cli/index.js run examples/07-fibonacci.tiny

# Clean build artifacts
npm run clean
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Follow the coding standards in `.kiro/steering/coding-standards.md`
4. Ensure all 338 tests pass (`npx vitest run`)
5. Add tests for new functionality
6. Commit with conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`)
7. Open a Pull Request

---

## License

MIT License -- see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Inspired by [Crafting Interpreters](https://craftinginterpreters.com) by Bob Nystrom
- Built with [Kiro](https://kiro.dev) using spec-driven development
- Created for the [Ready, Spec, Ship](https://codingagents.fyi/hackathon/kiro/) hackathon
]]>