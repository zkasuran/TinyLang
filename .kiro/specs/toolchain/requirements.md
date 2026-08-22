# Toolchain - Requirements

## Overview

TinyLang provides a comprehensive developer toolchain beyond the core language: a code formatter for consistent style, a linter for catching common mistakes, a test runner for TinyLang programs, and a module system for code organization. These tools work together to create a professional development experience.

## User Stories

### US-1: Code Formatter

As a developer, I want an automatic code formatter so that my TinyLang code follows a consistent style without manual effort.

**Acceptance Criteria:**
- [x] `tinylang format <file.tiny>` reformats the source file in place
- [x] `tinylang format --check <file.tiny>` reports if formatting is needed (exit 1 if unformatted)
- [x] Formatter is idempotent: `format(format(code)) === format(code)`
- [x] Preserves comments and blank lines between logical sections
- [x] Configurable indent size (default: 2 spaces)
- [x] Handles all language constructs (expressions, statements, classes, functions)

### US-2: Code Linter

As a developer, I want a static analysis linter so that I can catch common mistakes and maintain code quality.

**Acceptance Criteria:**
- [x] `tinylang lint <file.tiny>` reports diagnostics (errors, warnings, info)
- [x] Rules include: unused variables, unreachable code, empty blocks, prefer-const, no-shadow
- [x] Each diagnostic shows line, column, rule name, and message
- [x] Severity levels: error, warning, info
- [x] Auto-fix support for simple issues (prefer-const, formatting)
- [x] Exit code 1 if any errors are found

### US-3: Test Runner

As a developer, I want to write and run tests for my TinyLang programs so that I can verify correctness.

**Acceptance Criteria:**
- [x] `test` blocks define test cases inline: `test "description" { ... }`
- [x] Built-in assertion functions: `assert(cond)`, `assertEqual(a, b)`, `assertNotEqual(a, b)`
- [x] `tinylang test <file.tiny>` discovers and runs all test blocks
- [x] Results show pass/fail count, duration, and failure details
- [x] Colored output (green=pass, red=fail)
- [x] Exit code 0 if all pass, 1 if any fail

### US-4: Module System

As a developer, I want to split my code across files and import between them so that I can organize larger programs.

**Acceptance Criteria:**
- [x] `import { name } from "module"` imports specific bindings
- [x] Module resolution: relative paths (./foo), project paths (foo), stdlib (math)
- [x] Modules execute once and are cached (singleton pattern)
- [x] Circular dependency detection with helpful error message
- [x] Standard library modules available by name (math, strings, arrays)

### US-5: Formatter Configuration

As a team lead, I want configurable formatter rules so that our team can agree on style conventions.

**Acceptance Criteria:**
- [x] Default formatting rules produce clean, readable output
- [x] Consistent indentation (2 spaces by default)
- [x] Consistent spacing around operators and after commas
- [x] Brace style: opening brace on same line
- [x] Maximum line length awareness (prefer wrapping at 80 chars)

### US-6: Linter Rule Configuration

As a developer, I want to enable/disable specific linter rules so that I can customize the analysis for my project.

**Acceptance Criteria:**
- [x] All rules enabled by default
- [x] Rules can be disabled programmatically
- [x] Each rule is independently testable
- [x] Custom rules can be added by implementing the LintRule interface
- [x] Rule IDs are kebab-case strings (e.g., "unused-variables")

## Non-Functional Requirements

### NFR-1: Speed
- Formatter processes 1000 lines in under 200ms
- Linter completes analysis of 1000 lines in under 300ms
- Test runner startup time under 100ms

### NFR-2: Correctness
- Formatter never changes program semantics (AST-preserving)
- Linter produces no false positives for idiomatic code
- Test runner provides deterministic results

### NFR-3: Usability
- Clear, actionable diagnostic messages
- Auto-fix suggestions where possible
- Integration with CI/CD workflows (machine-readable output)
