# TinyLang - Design Document

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           TinyLang System                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                          ┌─────────────────────────────────────┐           │
│                          │         Source (.tiny)               │           │
│                          └─────────────┬───────────────────────┘           │
│                                        │                                   │
│                                        v                                   │
│                          ┌─────────────────────────────┐                   │
│                          │         Lexer (Tokens)       │                   │
│                          └─────────────┬───────────────┘                   │
│                                        │                                   │
│                                        v                                   │
│                          ┌─────────────────────────────┐                   │
│                          │       Parser (AST)           │                   │
│                          └─────────┬───────┬───────────┘                   │
│                                    │       │                               │
│              ┌─────────────────────┘       └──────────────────┐            │
│              v                                                 v            │
│  ┌───────────────────┐                            ┌───────────────────┐    │
│  │   Interpreter     │                            │    Compiler       │    │
│  │  (Tree-walk)      │                            │  (Bytecode)       │    │
│  └─────────┬─────────┘                            └─────────┬─────────┘   │
│            │                                                 │             │
│            v                                                 v             │
│  ┌───────────────────┐                            ┌───────────────────┐    │
│  │   Debugger        │                            │   Optimizer       │    │
│  │ (Replay-based)    │                            │ (Const fold, DCE) │    │
│  └───────────────────┘                            └─────────┬─────────┘   │
│                                                              │             │
│                                                              v             │
│                                                   ┌───────────────────┐    │
│                                                   │   VM (Stack)      │    │
│                                                   └───────────────────┘    │
│                                                                            │
├──────────────────────────────────────────────────────────────────────────┤
│                         Toolchain Layer                                     │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐   │
│  │ Formatter │  │  Linter  │  │Test Runner│  │  Module  │  │  REPL  │   │
│  │(AST Print)│  │(5 Rules) │  │(Discover) │  │ (Loader) │  │(Loop)  │   │
│  └───────────┘  └──────────┘  └───────────┘  └──────────┘  └────────┘   │
│                                                                            │
├──────────────────────────────────────────────────────────────────────────┤
│                        Interface Layer                                      │
│  ┌──────────────────┐  ┌────────────────────────────────────────────┐     │
│  │   CLI (Commands) │  │      Web IDE (CodeMirror + Panels)         │     │
│  │ run, compile,    │  │  Editor, Console, AST Viewer, Debugger,    │     │
│  │ debug, format,   │  │  Bytecode Viewer, File Explorer, Sharing   │     │
│  │ lint, test, repl │  │                                            │     │
│  └──────────────────┘  └────────────────────────────────────────────┘     │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Subsystem Design Documents

Detailed designs for each major subsystem:

- **[Compiler & VM](./compiler-vm/design.md)** - 44 opcodes, stack-based execution, constant pool, serialization
- **[Debugger](./debugger/design.md)** - Replay-based architecture, debug hooks, variable inspection
- **[Web IDE](./web-ide/design.md)** - Panel layout, CodeMirror integration, esbuild bundling
- **[Toolchain](./toolchain/design.md)** - AST-based formatting, rule-based linting, test discovery

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
2. Ternary (`?` `:`)
3. Logical OR (`or`)
4. Logical AND (`and`)
5. Equality (`==`, `!=`)
6. Comparison (`<`, `>`, `<=`, `>=`)
7. Range (`..`)
8. Addition (`+`, `-`)
9. Multiplication (`*`, `/`, `%`)
10. Power (`**`)
11. Unary (`not`, `-`)
12. Call, Member, Index

### 3. Interpreter (`src/interpreter/`)
**Responsibility:** Walk the AST and execute operations, producing RuntimeValues.

**Key Decisions:**
- Tree-walk interpretation for simplicity and educational clarity
- Environment-based scoping with parent chain (lexical scope)
- Eager evaluation for function arguments
- Control flow via signal objects (ReturnSignal, BreakSignal, ContinueSignal)
- Optional debug hook for debugger integration

### 4. Compiler (`src/compiler/`)
**Responsibility:** Compile AST to bytecode for VM execution.

**Key Decisions:**
- Single-pass compilation (no IR)
- 44 opcodes covering all language features
- Upvalue-based closure implementation
- Three optimizer passes (constant folding, DCE, peephole)
- Binary serialization format with magic bytes and versioning

See [Compiler & VM Design](./compiler-vm/design.md) for full details.

### 5. Virtual Machine (`src/vm/`)
**Responsibility:** Execute compiled bytecode on a stack-based machine.

**Key Decisions:**
- Fixed-size operand stack with overflow detection
- Call frame stack for function calls
- Fetch-decode-execute loop
- Native function integration for stdlib

See [Compiler & VM Design](./compiler-vm/design.md) for full details.

### 6. Debugger (`src/debugger/`)
**Responsibility:** Interactive debugging with breakpoints and stepping.

**Key Decisions:**
- Replay-based architecture (re-execute from start for each step)
- Debug hook in interpreter called before each statement
- DebugPauseSignal thrown to unwind interpreter stack
- Output suppression during replay

See [Debugger Design](./debugger/design.md) for full details.

### 7. Formatter (`src/formatter/`)
**Responsibility:** AST-based pretty printer for consistent code style.

**Key Decisions:**
- Parse-then-print approach (guarantees correctness)
- Idempotent output
- 2-space indentation, K&R brace style

See [Toolchain Design](./toolchain/design.md) for full details.

### 8. Linter (`src/linter/`)
**Responsibility:** Static analysis with configurable rules.

**Key Decisions:**
- Rule functions receive full AST
- Five built-in rules (unused-variables, unreachable-code, no-empty-blocks, prefer-const, no-shadow)
- Diagnostic objects with optional auto-fix data

See [Toolchain Design](./toolchain/design.md) for full details.

### 9. Test Runner (`src/testing/`)
**Responsibility:** Discover and execute inline test blocks.

**Key Decisions:**
- `test "desc" { ... }` syntax parsed as AST nodes
- Isolated environment per test
- Built-in assertion functions

See [Toolchain Design](./toolchain/design.md) for full details.

### 10. Module System (`src/modules/`)
**Responsibility:** File-based code organization with imports.

**Key Decisions:**
- Named imports: `import { a, b } from "path"`
- Three resolution strategies (stdlib, relative, project)
- Execute-once caching with circular dependency detection

### 11. Standard Library (`src/stdlib/`)
**Responsibility:** Built-in functions available in all TinyLang programs.

**Modules:** io, math, strings, arrays, types, utils
**Registration:** Functions are registered in the global environment before execution.

### 12. REPL (`src/repl/`)
**Responsibility:** Interactive read-eval-print loop.

**Features:** Multi-line detection, auto-print expressions, dot commands, colorized output.

### 13. CLI (`src/cli/`)
**Responsibility:** Command-line entry point with subcommands.

**Commands:** run, compile, disassemble, debug, format, lint, test, repl, version, check

### 14. Web IDE (`playground/`)
**Responsibility:** Browser-based development environment.

**Architecture:** Single-file HTML with inlined TinyLang bundle (built by esbuild).
**Features:** CodeMirror editor, debugger panel, AST viewer, bytecode viewer, file explorer, themes, sharing.

See [Web IDE Design](./web-ide/design.md) for full details.

## Data Flow

### Interpretation Path
```
Source -> Lexer -> Tokens -> Parser -> AST -> Interpreter -> Output
```

### Compilation Path
```
Source -> Lexer -> Tokens -> Parser -> AST -> Compiler -> Chunk
  -> Optimizer -> Optimized Chunk -> Serializer -> .tinyc file
```

### Execution Path (Compiled)
```
.tinyc -> Deserializer -> Chunk -> VM -> Output
```

### Debug Path
```
Source -> Parser -> AST -> Interpreter (with debug hook)
  -> DebugPauseSignal -> Debugger captures state -> User inspects
  -> Resume: replay from start, skip past previous point -> continue
```

## Error Handling Strategy

All errors in TinyLang are educational:

```typescript
interface TinyLangError {
  type: 'LexerError' | 'ParseError' | 'RuntimeError' | 'CompileError';
  message: string;          // What went wrong
  position: SourcePosition; // Where
  hint: string;             // How to fix it
  context: string;          // Source line with pointer
}
```

Error propagation:
- Lexer errors: thrown immediately, stop processing
- Parser errors: collected, attempt error recovery, report all at end
- Compile errors: thrown with source position mapping
- Runtime errors: thrown with stack context and source line

## Testing Strategy

| Module | Test Type | Tests |
|--------|-----------|-------|
| Lexer | Unit | Token types, edge cases, errors |
| Parser | Unit | All statement/expression types |
| Interpreter | Unit + Integration | Evaluation correctness |
| Compiler | Unit | Instruction emission |
| VM | Unit + Integration | Opcode execution |
| Optimizer | Unit | Transform correctness |
| Debugger | Integration | Session control flow |
| Formatter | Unit | Idempotency, all constructs |
| Linter | Unit | Each rule individually |
| Test Runner | Integration | Discovery and execution |
| Module Loader | Integration | Resolution and caching |
| CLI | Integration | Command execution |
| End-to-End | Integration | Full example programs |

Total: 338+ automated tests via Vitest.
