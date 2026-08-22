# TinyLang — Design Document

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         TinyLang System                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────┐    ┌─────────┐    ┌─────────────┐    ┌──────────┐  │
│  │  Source  │───▶│  Lexer  │───▶│   Parser    │───▶│Interpreter│  │
│  │  Code   │    │(Tokens) │    │   (AST)     │    │ (Values)  │  │
│  └─────────┘    └─────────┘    └─────────────┘    └──────────┘  │
│                                                         │         │
│                                              ┌──────────┴───────┐ │
│                                              │  Standard Library │ │
│                                              │  (Built-in Fns)  │ │
│                                              └──────────────────┘ │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│                      Interface Layer                               │
│  ┌────────────┐    ┌────────────┐    ┌───────────────────────┐   │
│  │    CLI     │    │    REPL    │    │   Web Playground      │   │
│  │ (Commands) │    │(Interactive)│   │  (Browser-based)      │   │
│  └────────────┘    └────────────┘    └───────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Lexer (`src/lexer/`)
**Responsibility:** Convert source string into token stream.

**Key Decisions:**
- Hand-written lexer (no generator tools) for educational clarity
- Meaningful newlines as statement separators (ASI-like)
- Nested block comments support (`/* ... /* inner */ ... */`)
- Position tracking for all tokens (line, column, offset)

**Interface:**
```typescript
class Lexer {
  constructor(source: string)
  tokenize(): Token[]
}
```

### 2. Parser (`src/parser/`)
**Responsibility:** Transform token stream into AST using recursive descent.

**Key Decisions:**
- Pratt parser for expressions (handles precedence elegantly)
- Recursive descent for statements
- Error recovery: skip to next statement on parse errors
- All AST nodes carry source positions for error reporting

**Operator Precedence (low to high):**
1. Assignment (`=`, `+=`, etc.)
2. Logical OR (`or`)
3. Logical AND (`and`)
4. Equality (`==`, `!=`)
5. Comparison (`<`, `>`, `<=`, `>=`)
6. Range (`..`)
7. Addition (`+`, `-`)
8. Multiplication (`*`, `/`, `%`)
9. Power (`**`)
10. Unary (`not`, `-`)
11. Call, Member, Index

**Interface:**
```typescript
class Parser {
  constructor(tokens: Token[])
  parse(): Program
}
```

### 3. Interpreter (`src/interpreter/`)
**Responsibility:** Walk the AST and execute operations, producing RuntimeValues.

**Key Decisions:**
- Tree-walk interpreter (simple, sufficient for educational use)
- Environment-based scoping with parent chain
- Eager evaluation for function arguments
- Control flow via signal objects (ReturnSignal, BreakSignal, ContinueSignal)

**Interface:**
```typescript
class Interpreter {
  constructor(options?: InterpreterOptions)
  execute(program: Program): RuntimeValue
  executeInEnvironment(program: Program, env: Environment): RuntimeValue
}
```

### 4. Standard Library (`src/stdlib/`)
**Responsibility:** Provide built-in functions accessible from TinyLang code.

**Modules:**
- `io.ts` — print, input
- `math.ts` — abs, floor, ceil, round, sqrt, random, min, max, pow
- `strings.ts` — len, split, join, upper, lower, trim, contains, replace, charAt
- `arrays.ts` — push, pop, shift, map, filter, reduce, sort, reverse, slice, indexOf
- `types.ts` — type, str, num, bool
- `utils.ts` — range, keys, values, clone, time

### 5. REPL (`src/repl/`)
**Responsibility:** Interactive mode with line editing and multi-line support.

**Features:**
- Prompt with `tiny> ` prefix
- Auto-detect multi-line input (open braces)
- Special commands: `.help`, `.clear`, `.exit`, `.examples`
- Colorized output (values, errors, hints)
- Expression results auto-printed

### 6. CLI (`src/cli/`)
**Responsibility:** Entry point with subcommands.

**Commands:**
- `tinylang run <file>` — Execute a .tiny file
- `tinylang repl` — Start interactive mode
- `tinylang check <file>` — Syntax check without execution
- `tinylang format <file>` — Pretty-print source code
- `tinylang version` — Show version info

### 7. Web Playground (`playground/`)
**Responsibility:** Browser-based TinyLang environment.

**Tech:** Single HTML file with embedded CSS/JS, bundling the interpreter.

**Features:**
- Monaco-inspired code editor (using CodeMirror or textarea with highlighting)
- Run button + keyboard shortcut (Ctrl+Enter)
- Output console panel
- Example program selector
- Share via URL encoding
- Responsive design (works on mobile)

## Data Flow

```
User Input → CLI/REPL/Playground
  → Source String
    → Lexer.tokenize() → Token[]
      → Parser.parse() → Program (AST)
        → Interpreter.execute() → RuntimeValue
          → stringify() → Output String
            → Display to User
```

## Error Handling Strategy

All errors in TinyLang are educational:

```typescript
interface TinyLangError {
  type: 'LexerError' | 'ParseError' | 'RuntimeError';
  message: string;      // What went wrong
  position: SourcePosition;  // Where
  hint: string;         // How to fix it
  context: string;      // Source line with pointer
}
```

Error propagation:
- Lexer errors → thrown immediately, stop processing
- Parser errors → collected, attempt error recovery, report all at end
- Runtime errors → thrown with stack context

## Testing Strategy

| Module | Test Type | Target Coverage |
|--------|-----------|----------------|
| Lexer | Unit | 95%+ |
| Parser | Unit | 90%+ |
| Interpreter | Unit + Integration | 90%+ |
| Stdlib | Unit | 85%+ |
| CLI | Integration | 80%+ |
| End-to-End | Integration | Full example programs |
