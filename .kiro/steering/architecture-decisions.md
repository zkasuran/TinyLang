# Architecture Decision Records (ADRs)

## ADR-001: Hand-Written Lexer and Parser

**Status:** Accepted

**Context:** TinyLang could use parser generators (ANTLR, PEG.js, Nearley) or a hand-written approach for the lexer and parser.

**Decision:** Use a hand-written lexer and recursive-descent parser with Pratt expression parsing.

**Rationale:**
- Educational clarity: every line of the lexer/parser is readable TypeScript
- Better error messages: hand-written code can produce contextual hints
- No build step dependency: no grammar files to compile
- Full control over token position tracking
- Pratt parsing handles precedence elegantly without grammar ambiguity

**Consequences:**
- More code to write and maintain (vs. grammar definition)
- Parser changes require careful testing (no grammar validation)
- Performance is good enough for educational programs

---

## ADR-002: Tree-Walk Interpreter as Primary Execution

**Status:** Accepted

**Context:** TinyLang needs an execution strategy. Options: tree-walk interpreter, bytecode compiler + VM, transpilation to JavaScript.

**Decision:** Use tree-walk interpretation as the primary execution path, with an optional bytecode compiler + VM for advanced use.

**Rationale:**
- Tree-walk is simplest to implement and understand
- Direct correspondence between AST nodes and behavior
- Easy to integrate debugger (hook before each statement)
- Bytecode path available for users who want to learn about compilation
- Both paths produce identical results (tested)

**Consequences:**
- Slower execution than bytecode (acceptable for educational programs)
- Two execution paths to maintain and test
- Debugger only works with tree-walk path (replay approach)

---

## ADR-003: Stack-Based VM over Register-Based

**Status:** Accepted

**Context:** The bytecode VM could use a stack-based or register-based architecture.

**Decision:** Stack-based VM with operand stack and call frame stack.

**Rationale:**
- Simpler to compile for (no register allocation needed)
- Smaller bytecode (no register operands in most instructions)
- Easier to understand for learners (push/pop mental model)
- Well-documented approach (JVM, CPython, Lua 4.x)

**Consequences:**
- More stack operations than register-based (more memory traffic)
- Some operations require DUP/SWAP that registers avoid
- Performance is slightly lower than register-based (not a concern for educational use)

---

## ADR-004: Replay-Based Debugger

**Status:** Accepted

**Context:** The debugger needs to pause execution and allow inspection. The interpreter is synchronous and recursive, making suspension difficult.

**Decision:** Use a replay-based approach: re-execute from the start on each step, suppressing output until reaching the target statement.

**Rationale:**
- No modification to interpreter's recursive structure needed
- Deterministic state reproduction
- Simple to implement correctly
- Avoids complex coroutine/generator patterns

**Consequences:**
- O(n) cost per step (n = total statements from start to current point)
- Non-deterministic operations (random) produce different values on replay
- Output must be suppressed during replay phase
- Acceptable for programs under ~1000 lines (instant response)

---

## ADR-005: esbuild for Playground Bundling

**Status:** Accepted

**Context:** The Web IDE needs the TinyLang runtime to run in the browser. Options: webpack, rollup, esbuild, or manual concatenation.

**Decision:** Use esbuild to bundle the TypeScript source into a browser-compatible IIFE.

**Rationale:**
- Extremely fast (sub-100ms build times)
- Native TypeScript support (no Babel needed)
- IIFE output works in all browsers without module system
- Simple API (programmatic use in build.js)
- Already available as a devDependency

**Consequences:**
- Less control over output format than webpack
- No support for advanced code splitting (not needed - single page app)
- Build script is simple and fast

---

## ADR-006: CodeMirror 6 for Editor

**Status:** Accepted

**Context:** The Web IDE needs a code editor. Options: Monaco (VS Code), CodeMirror 6, Ace, or custom textarea.

**Decision:** Use CodeMirror 6 loaded from CDN.

**Rationale:**
- Lightweight (smaller than Monaco)
- Excellent extension system for custom language support
- Mobile-friendly (touch support)
- Loads fast from CDN (no bundling required)
- Accessible (ARIA support built-in)
- Active development and community

**Consequences:**
- Less feature-rich than Monaco (acceptable for our use case)
- Requires custom language mode implementation (educational value)
- CDN dependency (falls back to textarea if CDN fails)

---

## ADR-007: localStorage for Virtual Filesystem

**Status:** Accepted

**Context:** The Web IDE needs file persistence without a backend server.

**Decision:** Use localStorage for the virtual filesystem.

**Rationale:**
- No server required (fully static deployment)
- Synchronous API (simple to use)
- 5-10MB storage limit is sufficient for educational programs
- Works offline after first page load
- No user authentication needed

**Consequences:**
- Data is browser-specific (not synced across devices)
- Storage limit may be hit for very large projects
- Data can be lost if user clears browser data
- No collaboration features (acceptable for educational tool)

---

## ADR-008: Single-File HTML Output

**Status:** Accepted

**Context:** The playground build could produce multiple files (HTML + JS + CSS) or a single self-contained HTML file.

**Decision:** Build produces a single `index.html` with all JavaScript and CSS inlined.

**Rationale:**
- Zero-config deployment (works with any static host)
- Works with `file://` URLs (no server needed to test locally)
- No CORS issues (everything is same-origin)
- Easy to share (single file)
- GitHub Pages deployment is trivial

**Consequences:**
- Larger initial download (no caching of separate JS/CSS)
- Cannot use browser cache for the bundled code separately
- Build script must inline all resources

---

## ADR-009: Upvalue-Based Closures

**Status:** Accepted

**Context:** Closures need to capture variables from enclosing scopes. Options: heap-allocate all locals, copy values at closure creation, or use upvalue references.

**Decision:** Use upvalue-based closures that reference parent frame locals or parent upvalues.

**Rationale:**
- Only captured variables have runtime overhead (not all locals)
- Matches Lua's implementation (well-documented, proven approach)
- Compiler can statically determine which variables are captured
- Works correctly with mutable variables (captures by reference)

**Consequences:**
- Compiler must track which variables are captured
- CLOSURE instruction has variable-length encoding (upvalue descriptors)
- More complex than copy-on-close but more correct for mutable captures

---

## ADR-010: Binary Format with Magic Bytes

**Status:** Accepted

**Context:** Compiled `.tinyc` files need a storage format. Options: JSON (human-readable), custom binary, or MessagePack.

**Decision:** Custom binary format with `TINY` magic bytes and version number.

**Rationale:**
- Compact representation (smaller than source for non-trivial programs)
- Fast to load (no parsing overhead)
- Version number enables forward compatibility
- Magic bytes enable file type detection
- Educational value in designing a binary format

**Consequences:**
- Not human-readable (disassembler provides text view)
- Must maintain serialization/deserialization code
- Format changes require version bumps
- Endianness must be handled (use platform-native for simplicity)

---

## ADR-011: Newline-Based Statement Separation

**Status:** Accepted

**Context:** TinyLang needs a way to separate statements. Options: semicolons (required), semicolons (optional with ASI), or newlines.

**Decision:** Newlines serve as statement separators. The lexer emits NEWLINE tokens that the parser uses as statement boundaries.

**Rationale:**
- Beginner-friendly (no "missing semicolon" errors)
- Cleaner visual appearance
- Matches Python's approach (familiar to target audience)
- Blocks use braces (unlike Python's significant whitespace)

**Consequences:**
- Lexer must determine which newlines are meaningful
- Multi-line expressions need careful handling (continuation rules)
- Parser must handle optional newlines in certain positions

---

## ADR-012: No External Runtime Dependencies

**Status:** Accepted

**Context:** The core TinyLang engine could depend on external npm packages or be self-contained.

**Decision:** The core language engine (lexer, parser, interpreter, compiler, VM) has zero external runtime dependencies. Only devDependencies (vitest, esbuild, typescript) are used.

**Rationale:**
- Simpler bundling for the playground (no node_modules to resolve)
- Faster installation
- No supply chain risk for the runtime
- Educational: shows that complex systems can be built from scratch
- Easier to understand the full codebase

**Consequences:**
- Must implement utilities that packages might provide (color codes, string formatting)
- More code to maintain
- Build tools are still external (acceptable: they are dev-only)
