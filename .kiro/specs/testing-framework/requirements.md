# Testing Framework - Requirements

## User Stories

### US-1: Inline Test Blocks
As a TinyLang developer, I want to write tests inline in my source files using `test "name" { ... }` syntax so that tests live alongside the code they verify.

**Acceptance Criteria:**
- `test` keyword is recognized by the lexer
- Parser produces `TestBlock` AST nodes
- Test blocks are not executed during normal `run` - only via `tinylang test`
- Each test block executes in isolation (no shared mutable state)

### US-2: Assertion Functions
As a TinyLang developer, I want assertion functions (`expectToBe`, `expectToBeTrue`, `expectToBeFalse`, `expectToThrow`) available inside test blocks.

**Acceptance Criteria:**
- Assertion functions are auto-registered in the test execution environment
- Failed assertions throw descriptive errors with expected vs actual values
- Passing assertions produce no output

### US-3: Test Discovery
As a TinyLang developer, I want the test command to discover and run all test blocks in a file.

**Acceptance Criteria:**
- `tinylang test file.tiny` finds all `test` blocks in the file
- Reports pass/fail for each test with its description
- Prints a summary: X passed, Y failed, Z total
- Exit code is non-zero if any test fails

### US-4: Test Isolation
As a TinyLang developer, I want each test block to run in its own scope so that tests cannot affect each other.

**Acceptance Criteria:**
- Variables defined in one test are not visible in others
- Functions defined in one test do not leak to others
- A failing test does not prevent subsequent tests from running

### US-5: Colored Output
As a TinyLang developer, I want test results displayed with colors (green for pass, red for fail) for quick visual scanning.

**Acceptance Criteria:**
- Passing tests show a green checkmark and description
- Failing tests show a red X, description, and error message
- Summary line is colored based on overall result
