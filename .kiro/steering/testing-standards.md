# Testing Standards

## Philosophy

Every language feature in TinyLang must be backed by automated tests. Tests serve as both verification and documentation of expected behavior.

## Test Organization

- Tests mirror the `src/` directory structure under `tests/`
- Each subsystem has its own test file (e.g., `tests/compiler/compiler.test.ts`)
- Integration tests in `tests/integration/` test end-to-end program execution

## Naming Conventions

- Test files: `<module>.test.ts`
- Describe blocks: name the module or feature under test
- It blocks: describe the expected behavior in plain English
- Example: `it('should handle nested function closures correctly')`

## Writing Tests

### Structure (Arrange-Act-Assert)

```typescript
it('should evaluate arithmetic expressions', () => {
  // Arrange
  const source = 'let x = 2 + 3 * 4';
  
  // Act
  const result = interpret(source);
  
  // Assert
  expect(result).toBe(14);
});
```

### Coverage Expectations

- **Lexer**: Every token type, edge cases (unterminated strings, invalid numbers), error messages
- **Parser**: Every AST node type, operator precedence, error recovery
- **Interpreter**: All operators, scoping rules, closures, classes, stdlib calls
- **Compiler**: Every opcode emission, upvalue tracking, optimizer passes
- **VM**: Stack operations, call frames, closures, execution limits
- **CLI**: Command parsing, output formatting, error handling

### Error Testing

Always test error paths:
```typescript
it('should throw ParseError for invalid syntax', () => {
  expect(() => parse('let = 5')).toThrow(ParseError);
});
```

## Running Tests

```bash
# Run all tests
npx vitest run

# Run specific test file
npx vitest run tests/interpreter/interpreter.test.ts

# Run in watch mode during development
npx vitest

# Run with coverage
npx vitest run --coverage
```

## Minimum Requirements

- All new features must include tests before merging
- Tests must pass in CI (zero failures)
- Aim for >90% line coverage on core modules (lexer, parser, interpreter, compiler, VM)
- Integration tests should cover every example program

## Test Isolation

- Each test should be independent (no shared mutable state)
- Use fresh `TinyLang` instances per test
- Never rely on test execution order
