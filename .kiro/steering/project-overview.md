# TinyLang Project Overview

## What is TinyLang?
TinyLang is a minimal, educational programming language designed to teach programming concepts to beginners. It features a clean, Python-inspired syntax with friendly error messages that guide learners.

## Architecture
The project follows a classic interpreter pipeline:
1. **Lexer** (`src/lexer/`) — Tokenizes source code into a stream of tokens
2. **Parser** (`src/parser/`) — Builds an Abstract Syntax Tree (AST) from tokens
3. **Interpreter** (`src/interpreter/`) — Tree-walk evaluator that executes AST nodes
4. **Standard Library** (`src/stdlib/`) — Built-in functions and modules
5. **REPL** (`src/repl/`) — Interactive read-eval-print loop
6. **CLI** (`src/cli/`) — Command-line interface with subcommands
7. **Playground** (`playground/`) — Browser-based code editor and runner

## Tech Stack
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js >= 18
- **Testing**: Vitest
- **Build**: TypeScript compiler (tsc)
- **Package Manager**: npm

## Key Design Decisions
- Tree-walk interpretation (simplicity over performance for educational purposes)
- Newline-based statement separation (no semicolons required)
- Python-inspired syntax with braces for blocks (lower learning curve)
- Educational error messages with hints and source context
- No external runtime dependencies for the core interpreter

## File Conventions
- All source in `src/` with barrel exports via `index.ts`
- Tests mirror source structure in `tests/`
- Examples in `examples/` directory with `.tiny` extension
- Documentation inline via JSDoc comments
