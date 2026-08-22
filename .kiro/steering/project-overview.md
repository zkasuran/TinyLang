# TinyLang Project Overview

## What is TinyLang?
TinyLang is a complete, professional-grade educational programming language with a full toolchain. It features a clean, Python-inspired syntax with friendly error messages, a bytecode compiler and virtual machine, an interactive debugger, code formatter, linter, test runner, module system, CLI, REPL, and a browser-based Web IDE.

## Architecture

The project follows a dual execution pipeline with comprehensive tooling:

### Core Language Engine
1. **Lexer** (`src/lexer/`) - Tokenizes source code into a stream of tokens
2. **Parser** (`src/parser/`) - Builds an Abstract Syntax Tree (AST) from tokens
3. **Interpreter** (`src/interpreter/`) - Tree-walk evaluator that executes AST nodes
4. **Compiler** (`src/compiler/`) - Compiles AST to bytecode (63 opcodes)
5. **VM** (`src/vm/`) - Stack-based virtual machine that executes bytecode
6. **Standard Library** (`src/stdlib/`) - Built-in functions and modules

### Developer Tooling
7. **Debugger** (`src/debugger/`) - Interactive debugger with breakpoints and stepping
8. **Formatter** (`src/formatter/`) - AST-based code formatter
9. **Linter** (`src/linter/`) - Static analysis with 5 built-in rules
10. **Test Runner** (`src/testing/`) - Inline test block discovery and execution
11. **Module System** (`src/modules/`) - File-based imports with caching

### User Interfaces
12. **CLI** (`src/cli/`) - Command-line interface with 17 subcommands
13. **REPL** (`src/repl/`) - Interactive read-eval-print loop
14. **Web IDE** (`playground/`) - Full browser-based development environment

## Tech Stack
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js >= 18
- **Testing**: Vitest (1003 tests)
- **Build**: TypeScript compiler (tsc) + esbuild (playground bundling)
- **Package Manager**: npm
- **Editor**: CodeMirror 6 (Web IDE)

## Key Design Decisions

See [Architecture Decisions](./architecture-decisions.md) for full ADRs.

- Tree-walk interpretation as primary path (simplicity for education)
- Optional bytecode compilation for advanced users (learn about compilers)
- Stack-based VM (simpler than register-based, well-documented approach)
- Replay-based debugger (works with synchronous interpreter, deterministic)
- Newline-based statement separation (no semicolons required)
- Python-inspired syntax with braces for blocks (lower learning curve)
- Educational error messages with hints and source context
- No external runtime dependencies for the core engine
- Single-file HTML output for the Web IDE (zero-config deployment)
- esbuild for fast bundling (sub-100ms builds)
- CodeMirror 6 from CDN (lightweight, extensible, mobile-friendly)

## File Conventions
- All source in `src/` with barrel exports via `index.ts`
- Tests mirror source structure in `tests/`
- Examples in `examples/` directory with `.tiny` extension (18 programs)
- Documentation inline via JSDoc comments
- Specs organized by subsystem in `.kiro/specs/`

## Related Steering Files
- [Coding Standards](./coding-standards.md) - TypeScript guidelines and conventions
- [Language Spec](./language-spec.md) - TinyLang syntax reference
- [Testing Guide](./testing-guide.md) - How to write and run tests
- [Architecture Decisions](./architecture-decisions.md) - ADRs for key decisions
- [Web IDE Guide](./web-ide-guide.md) - Playground development conventions
