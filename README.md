# 🧩 TinyLang

**A minimal educational programming language designed to teach programming concepts with friendly error messages.**

[![Tests](https://img.shields.io/badge/tests-124%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## 🎯 What is TinyLang?

TinyLang is a complete, interpreted programming language built from scratch in TypeScript. It features:

- **Clean syntax** inspired by Python and JavaScript
- **Educational error messages** with hints that help beginners learn
- **Interactive REPL** for experimenting in real-time
- **Web Playground** — try TinyLang in your browser without installing anything
- **Complete standard library** with 60+ built-in functions
- **Classes with inheritance** for learning OOP concepts
- **Functional programming** with closures, map/filter/reduce

### Quick Example

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

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- npm

### Installation & Running

```bash
# Clone the repository
git clone https://github.com/tinylang/tinylang.git
cd tinylang

# Install dependencies
npm install

# Build the project
npm run build

# Run an example program
node dist/cli/index.js run examples/01-hello.tiny

# Start the interactive REPL
node dist/cli/index.js repl

# Check syntax without running
node dist/cli/index.js check examples/07-fibonacci.tiny
```

### Web Playground (No Installation Required)

Open `playground/index.html` in any modern browser. The playground includes:
- Code editor with line numbers
- Output console
- 10 preloaded example programs
- Share code via URL
- Keyboard shortcut: `Ctrl+Enter` to run

---

## 📋 CLI Commands

```
tinylang run <file.tiny>      Execute a TinyLang source file
tinylang repl                  Start the interactive REPL
tinylang check <file.tiny>    Check syntax without executing
tinylang version               Show version information
tinylang help                  Show help
```

---

## 📖 Language Reference

### Data Types

| Type | Examples | Description |
|------|----------|-------------|
| Number | `42`, `3.14`, `-7` | Integers and floats |
| String | `"hello"`, `'world'` | Text with escape sequences |
| Boolean | `true`, `false` | Logical values |
| Null | `null` | Absence of value |
| Array | `[1, 2, 3]` | Ordered collections |
| Object | `{name: "Alice"}` | Key-value maps |

### Variables

```
let x = 10          // mutable
const PI = 3.14     // immutable (cannot reassign)
x = 20              // OK
x += 5              // compound assignment (also -=, *=, /=)
```

### Operators

```
// Arithmetic
+  -  *  /  %  **

// Comparison
==  !=  <  >  <=  >=

// Logical (use words, not symbols!)
and  or  not

// String
"hello" + " world"     // concatenation
"ha" * 3               // "hahaha" (repetition)
```

### Control Flow

```
// If/else
if score >= 90 {
  print("A")
} else if score >= 80 {
  print("B")
} else {
  print("C")
}

// While loop
while condition {
  // ...
}

// For loop (over arrays)
for item in [1, 2, 3] {
  print(item)
}

// For loop (over ranges - exclusive end)
for i in 0..10 {
  print(i)    // 0, 1, 2, ... 9
}

// Match (pattern matching)
match statusCode {
  when 200 => print("OK")
  when 404 => print("Not Found")
  else => print("Unknown")
}

// Break and Continue
for i in 0..100 {
  if i == 50 { break }
  if i % 2 == 0 { continue }
  print(i)
}
```

### Functions

```
// Named function
fn add(a, b) {
  return a + b
}

// Default parameters
fn greet(name = "World") {
  return "Hello, " + name + "!"
}

// Arrow functions
let double = (x) => x * 2
let add = (a, b) => a + b

// Functions are first-class
let ops = [double, (x) => x + 1]
```

### Classes

```
class Animal {
  let name = ""
  let sound = ""

  fn init(name, sound) {
    this.name = name
    this.sound = sound
  }

  fn speak() {
    print(this.name + " says " + this.sound)
  }
}

class Dog extends Animal {
  fn init(name) {
    this.name = name
    this.sound = "Woof"
  }

  fn fetch() {
    print(this.name + " fetches the ball!")
  }
}

let buddy = new Dog("Buddy")
buddy.speak()   // "Buddy says Woof"
buddy.fetch()   // "Buddy fetches the ball!"
```

### Built-in Functions

<details>
<summary><strong>I/O (2)</strong></summary>

- `print(...)` — Output values
- `input(prompt)` — Read user input

</details>

<details>
<summary><strong>Math (14)</strong></summary>

- `abs(n)`, `floor(n)`, `ceil(n)`, `round(n)` — Rounding
- `sqrt(n)`, `pow(base, exp)` — Powers
- `sin(n)`, `cos(n)`, `tan(n)`, `log(n)` — Trigonometry
- `random()`, `randomInt(min, max)` — Random numbers
- `min(...)`, `max(...)` — Extremes
- Constants: `PI`, `E`, `TAU`, `INFINITY`

</details>

<details>
<summary><strong>Strings (14)</strong></summary>

- `len(s)` — Length
- `upper(s)`, `lower(s)`, `trim(s)` — Transform
- `split(s, delim)`, `join(arr, delim)` — Split/Join
- `contains(s, sub)`, `replace(s, old, new)` — Search
- `charAt(s, i)`, `startsWith(s, pre)`, `endsWith(s, suf)` — Access
- `repeat(s, n)`, `padStart(s, len)`, `padEnd(s, len)` — Format

</details>

<details>
<summary><strong>Arrays (14)</strong></summary>

- `push(arr, val)`, `pop(arr)`, `shift(arr)`, `unshift(arr, val)` — Mutate
- `slice(arr, start, end)`, `concat(arr1, arr2)` — Create
- `indexOf(arr, val)`, `includes(arr, val)` — Search
- `sort(arr)`, `reverse(arr)`, `flatten(arr)` — Transform
- `zip(arr1, arr2)`, `enumerate(arr)`, `unique(arr)` — Utilities
- Methods: `.map(fn)`, `.filter(fn)`, `.reduce(fn, init)`, `.forEach(fn)`

</details>

<details>
<summary><strong>Types (9)</strong></summary>

- `type(val)` — Get type as string
- `str(val)`, `num(val)`, `bool(val)` — Convert
- `isNumber(val)`, `isString(val)`, `isArray(val)`, `isNull(val)`, `isFunction(val)` — Check

</details>

<details>
<summary><strong>Utilities (8)</strong></summary>

- `range(end)`, `range(start, end)`, `range(start, end, step)` — Ranges
- `keys(obj)`, `values(obj)`, `entries(obj)` — Object access
- `time()` — Current timestamp
- `clone(val)` — Deep copy
- `assert(cond, msg)` — Assertions
- `format(template, ...)` — String formatting

</details>

### Error Messages

TinyLang errors are designed to help you learn:

```
❌ Parse Error at line 3, column 5: Expected ')' after function arguments

  3 | fn add(a, b {
    |             ^

💡 Hint: Function parameters must be enclosed in parentheses. Try: fn add(a, b) {
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      TinyLang System                          │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  Source Code ──▶ Lexer ──▶ Parser ──▶ Interpreter ──▶ Output  │
│               (Tokens)    (AST)     (Values)                  │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  src/lexer/        Tokenization with position tracking         │
│  src/parser/       Recursive descent + Pratt expression parse  │
│  src/interpreter/  Tree-walk evaluator with environments       │
│  src/stdlib/       60+ built-in functions (math, strings, etc) │
│  src/repl/         Interactive mode with multi-line support     │
│  src/cli/          Command-line interface                       │
│  playground/       Browser-based editor and runner              │
└──────────────────────────────────────────────────────────────┘
```

### Project Structure

```
tinylang/
├── .kiro/                    # Kiro configuration
│   ├── steering/             # Coding standards & language spec
│   ├── specs/                # Requirements, design, tasks
│   └── hooks/                # Build, lint, test automation
├── src/
│   ├── types/                # Token, AST, and runtime value types
│   ├── lexer/                # Tokenizer with educational errors
│   ├── parser/               # Recursive descent parser
│   ├── interpreter/          # Tree-walk interpreter
│   ├── stdlib/               # Standard library (6 modules)
│   ├── repl/                 # Interactive REPL
│   ├── cli/                  # CLI entry point
│   ├── tinylang.ts           # High-level API
│   └── index.ts              # Barrel exports
├── tests/
│   ├── lexer/                # Lexer unit tests
│   ├── parser/               # Parser unit tests
│   ├── interpreter/          # Interpreter unit tests
│   └── integration/          # Full program tests
├── examples/                 # 10 example .tiny programs
├── playground/               # Browser-based playground (single HTML)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Tree-walk interpreter | Simplicity over performance — educational use |
| Newline-based statements | No semicolons needed — lower cognitive load |
| Word-based logic (`and`, `or`, `not`) | More readable for beginners |
| Braces for blocks | Familiar from C-family but no dangling-else |
| Ranges `0..10` | Concise, Rust-inspired syntax |
| Hand-written lexer/parser | No dependencies, full educational control |

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with verbose output
npx vitest run --reporter=verbose

# Run specific test file
npx vitest run tests/lexer/lexer.test.ts
```

**Test Coverage:**
- **Lexer**: 29 tests — all token types, edge cases, error messages
- **Parser**: 33 tests — all statement and expression types
- **Interpreter**: 53 tests — arithmetic, variables, functions, classes, stdlib
- **Integration**: 9 tests — complete programs (fibonacci, fizzbuzz, sorting, etc.)
- **Total: 124 tests, all passing ✅**

---

## 🤖 How Kiro Was Used

This project was built entirely using [Kiro](https://kiro.dev), demonstrating the **spec-driven development workflow**:

### Specs (Requirements → Design → Tasks)

The `.kiro/specs/` directory contains the full development lifecycle:

1. **`requirements.md`** — 10 user stories with acceptance criteria covering all features (running programs, REPL, variables, functions, control flow, data structures, classes, educational errors, web playground, stdlib)

2. **`design.md`** — Complete architecture document with system diagram, component interfaces, operator precedence table, data flow, error handling strategy, and testing strategy

3. **`tasks.md`** — Detailed implementation tasks broken into 4 phases with checkboxes tracking completion

### Steering Files

The `.kiro/steering/` directory provides persistent project knowledge:

- **`project-overview.md`** — Architecture overview, tech stack, key decisions
- **`coding-standards.md`** — TypeScript guidelines, error handling philosophy, naming conventions, testing standards
- **`language-spec.md`** — Complete TinyLang syntax reference used during implementation

### Hooks

The `.kiro/hooks/` directory automates quality:

- **`build-check.json`** — TypeScript type-check on save
- **`format-on-save.json`** — Auto-format with Prettier
- **`lint-on-save.json`** — ESLint fixes on save
- **`test-on-save.json`** — Run tests when source changes
- **`validate-examples.json`** — Syntax-check .tiny files on save

### Development Workflow

```
1. Wrote requirements in .kiro/specs/requirements.md
2. Designed architecture in .kiro/specs/design.md
3. Created implementation tasks in .kiro/specs/tasks.md
4. Set up steering files for coding standards
5. Implemented each component following the task list
6. Hooks automated testing and type-checking throughout
7. Iteratively refined based on test results
```

---

## 📁 Example Programs

The `examples/` directory contains 10 progressively complex programs:

| File | Concepts Taught |
|------|-----------------|
| `01-hello.tiny` | Hello World, variables, string concatenation |
| `02-variables.tiny` | Data types, constants, type checking |
| `03-functions.tiny` | Functions, defaults, recursion, closures, arrows |
| `04-arrays.tiny` | Arrays, map/filter/reduce, chaining |
| `05-loops.tiny` | While, for-in, ranges, break, continue |
| `06-classes.tiny` | Classes, inheritance, methods, OOP |
| `07-fibonacci.tiny` | Recursive vs iterative, golden ratio |
| `08-sorting.tiny` | Bubble, selection, insertion sort |
| `09-functional.tiny` | Composition, currying, data pipelines |
| `10-match.tiny` | Pattern matching, calculator, FizzBuzz |

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Type check without building
npx tsc --noEmit

# Clean build artifacts
npm run clean
```

---

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Ensure tests pass (`npm test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Inspired by [Crafting Interpreters](https://craftinginterpreters.com) by Bob Nystrom
- Built with [Kiro](https://kiro.dev) — spec-driven AI development
- Hackathon entry for [Ready, Spec, Ship](https://codingagents.fyi/hackathon/kiro/)
