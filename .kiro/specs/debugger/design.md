# Debugger - Design Document

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Debugger Architecture                       │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐   │
│  │ Debug CLI│───>│   Debugger   │───>│   Interpreter     │   │
│  │(Commands)│    │  (Session)   │    │(w/ Debug Hooks)   │   │
│  └──────────┘    └──────────────┘    └───────────────────┘   │
│       ^                │                       │              │
│       │                v                       v              │
│  ┌────┴─────┐   ┌─────────────┐    ┌────────────────────┐   │
│  │  Output  │   │ Breakpoints │    │  DebugPauseSignal  │   │
│  │ (Source  │   │  & Watches  │    │  (Throws to halt)  │   │
│  │ Context) │   └─────────────┘    └────────────────────┘   │
│  └──────────┘                                                 │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## Replay-Based Debugging

### The Problem

TinyLang's tree-walk interpreter is synchronous and recursive. There is no natural suspension point where execution can "pause" and return control to the debugger REPL. Unlike a compiled/bytecode approach where you can simply stop the fetch-decode-execute loop, a recursive AST walker has its state embedded in the JavaScript call stack.

### The Solution: Replay and Pause

The debugger uses a **replay and pause** strategy:

1. The interpreter is modified to call a **debug hook** before each statement
2. The debug hook tracks a **statement counter** (how many statements have been executed)
3. When the debugger wants to "pause" at a point, it throws a `DebugPauseSignal`
4. The signal unwinds the entire interpreter call stack and returns control to the debugger
5. When the user issues a step/continue command, the interpreter **re-executes from the beginning**
6. During replay, the hook counts statements and suppresses side effects until it reaches the target
7. Once past the previously-paused statement, the hook allows the next pause point

```
Timeline:
  Statement: 1  2  3  4  5  6  7  8  9  10
  Pass 1:    X  X  X  PAUSE (breakpoint at statement 3)
  Pass 2:    ~  ~  ~  X  PAUSE (user stepped: pause at statement 4)
  Pass 3:    ~  ~  ~  ~  X  X  X  PAUSE (continue: hit breakpoint at 7)

  X = execute normally
  ~ = replay (skip, suppress output)
  PAUSE = throw DebugPauseSignal
```

### Trade-offs

- **Pro:** No modification to interpreter's recursive structure
- **Pro:** Exact state reproduction (deterministic replay)
- **Pro:** Simple to implement correctly
- **Con:** O(n) re-execution for each step (n = statements from start)
- **Con:** Non-deterministic programs (random()) produce different results on replay
- **Mitigation:** For educational programs (< 1000 lines), replay is fast enough

## Component Design

### 1. Debugger Class (`src/debugger/debugger.ts`)

The main orchestrator that manages the debug session:

```typescript
class Debugger {
  private source: string
  private program: Program
  private breakpoints: Map<number, Breakpoint>
  private watches: WatchExpression[]
  private statementCount: number
  private pauseTarget: number
  private pausedEnvironment: Environment | null
  private callStack: DebugFrame[]
  private suppressOutput: boolean

  // Session control
  start(): void
  continue(): void
  step(): void
  stepOver(): void
  stepOut(): void

  // Inspection
  getVariables(): Map<string, RuntimeValue>
  evaluateExpression(expr: string): RuntimeValue
  getCallStack(): DebugFrame[]

  // Breakpoints
  addBreakpoint(line: number, condition?: string): number
  removeBreakpoint(id: number): void
}
```

### 2. Debug Hook Mechanism

The interpreter calls the debug hook before each statement:

```typescript
// Inside interpreter, at the start of evaluateStatement():
if (this.debugHook) {
  this.debugHook({
    statement: node,
    environment: currentEnv,
    line: node.position.line,
    statementIndex: this.statementCounter++
  })
}
```

The hook's behavior depends on the current debug state:
- **Replaying:** If `statementIndex < pauseTarget`, do nothing (skip)
- **Executing:** If `statementIndex >= pauseTarget`, check pause conditions
- **Pausing:** When a pause condition is met, capture state and throw `DebugPauseSignal`

### 3. Breakpoint Types (`src/debugger/types.ts`)

```typescript
interface Breakpoint {
  id: number
  line: number
  condition?: string   // TinyLang expression to evaluate
  enabled: boolean
  hitCount: number
}

interface WatchExpression {
  id: number
  expression: string
  lastValue?: string
}

interface DebugFrame {
  functionName: string
  line: number
  column: number
  environment: Environment
}
```

### 4. Variable Inspector (`src/debugger/inspector.ts`)

Provides formatted variable display:

```typescript
class Inspector {
  // Format a single value for display
  formatValue(value: RuntimeValue, depth?: number): string

  // Get all variables in scope (current + parent chain)
  getVisibleVariables(env: Environment): VariableInfo[]

  // Evaluate an arbitrary expression in the paused environment
  evaluate(source: string, env: Environment): RuntimeValue
}
```

### 5. Debug Commands (`src/debugger/commands.ts`)

Command parser and dispatcher:

| Command | Aliases | Description |
|---------|---------|-------------|
| `break <line> [when <expr>]` | `b` | Set a breakpoint |
| `delete <id>` | `d` | Remove a breakpoint |
| `breakpoints` | `bl` | List all breakpoints |
| `step` | `s` | Step one statement |
| `next` | `n` | Step over (skip into calls) |
| `out` | `o` | Step out of current function |
| `continue` | `c` | Resume execution |
| `vars` | `v` | Show local variables |
| `print <expr>` | `p` | Evaluate and print expression |
| `watch <expr>` | `w` | Add watch expression |
| `unwatch <id>` | | Remove watch |
| `stack` | `bt` | Show call stack |
| `help` | `h` | Show command help |
| `quit` | `q` | Exit debugger |

## Data Flow

### Starting a Debug Session

```
1. User runs: tinylang debug program.tiny
2. Debugger reads and parses the source file
3. Debugger displays source with line numbers
4. Debugger enters command loop (waiting for user input)
5. User sets breakpoints or types "step" to begin
```

### Step Execution Flow

```
1. User types "step" (or breakpoint is set)
2. Debugger sets pauseTarget = currentStatement + 1
3. Debugger creates fresh Interpreter + Environment
4. Debugger registers debug hook on interpreter
5. Interpreter re-executes program from start
6. Hook suppresses output for statements < pauseTarget
7. When statementIndex == pauseTarget:
   a. Capture current environment and call stack
   b. Throw DebugPauseSignal
8. Debugger catches signal, displays current state
9. Back to command loop
```

### Expression Evaluation at Pause

```
1. User types "print someVariable + 1"
2. Inspector lexes + parses the expression string
3. Inspector evaluates expression in the captured environment
4. Result is formatted and displayed
5. No side effects (new interpreter instance, isolated)
```

## Key Design Decisions

1. **Replay over coroutines** - JavaScript generators/async could provide suspension points, but replay keeps the interpreter pure and unchanged. The performance cost is acceptable for educational programs.

2. **Statement-level granularity** - The debugger pauses between statements, not between expressions. This matches beginner mental models of "one line at a time."

3. **Output suppression during replay** - All `print()` calls are no-ops during replay to avoid duplicate output. Only the "new" execution after the pause target produces output.

4. **Fresh environment on each replay** - The program re-runs from scratch each time. This ensures deterministic state and avoids subtle bugs from partially-mutated environments.

5. **Condition evaluation isolation** - Conditional breakpoint expressions are evaluated in a try-catch. If they throw, the breakpoint is treated as "not hit" rather than crashing the session.
