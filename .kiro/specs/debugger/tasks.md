# Debugger - Implementation Tasks

## Phase 1: Core Debug Infrastructure

### Task 1.1: Debug Types and Signals ✅
- [x] Define `DebugPauseSignal` class extending Error
- [x] Define `Breakpoint` interface (id, line, condition, enabled, hitCount)
- [x] Define `WatchExpression` interface (id, expression, lastValue)
- [x] Define `DebugFrame` interface (functionName, line, column, environment)
- [x] Define `DebugHookContext` interface (statement, environment, line, statementIndex)
- [x] Define `DebugState` enum (IDLE, RUNNING, PAUSED, FINISHED)
- [x] Export all types from `src/debugger/types.ts`

### Task 1.2: Debug Hook Integration ✅
- [x] Add optional `debugHook` property to Interpreter class
- [x] Call debug hook before each statement in `evaluateStatement()`
- [x] Pass current environment, statement node, and statement counter
- [x] Track statement counter (incremented on each statement entry)
- [x] Handle `DebugPauseSignal` throw (unwinds interpreter cleanly)
- [x] Add `suppressOutput` flag to interpreter for replay mode

### Task 1.3: Debugger Session Management ✅
- [x] Implement `Debugger` class with source, program, and state
- [x] Parse source on initialization (lex and parse)
- [x] Implement `run()` method (start execution, pause at first breakpoint or step)
- [x] Implement replay logic (re-execute, skip past previous statements)
- [x] Track `pauseTarget` for step calculations
- [x] Capture environment and call stack on pause

## Phase 2: Breakpoints and Stepping

### Task 2.1: Breakpoint Management ✅
- [x] Implement `addBreakpoint(line, condition?)` with auto-incrementing ID
- [x] Implement `removeBreakpoint(id)` with validation
- [x] Implement `listBreakpoints()` returning sorted list
- [x] Validate line numbers against source line count
- [x] Store breakpoints in a Map keyed by ID

### Task 2.2: Step Commands ✅
- [x] Implement `step()` - advance exactly one statement
- [x] Implement `stepOver()` - advance to next statement at same or lower call depth
- [x] Implement `stepOut()` - advance until current function returns
- [x] Implement `continue()` - run until next breakpoint or program end
- [x] Track call depth for step-over and step-out calculations
- [x] Handle program completion (transition to FINISHED state)

### Task 2.3: Conditional Breakpoints ✅
- [x] Parse condition expression from breakpoint command
- [x] Evaluate condition in the current paused environment
- [x] Only trigger pause if condition evaluates to truthy
- [x] Handle evaluation errors gracefully (skip breakpoint, warn user)
- [x] Increment `hitCount` only when breakpoint actually fires

## Phase 3: Inspection and Watches

### Task 3.1: Variable Inspector ✅
- [x] Implement `Inspector` class in `src/debugger/inspector.ts`
- [x] Implement `getVisibleVariables(env)` walking the scope chain
- [x] Implement `formatValue(value, depth)` with indentation for nested structures
- [x] Handle all RuntimeValue types (number, string, boolean, null, array, object, function, class, instance)
- [x] Truncate long arrays/objects with "... and N more" for readability
- [x] Show variable types alongside values

### Task 3.2: Expression Evaluation ✅
- [x] Implement `evaluateExpression(source, env)` in Inspector
- [x] Create temporary Interpreter for expression evaluation
- [x] Evaluate in the paused environment (access local variables)
- [x] Return formatted result or error message
- [x] Ensure no side effects leak into the debugged program

### Task 3.3: Watch Expressions ✅
- [x] Implement `addWatch(expression)` with auto-incrementing ID
- [x] Implement `removeWatch(id)` with validation
- [x] Evaluate all watches at every pause point
- [x] Display watch results in a formatted table
- [x] Show "Error: ..." for watches that fail to evaluate

## Phase 4: Call Stack and Source Display

### Task 4.1: Call Stack Tracking ✅
- [x] Track function entry/exit in the debug hook
- [x] Build `DebugFrame` array representing the current call stack
- [x] Include function name, source line, and local environment
- [x] Handle anonymous functions (display as "<anonymous>")
- [x] Handle top-level code (display as "<script>")

### Task 4.2: Source Context Display ✅
- [x] Split source into lines on initialization
- [x] Show 3 lines before and after the current pause point
- [x] Highlight the current line with an arrow marker (`=>`)
- [x] Show line numbers in the gutter
- [x] Highlight breakpoint lines with a dot marker

## Phase 5: CLI Integration

### Task 5.1: Debug Command Parser ✅
- [x] Implement command parsing in `src/debugger/commands.ts`
- [x] Support full commands and single-letter aliases
- [x] Parse breakpoint arguments (line number and optional condition)
- [x] Parse expression arguments for print/watch
- [x] Handle unknown commands with "did you mean?" suggestions

### Task 5.2: Debug CLI Loop ✅
- [x] Add `debug` subcommand to the main CLI
- [x] Read file and create Debugger instance
- [x] Enter readline-based command loop
- [x] Display state after each command (source context + watches)
- [x] Handle graceful exit (quit command, Ctrl+C)
- [x] Show welcome message with quick-start hints

### Task 5.3: Output Formatting ✅
- [x] Colorize debugger output (commands in cyan, values in green, errors in red)
- [x] Format call stack with indentation showing depth
- [x] Format variable tables with aligned columns
- [x] Show breakpoint markers in source display
- [x] Display watch expression results inline
