# Contributing to TinyLang

## Development Setup

```bash
git clone https://github.com/zkasuran/TinyLang.git
cd TinyLang
npm install
npm run build
npx vitest run  # Verify all tests pass
```

## Project Structure

```
src/
  cli/          CLI command handlers
  compiler/     Bytecode compiler and optimizer
  debugger/     Interactive debugger
  formatter/    AST-based code formatter
  interpreter/  Tree-walk interpreter
  lexer/        Tokenizer
  linter/       Static analysis rules
  modules/      Module resolution
  parser/       Recursive descent parser
  repl/         Interactive REPL
  stdlib/       Standard library (io, math, strings, arrays, types, utils)
  testing/      Built-in test framework
  types/        Token, AST, and value type definitions
  utils/        Shared utilities
  vm/           Stack-based virtual machine
tests/          Vitest test files (mirrors src/ structure)
examples/       Example TinyLang programs
docs/           Documentation site
playground/     Web IDE (single-file HTML)
.kiro/          Kiro configuration (specs, steering, hooks)
```

## Development Workflow

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes with tests
3. Run `npm run build` (must compile with zero errors)
4. Run `npx vitest run` (all tests must pass)
5. Run examples: `node dist/cli/index.js run examples/01-hello.tiny`
6. Commit with a descriptive message

## Adding a Language Feature

1. **Tokens**: Add new token type to `src/types/tokens.ts`
2. **AST Node**: Add node type to `src/types/ast.ts`
3. **Lexer**: Recognize new syntax in `src/lexer/lexer.ts`
4. **Parser**: Parse new syntax in `src/parser/parser.ts`
5. **Interpreter**: Evaluate in `src/interpreter/interpreter.ts`
6. **Compiler**: Emit bytecode in `src/compiler/compiler.ts`
7. **VM**: Execute in `src/vm/vm.ts`
8. **Tests**: Add tests for each component
9. **Example**: Add example program in `examples/`

## Adding a Stdlib Function

1. Choose the appropriate module in `src/stdlib/` (math, strings, arrays, etc.)
2. Create a `NativeFunctionValue` with name, parameters, and implementation
3. Export it from the module array
4. Add tests in the interpreter test file
5. Document in `docs/stdlib-api.md`

## Coding Standards

- TypeScript strict mode (no `any` unless absolutely necessary)
- All functions and classes have doc comments
- Error messages are user-friendly and include suggestions
- Every feature has tests (aim for >90% coverage)
- Use the existing patterns (see `.kiro/steering/coding-standards.md`)

## Testing

```bash
# Run all tests
npx vitest run

# Run specific module
npx vitest run tests/interpreter/

# Run in watch mode
npx vitest

# Run with coverage
npx vitest run --coverage
```

## Code Style

- 2-space indentation
- Single quotes for strings
- No semicolons (TypeScript handles it)
- Descriptive variable names
- Small, focused functions
