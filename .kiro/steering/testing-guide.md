# Testing Guide

## Overview

TinyLang uses **Vitest** as its test framework with 1003 tests covering all subsystems. Tests are organized to mirror the source directory structure.

## Directory Structure

```
tests/
  lexer/
    lexer.test.ts          # Token scanning, edge cases, errors
  parser/
    parser.test.ts         # All AST node types
  interpreter/
    interpreter.test.ts    # Expression evaluation, statements, scoping
  compiler/
    compiler.test.ts       # Instruction emission
    optimizer.test.ts      # Optimization passes
  vm/
    vm.test.ts             # Opcode execution
  debugger/
    debugger.test.ts       # Session control, breakpoints, stepping
  formatter/
    formatter.test.ts      # Idempotency, all constructs
  linter/
    linter.test.ts         # Each rule individually
  testing/
    runner.test.ts         # Test discovery and execution
  stdlib/
    stdlib.test.ts         # Built-in functions
  modules/
    modules.test.ts        # Resolution, loading, caching
  integration/
    programs.test.ts       # End-to-end example programs
```

## Test Patterns

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer';

describe('Lexer', () => {
  describe('tokenize', () => {
    it('should tokenize simple numbers', () => {
      const lexer = new Lexer('42');
      const tokens = lexer.tokenize();
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe('42');
    });

    it('should report errors with helpful messages', () => {
      const lexer = new Lexer('"unterminated');
      expect(() => lexer.tokenize()).toThrow(/unterminated string/i);
    });
  });
});
```

### Testing the Full Pipeline

```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../../src/lexer';
import { Parser } from '../../src/parser';
import { Interpreter } from '../../src/interpreter';
import { registerStdlib } from '../../src/stdlib';
import { Environment } from '../../src/types/values';

function run(source: string): string[] {
  const output: string[] = [];
  const lexer = new Lexer(source);
  const parser = new Parser(lexer.tokenize());
  const interpreter = new Interpreter({
    output: (msg) => output.push(msg)
  });
  const env = new Environment();
  registerStdlib(env);
  interpreter.executeInEnvironment(parser.parse(), env);
  return output;
}

describe('Integration', () => {
  it('should execute fibonacci correctly', () => {
    const output = run(`
      fn fib(n) {
        if n <= 1 { return n }
        return fib(n - 1) + fib(n - 2)
      }
      print(fib(10))
    `);
    expect(output).toEqual(['55']);
  });
});
```

### Testing Error Messages

```typescript
it('should provide helpful error for undefined variable', () => {
  expect(() => run('print(xyz)')).toThrow();
  try {
    run('print(xyz)');
  } catch (err) {
    expect(err.message).toContain('xyz');
    expect(err.hint).toBeDefined();
  }
});
```

### Testing the Compiler/VM

```typescript
import { Compiler } from '../../src/compiler';
import { VM } from '../../src/vm';

function compileAndRun(source: string): string[] {
  const output: string[] = [];
  const lexer = new Lexer(source);
  const parser = new Parser(lexer.tokenize());
  const compiler = new Compiler();
  const chunk = compiler.compile(parser.parse());
  const vm = new VM({ output: (msg) => output.push(msg) });
  vm.execute(chunk);
  return output;
}

describe('Compiler + VM', () => {
  it('should produce same output as interpreter', () => {
    const source = 'let x = 2 + 3\nprint(x)';
    expect(compileAndRun(source)).toEqual(run(source));
  });
});
```

## Fixture Conventions

### Example Programs as Fixtures

The `examples/` directory serves as integration test fixtures:

```typescript
import * as fs from 'fs';
import * as path from 'path';

const examplesDir = path.join(__dirname, '../../examples');

describe('Example programs', () => {
  const files = fs.readdirSync(examplesDir).filter(f => f.endsWith('.tiny'));

  for (const file of files) {
    it(`should execute ${file} without errors`, () => {
      const source = fs.readFileSync(path.join(examplesDir, file), 'utf-8');
      expect(() => run(source)).not.toThrow();
    });
  }
});
```

### Test Data Inline

For unit tests, prefer inline test data over external fixture files:

```typescript
// Good: inline test data
it('should parse array literal', () => {
  const ast = parse('[1, 2, 3]');
  expect(ast.body[0].type).toBe('ExpressionStatement');
});

// Avoid: external fixture file for a simple case
```

## Coverage Expectations

| Module | Target Coverage |
|--------|----------------|
| Lexer | 95%+ |
| Parser | 90%+ |
| Interpreter | 90%+ |
| Compiler | 85%+ |
| VM | 85%+ |
| Stdlib | 85%+ |
| Formatter | 80%+ |
| Linter | 85%+ |
| Test Runner | 80%+ |
| Overall | 85%+ |

## Running Tests

```bash
# Run all tests
npx vitest run

# Run specific test file
npx vitest run tests/lexer/lexer.test.ts

# Run with coverage
npx vitest run --coverage

# Watch mode (development)
npx vitest

# Run tests matching a pattern
npx vitest run -t "fibonacci"
```

## Adding Tests for New Features

When implementing a new language feature:

1. **Add lexer tests** for any new tokens
2. **Add parser tests** for the new AST node type
3. **Add interpreter tests** for evaluation behavior
4. **Add compiler tests** for bytecode emission
5. **Add VM tests** for opcode execution
6. **Add integration test** with a complete program using the feature
7. **Add error tests** for invalid usage with expected error messages

### Checklist for a new feature:

```
- [ ] Lexer test: new token type recognized correctly
- [ ] Parser test: AST node produced with correct structure
- [ ] Interpreter test: evaluates to correct value
- [ ] Compiler test: emits correct bytecode sequence
- [ ] VM test: bytecode executes correctly
- [ ] Error test: invalid usage produces helpful message
- [ ] Integration test: works in a complete program context
```

## Test Best Practices

1. **Descriptive names:** Test names should explain what behavior is being verified
2. **One assertion concept per test:** Each `it()` tests one logical behavior
3. **Test both success and failure:** Always test error cases alongside happy paths
4. **No test interdependence:** Tests must be order-independent
5. **Minimal setup:** Keep test setup focused on what is being tested
6. **Readable assertions:** Prefer specific matchers (`toBe`, `toContain`) over generic (`toBeTruthy`)
