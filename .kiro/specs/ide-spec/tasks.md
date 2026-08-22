# Web IDE - Tasks

## Phase 1: Core Editor

- [x] Create basic HTML structure with editor textarea
- [x] Add line number gutter
- [x] Implement syntax highlighting for TinyLang tokens
- [x] Add auto-indent on Enter key
- [x] Implement bracket matching

## Phase 2: Execution

- [x] Bundle TinyLang engine inline
- [x] Implement Run button that executes code
- [x] Capture print output and display in console panel
- [x] Display errors with line numbers in red
- [x] Show execution time

## Phase 3: Debugger

- [x] Implement breakpoint gutter (click to toggle)
- [x] Integrate debugger with interpreter hooks
- [x] Add Step Over, Step Into, Step Out buttons
- [x] Highlight current execution line
- [x] Show variable inspector panel

## Phase 4: AST Viewer

- [x] Parse code on change (debounced)
- [x] Render AST as collapsible tree
- [x] Show node type and properties
- [x] Implement click-to-highlight source mapping

## Phase 5: File System

- [x] Create virtual filesystem backed by localStorage
- [x] File explorer sidebar with file list
- [x] Create/rename/delete file operations
- [x] Tab bar for open files
- [x] Persist project state

## Phase 6: Polish

- [x] Dark and light theme with toggle
- [x] Share via URL encoding
- [x] Autocomplete for keywords and stdlib
- [x] Responsive layout for mobile
- [x] Keyboard shortcuts (Ctrl+Enter to run, Ctrl+S to save)
- [x] Load example programs
