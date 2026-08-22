# Contributing to TinyLang

Thank you for your interest in contributing to TinyLang! This guide will help you get set up and understand the project architecture.

## Getting Started

### Prerequisites

- **Node.js** 18 or later (22 recommended)
- **npm** 9 or later
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/zkasuran/TinyLang.git
cd TinyLang

# Install dependencies
npm install

# Build the project
npm run build

# Run the test suite
npx vitest run

# Verify everything works
node dist/cli/index.js run examples/01-hello.tiny
```

### Development Workflow

```bash
# Build TypeScript (required after changes)
npm run build

# Run all 399 tests
npx vitest run

# Watch mode for tests during development
npx vitest

# Type check without emitting files
npx tsc --noEmit

# Run a specific test file
npx vitest run tests/interpreter/interpreter.test.ts

# Test a TinyLang program
node dist/cli/index.js run examples/07-fibonacci.tiny

# Rebuild the playground (after changing playground/template.html)
npm run playground:build
```

## Project Architecture

TinyLang is a complete language toolchain with these major subsystems:

```
Source Code (.tiny)
       |
       v
   [Lexer] ---- tokenizes source into tokens
       |
       v
   [Parser] ---- builds Abstract Syntax Tree
       |
       +-----------+-----------+
       |           |           |
       v           v           v
 [Interpreter] [Compiler] [Formatter/Linter]
       |           |
       v           v
  [Debugger]    [VM] ---- executes bytecode
```

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `src/lexer/` | Tokenizer with position tracking and error recovery |
| `src/parser/` | Recursive descent parser with Pratt expression parsing |
| `src/interpreter/` | Tree-walk evaluator with environment scoping |
| `src/compiler/` | Bytecode compiler (44 opcodes) and optimizer |
| `src/vm/` | Stack-based virtual machine |
| `src/debugger/` | Replay-based interactive debugger |
| `src/formatter/` | AST-based code formatter |
| `src/linter/` | Rule-based static analysis engine |
| `src/testing/` | Built-in test framework runner |
| `src/modules/` | Module loader with circular dependency detection |
| `src/stdlib/` | Standard library (60+ functions) |
| `src/repl/` | Interactive REPL |
| `src/cli/` | CLI entry point and 14 commands |
| `src/types/` | Token, AST node, and runtime value type definitions |
| `src/utils/` | Shared utilities |
| `tests/` | Vitest test suites (mirrors src/ structure) |
| `examples/` | Example .tiny programs |
| `playground/` | Web IDE (template + build script) |
| `docs/` | Static documentation site |
| `.kiro/` | Spec-driven development configuration |

### Key Design Decisions

1. **TypeScript strict mode** - No `any` types, full type safety
2. **Hand-written parser** - No parser generators; educational and fast
3. **Dual execution** - Tree-walk interpreter AND bytecode VM
4. **Replay debugger** - Records states for time-travel debugging
5. **AST-based formatter** - Guarantees idempotent output
6. **Self-contained Web IDE** - Single HTML file with bundled engine

### Type System

Runtime values are discriminated unions (`src/types/values.ts`):

```typescript
type RuntimeValue =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'array'; elements: RuntimeValue[] }
  | { type: 'object'; properties: Map<string, RuntimeValue> }
  | { type: 'function'; ... }
  | { type: 'class'; ... }
```

AST nodes carry source positions (`src/types/ast.ts`) for error reporting.

## Coding Standards

These standards are enforced across the codebase (see `.kiro/steering/coding-standards.md` for full details):

### TypeScript Guidelines

- **Strict mode** - `strict: true` in tsconfig.json
- **No `any`** - Use proper types or `unknown` with type guards
- **JSDoc** on all public methods and exported functions
- **Descriptive names** - `tokenizeStringLiteral()` not `tsl()`
- **Barrel exports** - Each module has an `index.ts` re-exporting public API

### Error Handling Philosophy

TinyLang prioritizes educational, helpful error messages:

```typescript
// Good: helpful error with suggestion
throw new RuntimeError(
  `'${name}' is not defined.${suggestion ? ` Did you mean '${suggestion}'?` : ''}`,
  position
);

// Bad: generic error
throw new Error("undefined variable");
```

Every error should include:
- What went wrong (clear description)
- Where it happened (source position)
- How to fix it (hint or suggestion when possible)

### Testing Patterns

- One test file per source module in `tests/` (mirrors `src/` structure)
- Use `describe` blocks to group related tests
- Test both success cases and error cases
- Verify error messages contain helpful hints

```typescript
describe('Interpreter - functions', () => {
  it('should call functions with arguments', () => {
    const result = run('fn add(a, b) { return a + b } add(2, 3)');
    expect(result).toBe(5);
  });

  it('should report undefined function with suggestion', () => {
    expect(() => run('prnt("hello")')).toThrow(/Did you mean 'print'/);
  });
});
```

## How to Add a New Feature

### 1. Language Feature (new syntax)

1. **Lexer** - Add new token type(s) to `src/types/tokens.ts`, handle in `src/lexer/lexer.ts`
2. **Parser** - Add AST node type to `src/types/ast.ts`, parse in `src/parser/parser.ts`
3. **Interpreter** - Add evaluation in `src/interpreter/interpreter.ts`
4. **Compiler** (optional) - Add bytecode emission in `src/compiler/compiler.ts`
5. **VM** (optional) - Add opcode handling in `src/vm/vm.ts`
6. **Tests** - Add tests covering all new paths
7. **Docs** - Update `docs/language-reference.html`
8. **Examples** - Add or update example files in `examples/`

### 2. CLI Command

1. Add command handler in `src/cli/index.ts`
2. Add tests in `tests/cli/cli.test.ts`
3. Update README.md CLI reference table

### 3. Standard Library Function

1. Add to appropriate module in `src/stdlib/`
2. Register in the stdlib registration function
3. Add tests
4. Document in `docs/stdlib.html`

### 4. Linter Rule

1. Create rule file in `src/linter/rules/`
2. Register in `src/linter/linter.ts`
3. Add tests in `tests/linter/linter.test.ts`

## Pull Request Process

1. Fork the repository and create a feature branch
2. Follow the coding standards above
3. Ensure all 399+ tests pass (`npx vitest run`)
4. Add tests for any new functionality
5. Update documentation if adding user-facing features
6. Use conventional commit messages:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation only
   - `refactor:` - Code restructuring
   - `test:` - Adding or updating tests
   - `chore:` - Build process, tooling changes
7. Open a Pull Request with a clear description

## Playground Development

The Web IDE lives in `playground/`:

- `playground/template.html` - Source of truth (edit this)
- `playground/build.js` - esbuild bundler that produces `index.html`
- `playground/index.html` - Generated output (do not edit directly)

After modifying `template.html`:
```bash
npm run playground:build
```

The build script bundles the TinyLang engine (from `src/`) into the HTML file as an IIFE bundle using esbuild.

## Questions?

- Check `.kiro/steering/` for detailed guidance on specific topics
- Look at existing code for patterns and conventions
- Review the test suite for usage examples of every feature
