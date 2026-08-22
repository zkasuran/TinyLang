<p align="center">
  <img src="docs/assets/logo.svg" alt="TinyLang" width="120" height="120" />
</p>

<h1 align="center">TinyLang</h1>

<p align="center">
  <strong>A complete programming language — from spec to bytecode — built entirely with Kiro.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#language-tour">Language Tour</a> •
  <a href="#the-toolchain">Toolchain</a> •
  <a href="#how-kiro-was-used">How Kiro Was Used</a> •
  <a href="#architecture">Architecture</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-1003%20passing-brightgreen" alt="1003 tests" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Node.js-18%2B-green" alt="Node 18+" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
  <img src="https://img.shields.io/badge/hackathon-Ready%2C%20Spec%2C%20Ship-orange" alt="Hackathon" />
</p>

---

## What is TinyLang?

TinyLang is a **complete programming language suite** — not a weekend prototype, but a fully realized toolchain you can install, run, debug, format, lint, test and compile to WebAssembly. Built from scratch in TypeScript, spec-driven from the first commit, and verified to 1003 automated tests with byte-level correctness guarantees between its two execution backends.

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

// Works in interpreter mode:
print(f"fib(20) = {fibonacci(20)}")    // → fib(20) = 6765

// Also compiles to bytecode:
//   tinylang compile fib.tiny → fib.tinyc (726 bytes)
//   tinylang exec fib.tinyc   → fib(20) = 6765

// And to WebAssembly:
//   tinylang wasm fib.tiny → fib.wat
//   fibonacci(20) === 6765 via WebAssembly.instantiate ✓
```

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/zkasuran/TinyLang.git
cd TinyLang
npm install

# 2. Build
npm run build

# 3. Run
node dist/cli/index.js run examples/07-fibonacci.tiny

# Or start the interactive REPL
node dist/cli/index.js repl

# Or open the Web IDE (no server needed)
open playground/index.html
```

**That's it.** No Docker, no cloud services, no API keys. The judges can run every feature from a fresh clone.

---

## Language Tour

### Data Types & Variables

```
let name = "Alice"          // string
let age = 30                // number
const PI = 3.14159          // constant (reassignment throws)
let scores = [95, 87, 92]  // array
let person = {name: "Bob"}  // object
let active = true           // boolean
```

### String Interpolation

```
let who = "World"
print(f"Hello {who}! 2+2 = {2 + 2}")   // → Hello World! 2+2 = 4
```

### Functions, Closures & Arrow Functions

```
fn greet(name, greeting = "Hello") {
  return f"{greeting}, {name}!"
}

let double = (x) => x * 2
let counter = fn() {
  let n = 0
  return fn() { n += 1; return n }
}()
print(counter(), counter(), counter())  // → 1 2 3
```

### Classes & Inheritance

```
class Animal {
  let name = ""
  fn init(n) { this.name = n }
  fn speak() { return f"{this.name} makes a sound" }
}

class Dog extends Animal {
  fn speak() { return f"{this.name} barks!" }
}

print(new Dog("Rex").speak())  // → Rex barks!
```

### Control Flow & Pattern Matching

```
// Ternary
let grade = score >= 90 ? "A" : score >= 80 ? "B" : "C"

// Pattern matching
match statusCode {
  when 200 => print("OK")
  when 404 => print("Not Found")
  else => print("Unknown")
}

// Ranges
for i in 0..10 { print(i) }      // 0 through 9
for i in 10..0 { print(i) }      // descending: 10 through 1
```

### Error Handling

```
try {
  let data = riskyOperation()
} catch err {
  print(f"Error: {err.message}")
}

throw "something went wrong"      // creates catchable error
```

### Modern Syntax

```
// Pipe operator
let result = [1, 2, 3, 4, 5]
  |> .filter((x) => x % 2 == 0)
  |> .map((x) => x * x)

// Optional chaining + nullish coalescing
let name = user?.profile?.name ?? "Anonymous"

// Destructuring
let [a, b, c] = [1, 2, 3]
let {host, port} = config

// Spread
let combined = [...arr1, ...arr2]

// Enums
enum Direction { North South East West }
```

---

## The Toolchain

TinyLang ships **17 CLI commands** — a complete development environment:

| Command | What it does |
|---------|-------------|
| `run <file>` | Execute directly via tree-walk interpreter |
| `compile <file>` | Compile to `.tinyc` bytecode |
| `exec <file.tinyc>` | Run compiled bytecode on the stack VM |
| `wasm <file>` | Compile to WebAssembly Text Format (.wat) |
| `debug <file>` | Interactive step debugger |
| `fmt <file>` | Format source code (meaning-preserving, comment-preserving) |
| `lint <file>` | Static analysis with auto-fix |
| `test [files]` | Built-in test runner with assertions |
| `repl` | Interactive read-eval-print loop |
| `ast <file>` | Visualize the parse tree |
| `profile <file>` | Execution timing, memory, code stats |
| `bench <file>` | Benchmark with interpreter vs VM comparison |
| `doc <file>` | Generate documentation from comments |
| `init [name]` | Scaffold a new project |
| `check <file>` | Syntax check without execution |
| `version` | Version info |
| `help` | Usage guide |

### Bytecode Compiler & VM

```bash
$ tinylang compile examples/07-fibonacci.tiny
Compiled: 356 instructions, 59 constants, optimized 0 bytes
Output: examples/07-fibonacci.tinyc (6269 bytes)

$ tinylang exec examples/07-fibonacci.tinyc
=== Recursive Fibonacci ===
fib(0) = 0
fib(1) = 1
...
fib(10) = 55
```

The compiler and VM produce **byte-identical output** to the interpreter on every example program in the suite, verified by a 191-test differential suite that cross-validates both backends. (The VM treats module `import` as a no-op, so imports are not executed under `compile`/`exec`.)

### Interactive Debugger

```bash
$ tinylang debug examples/06-classes.tiny

Debugger Commands:
  break/b <line>    Set breakpoint
  step/s            Step over
  into/i            Step into
  out/o             Step out
  continue/c        Resume
  print/p <expr>    Evaluate expression
  watch/w <expr>    Add watch
  locals            Show local variables
  stack             Show call stack
```

### Formatter (fmt)

The formatter **guarantees** it will never change the meaning of your code or lose a comment:
- Re-parses its own output and verifies AST equivalence
- Verifies every comment is preserved
- Throws `FormatterError` rather than return unsafe output
- `--write` only writes if both checks pass

```bash
$ tinylang fmt --check examples/*.tiny    # all 18 pass ✓
$ tinylang fmt --write src/*.tiny         # safe: verified before writing
```

### WebAssembly Target

```bash
$ tinylang wasm examples/fib.tiny --output fib.wat
Compiled and exported: fibonacci, factorial

# The output assembles, validates and runs:
# fibonacci(20) === 6765 ✓ via WebAssembly.instantiate
```

Functions using unsupported constructs (strings, objects, closures) are **left out entirely** — never substituted with a placeholder. Exit code is non-zero if anything could not be compiled.

### Built-in Test Framework

```
test "math works" {
  expect(1 + 1).toBe(2)
  expect([1, 2, 3]).toContain(2)
  expect("hello".length).toBe(5)
}
```

```bash
$ tinylang test examples/17-testing.tiny
  ✓ basic arithmetic (0ms)
  ✓ string operations (0ms)
  ✓ array methods (0ms)
  ✓ type checking (0ms)
11 passed, 0 failed
```

### Web IDE

Open `playground/index.html` in any browser — no server, no build step, no installation.

**Features:**
- CodeMirror 6 editor with TinyLang syntax highlighting
- Autocomplete for 60+ built-in functions
- Inline error markers
- Split panel: Editor + Output + Debugger
- AST visualizer (live parse tree)
- Bytecode disassembly view
- Dark/light theme toggle
- Share code via URL
- 10 preloaded example programs
- `Ctrl+Enter` to run

The 480KB bundle contains the **full language runtime** — same interpreter, compiler and VM that the CLI uses — verified by a test that assembles it with no `require` available and runs a program through it.

---

## How Kiro Was Used

This project demonstrates the **spec-driven development workflow** that Kiro enables. Every component was specified before it was built, and every spec is in the repository.

### Specs — Requirements → Design → Tasks

The `.kiro/specs/` directory contains **21 specification files** across 7 subsystems:

```
.kiro/specs/
├── requirements.md              # 10 user stories, acceptance criteria
├── design.md                    # Architecture, data flow, operator precedence
├── tasks.md                     # Implementation phases with checkboxes
├── compiler-vm/
│   ├── requirements.md          # Bytecode ISA goals
│   ├── design.md                # Stack machine design, opcode table
│   └── tasks.md                 # Compiler implementation plan
├── debugger/
│   ├── requirements.md          # Breakpoints, stepping, inspection
│   ├── design.md                # Debug protocol, state machine
│   └── tasks.md                 # Debugger implementation plan
├── toolchain/
│   ├── requirements.md          # CLI commands, formatter, linter
│   ├── design.md                # Command architecture
│   └── tasks.md                 # Tooling implementation plan
├── web-ide/
│   ├── requirements.md          # Editor, panels, themes
│   ├── design.md                # Bundle architecture, CodeMirror integration
│   └── tasks.md                 # IDE implementation plan
├── testing-framework/
│   └── ...
└── ide-spec/
    └── ...
```

### Steering Files

The `.kiro/steering/` directory provides **persistent project knowledge** — 10 files covering every aspect:

| File | Purpose |
|------|---------|
| `project-overview.md` | Architecture, tech stack, key decisions |
| `coding-standards.md` | TypeScript guidelines, error philosophy |
| `language-spec.md` | Complete TinyLang syntax reference |
| `architecture-decisions.md` | ADRs for major choices |
| `testing-guide.md` | Testing philosophy, differential approach |
| `web-ide-guide.md` | Browser bundle constraints |
| `error-handling.md` | Educational error message standards |
| `documentation-standards.md` | Doc format and completeness requirements |
| `performance.md` | VM optimization guidelines |
| `testing-standards.md` | Coverage expectations, cross-validation |

### Hooks

The `.kiro/hooks/` directory automates quality with **10 hooks**:

- `build-check.json` — Type-check on save
- `test-on-save.json` — Run tests when source changes
- `lint-on-save.json` — Auto-lint on save
- `format-on-save.json` — Auto-format on save
- `validate-examples.json` — Syntax-check .tiny files
- `playground-build.json` — Rebuild the Web IDE bundle
- `docs-check.json` — Verify documentation completeness
- `benchmark-check.json` — Performance regression gate
- `pre-commit.json` — Full validation before commit
- `generate-docs.json` — Regenerate API docs

### Development Story

The project was built across **50+ commits**, with Kiro driving the workflow:

1. **Spec phase** — Requirements and design written first, before any code
2. **Implementation** — Each component built following its task list
3. **Verification** — Hooks ran tests continuously; the differential suite caught 6 VM correctness bugs that 42 hand-written tests missed
4. **Iteration** — Specs updated as the design evolved; steering files captured every decision

The key insight: **test count is not the metric**. The VM shipped with 42 passing tests while producing wrong answers (`fibonacci(20)` returned `53`). What caught it was cross-validating both backends against each other — a pattern the steering files now mandate.

---

## Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │              TinyLang Source (.tiny)                  │
                    └─────────────────┬───────────────────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────────────────┐
                    │    Lexer (tokens, comments, positions)               │
                    └─────────────────┬───────────────────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────────────────┐
                    │    Parser (recursive descent + Pratt expressions)    │
                    └─────────────────┬───────────────────────────────────┘
                                      │
                         ┌────────────┼────────────────┐
                         │            │                 │
            ┌────────────▼──┐   ┌─────▼──────┐   ┌────▼───────────┐
            │  Interpreter  │   │  Compiler  │   │  WASM Compiler │
            │  (tree-walk)  │   │ (bytecode) │   │   (WAT emit)   │
            └───────────────┘   └─────┬──────┘   └────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────────────────┐
                    │    Optimizer (constant fold, dead code, peephole)    │
                    └─────────────────┬───────────────────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────────────────┐
                    │    Stack VM (call frames, upvalues, GC, try/catch)   │
                    └─────────────────────────────────────────────────────┘
```

### Project Structure

```
tinylang/
├── .kiro/                      # Kiro configuration (41 files)
│   ├── specs/                  # 7 subsystem specifications (21 files)
│   ├── steering/               # 10 persistent knowledge files
│   └── hooks/                  # 10 automation hooks
├── src/                        # TypeScript source (67 files)
│   ├── lexer/                  # Tokenizer with comment retention
│   ├── parser/                 # Recursive descent + Pratt parsing
│   ├── interpreter/            # Tree-walk evaluator (reference impl)
│   ├── compiler/               # Bytecode compiler (63 opcodes)
│   │   ├── compiler.ts         # AST → bytecode
│   │   ├── optimizer.ts        # Constant fold, dead code, peephole
│   │   ├── wasm-compiler.ts    # AST → WebAssembly Text
│   │   └── opcodes.ts          # Instruction set definition
│   ├── vm/                     # Stack-based virtual machine
│   ├── debugger/               # Interactive step debugger
│   ├── formatter/              # AST-based pretty printer + safety net
│   ├── linter/                 # Static analysis (5 rules + auto-fix)
│   ├── testing/                # Built-in test framework
│   ├── modules/                # Import resolution + circular detection
│   ├── stdlib/                 # 9 modules, 60+ functions
│   ├── repl/                   # Interactive REPL
│   └── cli/                    # 17-command CLI
├── tests/                      # 1003 tests across 21 files
│   ├── integration/
│   │   ├── differential.test.ts  # 191 interpreter↔VM cross-validations
│   │   └── programs.test.ts      # End-to-end program tests
│   ├── compiler/
│   │   ├── compiler.test.ts      # Bytecode generation tests
│   │   └── wasm-execution.test.ts # WAT → assemble → run → assert
│   ├── formatter/
│   │   └── round-trip.test.ts    # AST + comment preservation proofs
│   └── ...                       # Lexer, parser, VM, debugger, linter
├── examples/                   # 18 educational programs (.tiny)
├── docs/                       # Full reference site (HTML + MD)
├── playground/                 # 480KB self-contained Web IDE
│   ├── index.html              # The built bundle (open in browser)
│   ├── template.html           # Source template
│   └── build.js                # Bundle script
└── package.json
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Two backends (interpreter + VM) | The interpreter is the reference implementation; the VM is for performance. Cross-validation catches bugs neither can alone. |
| Exhaustive `never` guards | Both switches in the compiler and formatter that dispatch on AST node types end in a `never` guard. A new node type is a build error, not a silent deletion. |
| Formatter safety net | `fmt` re-parses its output and refuses to write a file whose meaning changed. This is what makes `--write` safe. |
| Comment preservation | Comments are retained by the lexer, attached to AST nodes, and verified after formatting. Lost comments are a loud failure, not a quiet surprise. |
| Lazy Node.js imports | The module system requires `fs`/`path` lazily, so the same source bundles for the browser. The Web IDE was dead on load for 5 commits before this was caught. |
| Pure-TS crypto | SHA-256, MD5, base64 and UUID v4 are implemented without `node:crypto`, so the stdlib works identically in Node and the browser. |
| Open upvalues | Closures capture variables by reference, not by value. A write through one closure is visible through another, matching the interpreter exactly. |

---

## Testing Philosophy

```
1003 tests across 21 files
  191 differential (interpreter ↔ VM ↔ optimized VM, zero exclusions)
  149 formatter round-trip (AST equivalence)
   98 formatter comment preservation
   34 WASM end-to-end (assemble + validate + instantiate + call)
   18 example programs (both backends, via CLI)
   ...and 513 more across lexer, parser, VM, compiler, debugger, linter, testing
```

The core insight: **asserting a program ran is not asserting it is correct.** The VM passed 42 hand-written tests while `fibonacci(20)` returned `53`. What caught it was cross-validating the two backends against each other over the same programs, asserting byte-identical stdout.

The differential suite has **zero exclusions**. Every example program, every feature, every edge case runs through both backends with and without the optimizer.

---

## Documentation

The `docs/` directory contains a full reference site (HTML + MD):

- **Getting Started** — Installation, first program, REPL
- **Language Reference** — Every feature, every operator, every keyword
- **Standard Library** — All 60+ functions with signatures and examples
- **Architecture Guide** — How the compiler and VM work internally
- **CLI Reference** — All 17 commands with options and examples
- **Examples Gallery** — 18 programs teaching progressive concepts
- **Contributing Guide** — Development setup, how to add features

---

## Running the Tests

```bash
npm test                  # Full suite (1003 tests)
npm run lint              # ESLint (zero warnings)
node playground/build.js  # Rebuild the Web IDE (verifies bundling)
```

Specific suites:
```bash
npx vitest run tests/integration/differential.test.ts   # 191 cross-validation tests
npx vitest run tests/compiler/wasm-execution.test.ts    # 34 WASM end-to-end tests
npx vitest run tests/formatter/round-trip.test.ts       # 149 formatter safety tests
```

---

## Example Programs

The `examples/` directory contains **18 progressively complex programs**, each with teaching comments:

| File | Concepts |
|------|----------|
| `01-hello.tiny` | Hello World, variables |
| `02-variables.tiny` | All data types, constants |
| `03-functions.tiny` | Functions, closures, arrows |
| `04-arrays.tiny` | Arrays, map/filter/reduce |
| `05-loops.tiny` | While, for-in, ranges, break/continue |
| `06-classes.tiny` | Classes, inheritance, methods |
| `07-fibonacci.tiny` | Recursion vs iteration, golden ratio |
| `08-sorting.tiny` | Bubble, selection, insertion sort |
| `09-functional.tiny` | Composition, currying, pipelines |
| `10-match.tiny` | Pattern matching, FizzBuzz |
| `10-new-features.tiny` | Newer language features |
| `11-error-handling.tiny` | Try/catch, throw, error propagation |
| `12-advanced.tiny` | F-strings, destructuring, spread |
| `13-algorithms.tiny` | Binary search, quicksort, sieve |
| `14-data-structures.tiny` | Stack, queue, linked list, BST |
| `15-game.tiny` | Text adventure engine |
| `16-compiler-demo.tiny` | Compiler/VM features |
| `17-testing.tiny` | Built-in test framework |

---

## Built With

- **[Kiro](https://kiro.dev)** — Spec-driven AI development (specs, steering, hooks)
- **TypeScript** — Strict mode, zero `any` types
- **Vitest** — Test runner
- **esbuild** — Browser bundling
- **CodeMirror 6** — Web IDE editor
- **wabt** — WebAssembly validation in tests

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <em>Built for the <a href="https://codingagents.fyi/hackathon/kiro/">Ready, Spec, Ship</a> hackathon.</em><br/>
  <em>Spec it. Build it. Ship it. Every claim verified.</em>
</p>
