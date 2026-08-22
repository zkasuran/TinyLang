# Web IDE (Playground) - Requirements

## Overview

TinyLang needs a browser-based integrated development environment that allows anyone to try the language without installing anything. The Web IDE includes a full-featured code editor, output console, debugger panel, AST viewer, file explorer, and sharing functionality. It runs entirely client-side with no backend server.

## User Stories

### US-1: Code Editor

As a developer, I want a professional code editor with syntax highlighting so that I can write TinyLang code comfortably in the browser.

**Acceptance Criteria:**
- [x] CodeMirror 6 editor with custom TinyLang syntax highlighting
- [x] Line numbers displayed in the gutter
- [x] Auto-indentation on Enter key
- [x] Bracket matching and auto-closing
- [x] Multiple themes (light and dark)
- [x] Keyboard shortcuts (Ctrl+Enter to run, Ctrl+S to save)

### US-2: Program Execution

As a user, I want to run TinyLang programs and see output immediately so that I can experiment with the language.

**Acceptance Criteria:**
- [x] "Run" button executes the current editor content
- [x] Output appears in a console panel below the editor
- [x] Errors display with line numbers, messages, and hints
- [x] Execution time is displayed after completion
- [x] Long-running programs can be stopped with a "Stop" button

### US-3: File Explorer

As a developer, I want to manage multiple files so that I can work on multi-file projects.

**Acceptance Criteria:**
- [x] File tree panel on the left side
- [x] Create, rename, and delete files
- [x] Files persist in localStorage between sessions
- [x] Default workspace includes example programs
- [x] Click to open files in the editor

### US-4: Debugger Panel

As a learner, I want to debug programs visually so that I can understand execution flow without CLI commands.

**Acceptance Criteria:**
- [x] Set breakpoints by clicking the editor gutter
- [x] Step/Continue/Stop buttons in the debugger toolbar
- [x] Variables panel shows current scope variables
- [x] Call stack panel shows the current execution stack
- [x] Current line is highlighted during debugging

### US-5: AST Viewer

As a learner, I want to visualize the Abstract Syntax Tree so that I can understand how the parser works.

**Acceptance Criteria:**
- [x] Collapsible tree view of the parsed AST
- [x] AST updates on every keystroke (debounced)
- [x] Clicking a node highlights the corresponding source range
- [x] Node types are color-coded by category
- [x] Shows token information for leaf nodes

### US-6: Bytecode Viewer

As a learner, I want to see the compiled bytecode so that I can understand the compilation process.

**Acceptance Criteria:**
- [x] Disassembly view of the compiled bytecode
- [x] Shows opcode names, operands, and constant values
- [x] Updates when source changes (debounced)
- [x] Instructions are grouped by source line

### US-7: Theme Support

As a user, I want light and dark themes so that I can use the IDE in different lighting conditions.

**Acceptance Criteria:**
- [x] Light theme (default for daylight)
- [x] Dark theme (low-contrast for night coding)
- [x] Theme toggle button in the header
- [x] Theme preference saved in localStorage
- [x] Consistent colors across editor, panels, and UI

### US-8: Code Sharing

As a user, I want to share my code with others via URL so that I can demonstrate concepts or ask for help.

**Acceptance Criteria:**
- [x] "Share" button generates a URL with code encoded in the hash
- [x] Opening a shared URL loads the code into the editor
- [x] Long programs are compressed before encoding
- [x] Share URL includes the currently selected example name if applicable

### US-9: Example Programs

As a beginner, I want pre-loaded example programs so that I can learn by reading and modifying working code.

**Acceptance Criteria:**
- [x] Dropdown menu with categorized examples
- [x] Examples cover all major language features
- [x] Each example includes comments explaining the concepts
- [x] Loading an example replaces the editor content

### US-10: Responsive Layout

As a mobile user, I want the IDE to work on different screen sizes so that I can use it on tablets or phones.

**Acceptance Criteria:**
- [x] Panels stack vertically on narrow screens
- [x] Editor remains usable on tablet-sized screens
- [x] Touch-friendly button sizes
- [x] No horizontal scrolling required

## Non-Functional Requirements

### NFR-1: Performance
- Page load time under 2 seconds on broadband
- Editor input latency under 16ms (60 FPS)
- AST/bytecode updates debounced to 300ms after last keystroke

### NFR-2: Compatibility
- Works in Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- No server-side dependency (fully static hosting)
- All dependencies loaded from CDN with SRI hashes

### NFR-3: Accessibility
- Keyboard navigable (tab order, focus indicators)
- ARIA labels on interactive elements
- Sufficient contrast ratios for all text

### NFR-4: Bundle Size
- Total page weight under 500KB gzipped (including CDN libs)
- TinyLang runtime bundle under 100KB minified
