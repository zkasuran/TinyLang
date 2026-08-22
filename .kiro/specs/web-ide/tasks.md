# Web IDE (Playground) - Implementation Tasks

## Phase 1: Build Infrastructure

### Task 1.1: Build Script ✅
- [x] Create `playground/build.js` using esbuild API
- [x] Bundle `src/index.ts` as IIFE format (browser-compatible)
- [x] Read `playground/template.html` as base
- [x] Inject bundled script into template at `<!-- BUNDLE -->` marker
- [x] Write output to `playground/index.html`
- [x] Add `playground` script to package.json
- [x] Verify build produces valid HTML

### Task 1.2: Template HTML Structure ✅
- [x] Create `playground/template.html` with semantic HTML5 layout
- [x] Define CSS Grid layout for panels (header, files, editor, console, sidebar)
- [x] Add CDN script tags for CodeMirror 6 modules
- [x] Define `<!-- BUNDLE -->` injection point for TinyLang runtime
- [x] Add responsive meta viewport tag
- [x] Add favicon and page title

## Phase 2: Core Editor

### Task 2.1: CodeMirror Integration ✅
- [x] Load CodeMirror 6 from CDN (esm.sh)
- [x] Initialize EditorView with basic setup
- [x] Create custom TinyLang language mode (keyword/string/comment highlighting)
- [x] Enable line numbers, bracket matching, auto-indent
- [x] Add keybinding for Ctrl+Enter (run program)
- [x] Configure editor for the dark/light theme toggle

### Task 2.2: Editor Features ✅
- [x] Breakpoint gutter (click to toggle red dots)
- [x] Error markers (red underline on error lines)
- [x] Current-line highlighting during debug
- [x] Auto-save editor content to localStorage on change (debounced)
- [x] Restore editor content from localStorage on load

## Phase 3: Execution and Output

### Task 3.1: Run Program ✅
- [x] Implement `runProgram()` function using bundled TinyLang
- [x] Capture output via custom print callback
- [x] Display output in console panel with timestamps
- [x] Display errors with formatted messages and hints
- [x] Show execution time after completion
- [x] Handle infinite loops with execution timeout (5 second limit)

### Task 3.2: Console Panel ✅
- [x] Create scrollable output area
- [x] Color-code output types (normal=white, error=red, info=gray)
- [x] "Clear" button to reset console
- [x] Auto-scroll to bottom on new output
- [x] Copy-to-clipboard button for output text

## Phase 4: File Explorer

### Task 4.1: Virtual Filesystem ✅
- [x] Implement VirtualFS class with Map-based storage
- [x] Serialize/deserialize to localStorage
- [x] Load default example programs on first visit
- [x] Provide file CRUD operations (create, read, update, delete)
- [x] Track active file for editor binding

### Task 4.2: File Tree UI ✅
- [x] Render file list as a tree in the left panel
- [x] Click file to open in editor
- [x] Right-click context menu (rename, delete)
- [x] "New File" button with name input
- [x] Highlight currently active file
- [x] Save indicator (unsaved changes marker)

## Phase 5: Advanced Panels

### Task 5.1: AST Viewer ✅
- [x] Parse editor content on change (debounced 300ms)
- [x] Render AST as collapsible tree (recursive DOM construction)
- [x] Color-code node types (statements=blue, expressions=green, literals=orange)
- [x] Show node details on hover/click (position, type, value)
- [x] Click-to-highlight: clicking AST node highlights source range
- [x] Handle parse errors gracefully (show partial AST + error)

### Task 5.2: Bytecode Viewer ✅
- [x] Compile editor content on change (debounced 300ms)
- [x] Show disassembled bytecode using `disassemble()` function
- [x] Format with monospace font and color-coded opcodes
- [x] Group instructions by source line
- [x] Handle compilation errors gracefully

### Task 5.3: Debugger Panel ✅
- [x] Integrate Debugger class for browser-based debugging
- [x] Step/Next/Out/Continue buttons in toolbar
- [x] Variables panel showing current scope (updated on pause)
- [x] Call stack panel showing function chain
- [x] Highlight current line in editor during pause
- [x] Show/hide debugger panel based on debug session state

## Phase 6: User Experience

### Task 6.1: Theme Support ✅
- [x] Define CSS custom properties for light and dark themes
- [x] Implement theme toggle button in header
- [x] Apply theme to CodeMirror via extensions
- [x] Persist theme choice in localStorage
- [x] Respect system preference on first visit (prefers-color-scheme)

### Task 6.2: Example Programs ✅
- [x] Create dropdown menu with categorized examples
- [x] Categories: Basics, Data Structures, Functions, Classes, Algorithms
- [x] Loading example replaces editor content (with confirmation if unsaved)
- [x] Include examples from the project's `examples/` directory
- [x] Each example includes explanatory comments

### Task 6.3: Code Sharing ✅
- [x] Implement "Share" button that generates URL
- [x] Encode editor content as base64 in URL hash
- [x] On page load, check for hash and decode into editor
- [x] Copy share URL to clipboard with visual feedback
- [x] Handle malformed share URLs gracefully

### Task 6.4: Responsive Design ✅
- [x] Sidebar collapses on screens under 768px
- [x] Panels stack vertically on narrow screens
- [x] Touch-friendly button sizes (min 44px tap target)
- [x] Editor remains usable on tablet-sized screens
- [x] Hide non-essential panels on mobile (show editor + console only)

## Phase 7: Polish

### Task 7.1: Keyboard Shortcuts ✅
- [x] Ctrl+Enter / Cmd+Enter: Run program
- [x] Ctrl+S / Cmd+S: Save current file (prevent browser save dialog)
- [x] Ctrl+D: Start/stop debug session
- [x] F5: Continue (during debug)
- [x] F10: Step over (during debug)
- [x] F11: Step into (during debug)
- [x] Show keyboard shortcuts in help modal

### Task 7.2: Loading and Error States ✅
- [x] Show loading spinner while CDN resources load
- [x] Graceful fallback if CDN is unavailable (basic textarea editor)
- [x] Error boundary around execution (catch all unhandled errors)
- [x] "Report a Bug" link for unexpected errors
- [x] Friendly empty states for panels with no content
