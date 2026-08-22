# Debugger - Requirements

## Overview

TinyLang needs an interactive debugger that allows developers to pause execution, inspect state, step through code, and set breakpoints. The debugger targets beginners, so it must be approachable, with clear state display and simple commands. The architecture uses a replay-based approach since the interpreter is synchronous.

## User Stories

### US-1: Set Breakpoints

As a developer, I want to set breakpoints on specific lines so that execution pauses at those points for inspection.

**Acceptance Criteria:**
- [x] Set breakpoints by line number via `break <line>` command
- [x] Multiple breakpoints can be active simultaneously
- [x] Breakpoints can be listed with `breakpoints` command
- [x] Breakpoints can be removed with `delete <id>` command
- [x] Setting a breakpoint on an invalid line produces a helpful message

### US-2: Conditional Breakpoints

As an advanced user, I want breakpoints that only trigger when a condition is true so that I can catch specific situations.

**Acceptance Criteria:**
- [x] Syntax: `break <line> when <expression>`
- [x] The condition is evaluated in the current scope when the breakpoint is hit
- [x] If the condition is false, execution continues without pausing
- [x] Condition errors are reported without crashing the debug session

### US-3: Step Execution

As a learner, I want to step through code one statement at a time so that I can follow the execution flow.

**Acceptance Criteria:**
- [x] `step` (or `s`) advances one statement
- [x] `next` (or `n`) steps over function calls (stays in current frame)
- [x] `out` steps out of the current function (returns to caller)
- [x] `continue` (or `c`) resumes until the next breakpoint or end
- [x] Current position is displayed after each step with source context

### US-4: Variable Inspection

As a developer, I want to inspect variable values at any paused point so that I can understand program state.

**Acceptance Criteria:**
- [x] `vars` shows all variables in the current scope
- [x] `print <expr>` evaluates an expression in the current scope
- [x] Variables show their type and value in a readable format
- [x] Nested objects and arrays are displayed with indentation
- [x] The full scope chain is accessible (locals, then enclosing scopes)

### US-5: Watch Expressions

As a developer, I want watch expressions that are automatically re-evaluated at every pause so that I can track changing values.

**Acceptance Criteria:**
- [x] `watch <expr>` adds a watch expression
- [x] `unwatch <id>` removes a watch expression
- [x] All watch expressions are displayed at every pause point
- [x] Watch expression errors show "Error" rather than crashing

### US-6: Call Stack Display

As a developer, I want to see the call stack when paused so that I can understand the execution context.

**Acceptance Criteria:**
- [x] `stack` shows the current call stack with function names and line numbers
- [x] The current frame is highlighted
- [x] Stack depth is visible (how many calls deep)
- [x] Source file and line are shown for each frame

### US-7: Debug CLI Interface

As a user, I want a clean, interactive command-line interface for the debugger so that I can easily control execution.

**Acceptance Criteria:**
- [x] Debugger starts with `tinylang debug <file.tiny>`
- [x] Shows source context at pause (current line highlighted)
- [x] `help` command lists all available commands
- [x] Unknown commands produce a helpful "did you mean?" suggestion
- [x] Clean exit with `quit` or `q`

## Non-Functional Requirements

### NFR-1: Responsiveness
- Step commands respond in under 100ms for programs under 500 lines
- Replay-based execution does not cause visible lag for typical programs

### NFR-2: Correctness
- Debugging does not alter program behavior (deterministic replay)
- All side effects (print output) are suppressed during replay

### NFR-3: Educational Value
- Commands use full English words (not GDB-style abbreviations only)
- Help text explains debugging concepts alongside commands
- Source context shows surrounding lines for orientation
