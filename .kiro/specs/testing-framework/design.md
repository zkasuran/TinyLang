# Testing Framework - Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Test Command                        │
│  (src/cli/index.ts - "test" handler)                │
└────────────────────┬────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────┐
│                  Test Runner                          │
│  (src/testing/runner.ts)                             │
│  - Parses source file                               │
│  - Extracts TestBlock nodes                         │
│  - Executes each in isolated environment            │
│  - Collects results                                 │
└────────────────────┬────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          v          v          v
┌──────────────┐ ┌─────────┐ ┌──────────────┐
│  Assertions  │ │ Environ │ │   Reporter   │
│ (assertions) │ │ (scope) │ │  (reporter)  │
│  expectToBe  │ │ Fresh   │ │  Colors      │
│  toBeTrue    │ │ per test│ │  Summary     │
│  toBeFalse   │ │         │ │  Pass/Fail   │
│  toThrow     │ │         │ │              │
└──────────────┘ └─────────┘ └──────────────┘
```

## Components

### TestBlock AST Node
```typescript
interface TestBlock {
  kind: 'TestBlock';
  description: StringLiteral;
  body: Statement[];
  position: SourcePosition;
}
```

### Test Runner (src/testing/runner.ts)
- Input: Parsed AST (Program node)
- Walks top-level statements looking for TestBlock nodes
- For each TestBlock:
  - Creates a fresh Environment with stdlib + assertions registered
  - Executes the body statements via the Interpreter
  - Catches any thrown errors (assertion failures)
  - Records pass/fail with timing

### Assertions (src/testing/assertions.ts)
Registered as native functions in the test environment:
- `expectToBe(actual, expected)` - strict equality check
- `expectToBeTrue(value)` - truthy check
- `expectToBeFalse(value)` - falsy check
- `expectToThrow(fn)` - verifies the function throws

### Reporter (src/testing/reporter.ts)
- Formats individual test results with colored symbols
- Computes totals (passed, failed, total, duration)
- Outputs summary line

## Design Decisions

1. **Inline vs separate files**: Tests live in the same file as code. The `test` keyword is only processed by the test runner, not by `run`.
2. **Isolation**: Each test gets a brand-new Environment. No cross-contamination.
3. **No setup/teardown**: Keep it simple. Each test is self-contained.
4. **Synchronous execution**: Tests run sequentially, one at a time.
