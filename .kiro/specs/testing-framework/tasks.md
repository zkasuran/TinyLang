# Testing Framework - Tasks

## Phase 1: Language Extension

- [x] Add `TEST` token type to `src/types/tokens.ts`
- [x] Add `TestBlock` AST node to `src/types/ast.ts`
- [x] Update lexer to recognize `test` keyword
- [x] Update parser to parse `test "description" { body }` syntax
- [x] Verify: `npm run build` passes

## Phase 2: Assertions

- [x] Create `src/testing/assertions.ts`
- [x] Implement `expectToBe(actual, expected)` with descriptive error on mismatch
- [x] Implement `expectToBeTrue(value)` and `expectToBeFalse(value)`
- [x] Implement `expectToThrow(fn)` that calls fn and expects an exception
- [x] Register assertion functions as NativeFunctionValue objects

## Phase 3: Runner

- [x] Create `src/testing/runner.ts`
- [x] Implement test block discovery (walk AST for TestBlock nodes)
- [x] Implement isolated execution (fresh environment per test)
- [x] Implement result collection (pass/fail + error message + duration)
- [x] Export `runTests(source: string)` API function

## Phase 4: Reporter

- [x] Create `src/testing/reporter.ts`
- [x] Implement per-test output: checkmark/cross + description + time
- [x] Implement summary output: totals + overall status
- [x] Add color support (green pass, red fail)

## Phase 5: CLI Integration

- [x] Add `test` command to CLI
- [x] Accept file path argument
- [x] Run all test blocks and report results
- [x] Exit with code 1 if any test fails

## Phase 6: Testing the Testing Framework

- [x] Write vitest tests for the runner in `tests/testing/testing.test.ts`
- [x] Test: basic passing test block
- [x] Test: failing assertion
- [x] Test: test isolation (mutation in one test does not affect another)
- [x] Test: expectToThrow
- [x] Verify: all existing tests still pass
