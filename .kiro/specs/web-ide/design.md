# Web IDE (Playground) - Design Document

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Web IDE Layout                                  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─── Header ──────────────────────────────────────────────────────┐ │
│  │  Logo │ Examples Dropdown │ Run │ Debug │ Share │ Theme Toggle   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌─────────┬───────────────────────────────────┬──────────────────┐  │
│  │  File   │         Code Editor               │   Right Panel    │  │
│  │Explorer │     (CodeMirror 6)                │                  │  │
│  │         │                                   │  AST Viewer      │  │
│  │ file1   │   1 │ let x = 42                  │  Bytecode View   │  │
│  │ file2   │   2 │ print(x * 2)                │  Variables       │  │
│  │ file3   │   3 │                             │  Call Stack      │  │
│  │         │                                   │                  │  │
│  ├─────────┼───────────────────────────────────┤                  │  │
│  │         │         Output Console            │                  │  │
│  │         │  > 84                             │                  │  │
│  │         │  [Completed in 2ms]               │                  │  │
│  └─────────┴───────────────────────────────────┴──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Build Architecture

The Web IDE is built as a single `index.html` file for zero-config deployment:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ template.html   │     │   build.js      │     │   index.html    │
│ (UI structure,  │────>│  (esbuild +     │────>│  (standalone,   │
│  panel layout)  │     │   inlining)     │     │   deployable)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              ^
                              │
                    ┌─────────┴─────────┐
                    │   src/**/*.ts      │
                    │ (bundled as IIFE   │
                    │  via esbuild)      │
                    └───────────────────┘
```

**Build Process (`playground/build.js`):**
1. Use esbuild to bundle `src/index.ts` into an IIFE (browser-compatible)
2. Read `playground/template.html`
3. Inject the bundled TinyLang runtime as an inline `<script>` tag
4. Write the result to `playground/index.html`

This approach produces a single file that works anywhere - local file:// URIs, GitHub Pages, or any static host.

## Component Design

### 1. Panel System

The IDE uses a CSS Grid layout with resizable panels:

```
grid-template-areas:
  "header  header   header"
  "files   editor   sidebar"
  "files   console  sidebar"

grid-template-columns: 200px 1fr 300px
grid-template-rows: 48px 1fr 200px
```

Panels are toggled via header buttons. State persists in localStorage.

### 2. Code Editor (CodeMirror 6)

Loaded from CDN (`esm.sh` or `unpkg`):
- `@codemirror/view` - Editor view and DOM
- `@codemirror/state` - Editor state management
- `@codemirror/language` - Syntax highlighting infrastructure
- `@codemirror/commands` - Default keybindings

**Custom TinyLang language support:**
- Keyword highlighting: `let`, `const`, `fn`, `class`, `if`, `else`, `while`, `for`, `in`, `return`, `match`, `when`, `import`, `from`, `new`, `extends`, `and`, `or`, `not`
- String highlighting (double and single quotes)
- Number highlighting (integers and floats)
- Comment highlighting (single-line `//` and multi-line `/* */`)
- Bracket matching and auto-close

### 3. Virtual Filesystem

File management backed by localStorage:

```typescript
interface VirtualFS {
  files: Map<string, string>   // filename -> content
  activeFile: string           // currently open file

  createFile(name: string): void
  deleteFile(name: string): void
  renameFile(oldName: string, newName: string): void
  readFile(name: string): string
  writeFile(name: string, content: string): void
  listFiles(): string[]
  persist(): void              // Save to localStorage
  restore(): void             // Load from localStorage
}
```

Default workspace includes all example programs from `examples/`.

### 4. Execution Engine

The TinyLang runtime is bundled inline:

```typescript
// Exposed by the IIFE bundle as window.TinyLang
interface TinyLangAPI {
  Lexer: typeof Lexer
  Parser: typeof Parser
  Interpreter: typeof Interpreter
  Compiler: typeof Compiler
  VM: typeof VM
  Debugger: typeof Debugger
  Formatter: typeof Formatter
  Linter: typeof Linter
  disassemble: typeof disassemble
}
```

**Execution flow:**
1. User clicks "Run" or presses Ctrl+Enter
2. Capture editor content
3. Create Lexer, tokenize
4. Create Parser, parse to AST
5. Create Interpreter with output callback
6. Execute program, collect output
7. Display output in console panel
8. Display errors with source highlighting

### 5. Debugger Integration

Visual debugging through the editor:

- **Breakpoint gutter:** Click line numbers to toggle breakpoints (red dots)
- **Step controls:** Step, Next, Out, Continue buttons in toolbar
- **Variable panel:** Shows current scope variables updated on each pause
- **Call stack panel:** Shows function call chain
- **Source highlighting:** Current line highlighted in yellow during pause

The browser debugger uses the same `Debugger` class from `src/debugger/`, adapted for async interaction (using promises instead of readline).

### 6. AST Viewer

Renders the parsed AST as a collapsible tree:

```
Program
  ├─ VariableDeclaration (let)
  │    ├─ name: "x"
  │    └─ initializer: NumberLiteral
  │         └─ value: 42
  └─ PrintStatement
       └─ expression: BinaryExpression (*)
            ├─ left: Identifier "x"
            └─ right: NumberLiteral 2
```

Implementation: Recursive DOM construction with expand/collapse buttons. Each node shows its AST type, and leaf nodes show their literal values.

### 7. Bytecode Viewer

Shows the disassembled bytecode:

```
== <script> ==
0000    1 CONST          0 '42'
0003    | STORE_LOCAL    0
0005    2 LOAD_LOCAL     0
0007    | CONST          1 '2'
0010    | MUL
0011    | PRINT
0012    | HALT
```

Uses the `disassemble()` function from `src/compiler/disassembler.ts`.

### 8. Theme System

Two themes with CSS custom properties:

```css
:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #1a1a1a;
  --accent: #0066cc;
  --error: #cc0000;
  --success: #008800;
}

:root[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --text-primary: #d4d4d4;
  --accent: #569cd6;
  --error: #f44747;
  --success: #4ec9b0;
}
```

Theme toggle switches `data-theme` attribute on the root element and persists to localStorage.

### 9. Code Sharing

URL-based sharing using the hash fragment:

```
https://tinylang.dev/playground#code=<base64(compress(source))>
```

**Encoding pipeline:**
1. Get editor content (UTF-8 string)
2. Compress with `btoa()` (base64 encoding)
3. Set as URL hash fragment
4. Copy URL to clipboard

**Decoding pipeline:**
1. Read URL hash on page load
2. Extract `code=` parameter
3. Decode with `atob()` (base64 decoding)
4. Load into editor

## Data Flow

### Program Execution

```
User clicks "Run"
  -> Get editor content
  -> Lexer.tokenize() -> tokens
  -> Parser.parse() -> AST
  -> Interpreter.execute(AST, {output: consoleAppend})
  -> Output displayed in console panel
  -> Errors highlighted in editor gutter
```

### AST Update (debounced)

```
Editor content changes (keystroke)
  -> Debounce 300ms
  -> Lexer.tokenize() -> tokens
  -> Parser.parse() -> AST
  -> Render AST tree in panel
  -> (If errors) Show inline error markers
```

### Debug Session

```
User clicks gutter (set breakpoint)
  -> Store breakpoint line
  -> Show red dot in gutter

User clicks "Debug"
  -> Create Debugger(source)
  -> Set breakpoints from gutter markers
  -> debugger.run()
  -> On pause: update variable panel, highlight line
  -> Wait for user action (step/continue/stop)
```

## Key Design Decisions

1. **Single-file output** - The playground builds to a single `index.html` with all JS/CSS inlined. This enables easy deployment (drag-and-drop to any host) and works with `file://` URLs.

2. **CDN for CodeMirror** - CodeMirror is loaded from esm.sh CDN rather than bundled. This keeps the TinyLang bundle small and leverages browser caching across visits.

3. **localStorage for persistence** - No backend server means files live in the browser. localStorage is simple, synchronous, and sufficient for the educational use case.

4. **esbuild for bundling** - esbuild is extremely fast (sub-100ms builds) and produces clean IIFE bundles without runtime overhead. Perfect for the build script.

5. **No framework** - The playground uses vanilla JS/HTML/CSS. This avoids framework dependencies, keeps the bundle small, and demonstrates that complex UIs are possible without React/Vue/etc.

6. **Inline TinyLang runtime** - The entire TinyLang engine is bundled and inlined into the HTML. This ensures the playground is self-contained and works offline after first load.
