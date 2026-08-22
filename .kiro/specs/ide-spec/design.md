# Web IDE - Design

## Architecture

The Web IDE is a single-file application (`playground/index.html`) that bundles the entire TinyLang engine inline. It requires no server, no network, and no build step to use.

```
┌─────────────────────────────────────────────────────────┐
│                   playground/index.html                   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌──────────────────────────────────┐   │
│  │  File       │ │  Editor Panel                     │   │
│  │  Explorer   │ │  - Line numbers                   │   │
│  │  - Files    │ │  - Syntax highlighting            │   │
│  │  - Create   │ │  - Autocomplete                   │   │
│  │  - Delete   │ │  - Bracket matching               │   │
│  │  - Rename   │ │  - Current line highlight         │   │
│  └─────────────┘ └──────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Panel Tabs: Output | Debugger | AST | Bytecode  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Output: Console log with colored messages        │   │
│  │  Debugger: Breakpoints, stepping, variables       │   │
│  │  AST: Collapsible tree view of parse tree         │   │
│  │  Bytecode: Disassembled instruction listing       │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Toolbar: Run | Debug | Format | Theme | Share    │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  Embedded TinyLang Engine (lexer + parser + interpreter  │
│  + compiler + VM + formatter + linter + stdlib)          │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Single-File Architecture
All HTML, CSS, and JavaScript are in one file. This allows:
- Opening directly from filesystem (no server needed)
- Easy sharing (one file attachment)
- Zero dependencies

### 2. Virtual Filesystem
Files are stored in localStorage via a virtual filesystem:
- Supports multiple files per "project"
- Persistent across browser sessions
- Export/import via URL encoding or download

### 3. Engine Integration
The TinyLang engine is compiled to JavaScript and embedded inline:
- Parser, interpreter, compiler, VM all available
- Can switch between interpreted and compiled execution
- AST and bytecode are computed in real-time as you type

### 4. Theme System
- Dark theme (default): easy on the eyes, preferred by developers
- Light theme: accessible, high contrast
- Theme preference stored in localStorage
- CSS custom properties for easy theming

### 5. Responsive Layout
- Desktop: side-by-side panels (editor left, output right)
- Tablet: stacked panels with tabs
- Mobile: single panel with navigation
