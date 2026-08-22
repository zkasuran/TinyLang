# Web IDE Development Guide

## Overview

The TinyLang Web IDE (playground) is a fully client-side browser application that lets users write, run, debug, and explore TinyLang programs. It is built as a single `index.html` file for zero-config deployment.

## Architecture

```
playground/
  template.html    # Source HTML template (edit this)
  build.js         # Build script (esbuild + template injection)
  index.html       # Generated output (DO NOT EDIT DIRECTLY)
```

### Build Process

The `build.js` script:
1. Bundles all TypeScript source (`src/index.ts`) into a browser-compatible IIFE using esbuild
2. Reads `playground/template.html` as the HTML skeleton
3. Injects the bundled JavaScript at the `<!-- TINYLANG_BUNDLE -->` marker
4. Writes the final `playground/index.html`

**Run the build:**
```bash
node playground/build.js
```

**Or via npm script:**
```bash
npm run playground
```

### Why Single-File Output?

- Works with `file://` URLs (no web server needed for local testing)
- GitHub Pages deployment is just committing the file
- No CORS issues (everything is same-origin inline)
- Users can download and use offline
- No CDN or server dependency for the TinyLang runtime itself

## Template Structure

The `template.html` file contains:

1. **CDN imports** - CodeMirror 6 modules loaded from esm.sh
2. **Inline CSS** - All styles in a `<style>` block
3. **HTML structure** - Panel layout with semantic elements
4. **Application JavaScript** - UI logic, event handlers, integration code
5. **`<!-- TINYLANG_BUNDLE -->` marker** - Where the runtime is injected

### Key Sections

```html
<!-- CDN Dependencies (CodeMirror) -->
<script type="module">
  import { EditorView, ... } from 'https://esm.sh/...'
</script>

<!-- Styles -->
<style>
  :root { /* CSS custom properties for theming */ }
  .panel { /* Panel layout styles */ }
</style>

<!-- Layout -->
<div id="app">
  <header>...</header>
  <div id="file-explorer">...</div>
  <div id="editor-container">...</div>
  <div id="console">...</div>
  <div id="sidebar">...</div>
</div>

<!-- TinyLang Runtime (injected by build.js) -->
<!-- TINYLANG_BUNDLE -->

<!-- Application Logic -->
<script>
  // Uses window.TinyLang from the injected bundle
</script>
```

## Adding Features to the IDE

### Adding a New Panel

1. Add the HTML structure in `template.html`:
```html
<div id="my-panel" class="panel">
  <div class="panel-header">
    <span class="panel-title">My Panel</span>
  </div>
  <div class="panel-content" id="my-panel-content">
  </div>
</div>
```

2. Add CSS for the panel layout:
```css
#my-panel {
  grid-area: mypanel; /* Add to grid-template-areas */
}
```

3. Add the panel toggle button in the header:
```html
<button class="toolbar-btn" onclick="togglePanel('my-panel')" title="My Panel">
  <!-- Icon -->
</button>
```

4. Add the JavaScript logic:
```javascript
function updateMyPanel(data) {
  const el = document.getElementById('my-panel-content');
  el.innerHTML = renderMyContent(data);
}
```

### Adding a New Toolbar Action

1. Add the button in the header toolbar:
```html
<button class="toolbar-btn" onclick="myAction()" title="My Action (Ctrl+K)">
  <span class="btn-icon">&#x1F4E6;</span>
  <span class="btn-label">My Action</span>
</button>
```

2. Implement the action function:
```javascript
function myAction() {
  const source = getEditorContent();
  // Do something with the source using window.TinyLang
}
```

3. Add keyboard shortcut (if applicable):
```javascript
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    myAction();
  }
});
```

### Using the TinyLang Runtime

The bundled runtime is available as `window.TinyLang`:

```javascript
// Access the full API
const { Lexer, Parser, Interpreter, Compiler, VM, Formatter, Linter } = window.TinyLang;

// Run a program
function runProgram(source) {
  const output = [];
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const interpreter = new Interpreter({
    output: (msg) => output.push(msg)
  });
  interpreter.execute(ast);
  return output;
}

// Compile to bytecode
function compileToBytecode(source) {
  const lexer = new Lexer(source);
  const parser = new Parser(lexer.tokenize());
  const compiler = new Compiler();
  return compiler.compile(parser.parse());
}
```

## Theming

The IDE uses CSS custom properties for theming:

```css
:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #e9ecef;
  --text-primary: #212529;
  --text-secondary: #6c757d;
  --border-color: #dee2e6;
  --accent-color: #0d6efd;
  --error-color: #dc3545;
  --success-color: #198754;
  --warning-color: #ffc107;
}
```

To add a new theme:
1. Add a new `data-theme` value in CSS
2. Define all custom properties for that theme
3. Add the theme option to the toggle button

## Code Sharing

URL format: `#code=<base64-encoded-source>`

```javascript
// Encode
function shareCode(source) {
  const encoded = btoa(unescape(encodeURIComponent(source)));
  return `${window.location.origin}${window.location.pathname}#code=${encoded}`;
}

// Decode
function loadSharedCode() {
  const hash = window.location.hash;
  if (hash.startsWith('#code=')) {
    const encoded = hash.slice(6);
    return decodeURIComponent(escape(atob(encoded)));
  }
  return null;
}
```

## Virtual Filesystem

Files are stored in localStorage under the key `tinylang-files`:

```javascript
const FS_KEY = 'tinylang-files';

function saveFiles(files) {
  localStorage.setItem(FS_KEY, JSON.stringify(files));
}

function loadFiles() {
  const stored = localStorage.getItem(FS_KEY);
  return stored ? JSON.parse(stored) : getDefaultFiles();
}
```

## Testing the Playground

Since the playground is a generated file, testing is done by:

1. **Building:** `node playground/build.js` must complete without errors
2. **File validation:** The output `index.html` must be valid HTML
3. **Manual testing:** Open in browser, run examples, verify output
4. **Automated:** The Vitest suite tests the TinyLang runtime directly (same code that gets bundled)

## Common Pitfalls

1. **Never edit `playground/index.html` directly** - It is regenerated on build. Edit `template.html` instead.
2. **CDN availability** - The playground has a fallback textarea editor if CDN resources fail to load.
3. **Bundle size** - Keep the TinyLang runtime lean. Avoid importing Node.js-specific modules in `src/` files that will be bundled.
4. **Browser compatibility** - Test in Chrome, Firefox, and Safari. Avoid APIs not available in Safari 14+.
5. **localStorage limits** - Maximum ~5MB. Warn users if they approach this limit.
