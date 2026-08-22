# Toolchain - Design Document

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    TinyLang Toolchain                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐   │
│  │ Formatter │  │  Linter  │  │Test Runner│  │Module Loader │   │
│  │(AST-based)│  │(Rule-set)│  │(Discovery)│  │(Resolution)  │   │
│  └─────┬─────┘  └─────┬────┘  └─────┬─────┘  └──────┬───────┘   │
│        │               │             │                │           │
│        v               v             v                v           │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Shared Pipeline                           │  │
│  │            Lexer -> Parser -> AST -> [Tool]                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Formatter (`src/formatter/formatter.ts`)

The formatter uses an AST-based approach: parse the source into an AST, then pretty-print it back following style rules. This guarantees idempotency and correctness.

**Algorithm:**
1. Lex source into tokens
2. Parse tokens into AST
3. Walk AST, emitting formatted source string
4. Return formatted string (or write to file)

**Formatting Rules:**
```
Indentation:      2 spaces per nesting level
Brace style:      Opening brace on same line (K&R style)
Operator spacing: Spaces around binary operators (x + y)
Comma spacing:    Space after commas (a, b, c)
Block spacing:    Blank line between top-level declarations
Comment handling: Preserve comments at their relative position
Line length:      Prefer wrapping at 80 characters
```

**AST Visitor Pattern:**
```typescript
class Formatter {
  private indent: number = 0
  private output: string = ''

  format(source: string): string {
    const ast = parse(lex(source))
    return this.formatProgram(ast)
  }

  private formatStatement(stmt: Statement): string {
    switch (stmt.type) {
      case 'VariableDeclaration': return this.formatVarDecl(stmt)
      case 'FunctionDeclaration': return this.formatFnDecl(stmt)
      case 'ClassDeclaration': return this.formatClassDecl(stmt)
      // ... all statement types
    }
  }

  private formatExpression(expr: Expression): string {
    switch (expr.type) {
      case 'BinaryExpression': return this.formatBinary(expr)
      case 'CallExpression': return this.formatCall(expr)
      // ... all expression types
    }
  }
}
```

**Key Design Choices:**
- AST-based (not token-based): guarantees correctness, handles all edge cases
- Comment preservation: comments are attached to AST nodes during parsing
- Idempotent: formatting already-formatted code produces identical output

### 2. Linter (`src/linter/linter.ts`)

The linter runs a set of rule functions against the parsed AST, collecting diagnostics.

**Architecture:**
```typescript
class Linter {
  private rules: LintRule[]

  lint(source: string): Diagnostic[] {
    const ast = parse(lex(source))
    return this.rules.flatMap(rule => rule(ast, source))
  }
}

type LintRule = (program: Program, source: string) => Diagnostic[]

interface Diagnostic {
  rule: string           // Rule identifier (e.g., "unused-variables")
  severity: 'error' | 'warning' | 'info'
  message: string        // Human-readable description
  line: number
  column: number
  fix?: AutoFix          // Optional auto-fix
}
```

**Built-in Rules:**

| Rule | Severity | Description |
|------|----------|-------------|
| `unused-variables` | warning | Variables declared but never read |
| `unreachable-code` | warning | Statements after return/break |
| `no-empty-blocks` | info | Empty block bodies (if, while, fn) |
| `prefer-const` | info | Variables declared with `let` but never reassigned |
| `no-shadow` | warning | Variable shadows outer scope variable |

**Rule Implementation Pattern:**
```typescript
// src/linter/rules/unused-variables.ts
export function unusedVariablesRule(program: Program, source: string): Diagnostic[] {
  const declared = new Map<string, {line: number, column: number}>()
  const used = new Set<string>()

  // Walk AST: collect declarations and usages
  walkAST(program, {
    VariableDeclaration: (node) => declared.set(node.name, node.position),
    Identifier: (node) => used.add(node.name)
  })

  // Report declared-but-unused
  return [...declared.entries()]
    .filter(([name]) => !used.has(name))
    .map(([name, pos]) => ({
      rule: 'unused-variables',
      severity: 'warning',
      message: `Variable '${name}' is declared but never used`,
      line: pos.line,
      column: pos.column
    }))
}
```

### 3. Test Runner (`src/testing/runner.ts`)

TinyLang supports inline test blocks that the test runner discovers and executes:

```tiny
fn add(a, b) {
  return a + b
}

test "addition works" {
  assertEqual(add(2, 3), 5)
  assertEqual(add(-1, 1), 0)
}

test "handles negative numbers" {
  assert(add(-5, -3) == -8)
}
```

**Architecture:**
```typescript
class TestRunner {
  runTests(source: string): TestResult[] {
    const ast = parse(lex(source))
    const testDecls = ast.body.filter(s => s.type === 'TestDeclaration')

    return testDecls.map(test => {
      const startTime = Date.now()
      try {
        // Execute test in isolated environment with assertion functions
        const env = createTestEnvironment()
        interpreter.execute(test.body, env)
        return { description: test.description, passed: true, duration: Date.now() - startTime }
      } catch (err) {
        return { description: test.description, passed: false, error: err.message, duration: Date.now() - startTime }
      }
    })
  }
}
```

**Assertion Functions:**
- `assert(condition)` - Fails if condition is falsy
- `assertEqual(actual, expected)` - Fails if values are not equal
- `assertNotEqual(actual, expected)` - Fails if values are equal
- `assertThrows(fn)` - Fails if the function does not throw

**Test Discovery:**
- Test blocks are AST nodes of type `TestDeclaration`
- Parser recognizes `test "description" { body }` syntax
- Tests execute in order of appearance
- Each test gets a fresh environment (isolation)

### 4. Module System (`src/modules/`)

The module system enables code splitting across files:

```tiny
// math-utils.tiny
fn square(x) {
  return x * x
}

fn cube(x) {
  return x * x * x
}

// main.tiny
import { square, cube } from "./math-utils"
print(square(5))  // 25
```

**Module Resolution (`src/modules/resolver.ts`):**

```
Resolution order:
1. Standard library: import { sqrt } from "math"
   -> Built-in math module (no file lookup)

2. Relative path: import { foo } from "./utils"
   -> Resolve relative to current file
   -> Try: ./utils.tiny, ./utils/index.tiny

3. Project path: import { bar } from "lib/helpers"
   -> Resolve from project root
   -> Try: lib/helpers.tiny, lib/helpers/index.tiny
```

**Module Execution:**
```typescript
class ModuleLoader {
  private cache: Map<string, Environment> = new Map()
  private loading: Set<string> = new Set()

  load(path: string): Environment {
    // Check cache (modules execute once)
    if (this.cache.has(path)) return this.cache.get(path)

    // Circular dependency check
    if (this.loading.has(path)) {
      throw new Error(`Circular dependency detected: ${path}`)
    }

    this.loading.add(path)
    const env = executeModule(readFile(path))
    this.loading.delete(path)
    this.cache.set(path, env)
    return env
  }
}
```

## Data Flow

### Formatter

```
Source string
  -> Lexer.tokenize() -> tokens
  -> Parser.parse() -> AST
  -> Formatter.formatProgram(AST) -> formatted string
  -> Write to file (or stdout)
```

### Linter

```
Source string
  -> Lexer.tokenize() -> tokens
  -> Parser.parse() -> AST
  -> Rules[].map(rule => rule(AST, source)) -> diagnostics[]
  -> Sort by line number
  -> Display formatted output (or JSON for CI)
```

### Test Runner

```
Source string
  -> Lexer.tokenize() -> tokens
  -> Parser.parse() -> AST
  -> Filter TestDeclaration nodes
  -> For each test:
       Create isolated environment
       Register assertion functions
       Execute test body
       Catch AssertionError -> fail
       No error -> pass
  -> Collect TestResult[]
  -> Display results table
```

### Module Import

```
import { name } from "path"
  -> ModuleResolver.resolve("path", currentFile) -> absolutePath
  -> ModuleLoader.load(absolutePath) -> moduleEnv
  -> Extract named export from moduleEnv
  -> Bind to local scope in importing file
```

## Key Design Decisions

1. **AST-based formatting over regex** - Regex-based formatters are fragile and cannot handle nested structures correctly. By parsing to AST and pretty-printing, the formatter is provably correct.

2. **Rule functions over visitor classes** - Each lint rule is a standalone function that receives the full AST. This is simpler than the visitor pattern for the number of rules we have, and each rule is independently testable.

3. **Inline test blocks** - Instead of a separate test file format, tests are `test "..." { }` blocks within the same file. This makes testing approachable for beginners and keeps tests close to the code.

4. **Single-execution module caching** - Modules execute exactly once and the result is cached. This matches Node.js behavior and prevents surprising side effects from re-execution.

5. **Circular dependency detection** - Rather than attempting partial module resolution, circular dependencies are reported as errors with the dependency chain shown. This keeps the implementation simple and encourages better code organization.

6. **Auto-fix as data** - Lint auto-fixes are described as data (range + replacement text) rather than executed immediately. This allows tools to preview fixes, apply selectively, or batch apply.
