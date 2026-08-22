# TinyLang — Requirements

## Overview
Build a minimal educational programming language called TinyLang that teaches programming concepts to beginners through friendly syntax, helpful error messages, and an interactive learning environment.

## User Stories

### US-1: Running Programs
As a beginner programmer, I want to write TinyLang code in a file and run it from the command line so that I can see my programs execute.

**Acceptance Criteria:**
- [ ] Can execute `.tiny` files via `tinylang run <file.tiny>`
- [ ] Program output appears in stdout
- [ ] Errors display with line numbers and helpful hints
- [ ] Exit code 0 on success, 1 on error

### US-2: Interactive REPL
As a learner, I want an interactive mode where I can type expressions and see results immediately so that I can experiment with the language.

**Acceptance Criteria:**
- [ ] REPL starts with `tinylang repl`
- [ ] Each expression result is displayed automatically
- [ ] Multi-line input supported (blocks with `{`)
- [ ] History and arrow key navigation
- [ ] `.help`, `.clear`, `.exit` commands

### US-3: Variable Declaration
As a beginner, I want to declare variables with clear keywords so I understand the concept of storing values.

**Acceptance Criteria:**
- [ ] `let` declares mutable variables
- [ ] `const` declares immutable constants
- [ ] Reassigning a `const` produces a clear error message
- [ ] Variables must be declared before use

### US-4: Functions
As a learner, I want to define and call functions so I understand code reuse and abstraction.

**Acceptance Criteria:**
- [ ] Functions defined with `fn name(params) { body }`
- [ ] Functions can return values with `return`
- [ ] Default parameter values supported
- [ ] Arrow function syntax for short functions
- [ ] Closures work correctly (functions capture their environment)

### US-5: Control Flow
As a student, I want if/else, loops, and match statements so I can write programs with logic and repetition.

**Acceptance Criteria:**
- [ ] `if/else if/else` chains work
- [ ] `while` loops with `break` and `continue`
- [ ] `for...in` loops over arrays and ranges
- [ ] `match/when` pattern matching
- [ ] Nested control flow works correctly

### US-6: Data Structures
As a programmer, I want arrays and objects so I can organize and work with collections of data.

**Acceptance Criteria:**
- [ ] Array literals: `[1, 2, 3]`
- [ ] Array indexing: `arr[0]`
- [ ] Object literals: `{key: value}`
- [ ] Object property access: `obj.key`
- [ ] Built-in methods: `push`, `pop`, `len`, `map`, `filter`

### US-7: Classes and OOP
As an intermediate learner, I want classes so I can learn object-oriented programming concepts.

**Acceptance Criteria:**
- [ ] Class declaration with `class Name { }`
- [ ] Constructor via `fn init(...)`
- [ ] Instance methods and properties
- [ ] Inheritance with `extends`
- [ ] `this` keyword for self-reference
- [ ] `new ClassName()` for instantiation

### US-8: Educational Errors
As a beginner, I want errors that explain what went wrong and how to fix it so I don't get stuck.

**Acceptance Criteria:**
- [ ] Every error shows the exact line and column
- [ ] Error messages avoid jargon
- [ ] Each error includes a "hint" suggesting the fix
- [ ] Source context is shown with a pointer to the error location

### US-9: Web Playground
As a teacher, I want a browser-based playground so students can try TinyLang without installing anything.

**Acceptance Criteria:**
- [ ] Code editor with syntax highlighting
- [ ] Run button executes code
- [ ] Output panel shows results
- [ ] Example programs loadable from a dropdown
- [ ] Works entirely client-side (no server needed)

### US-10: Standard Library
As a developer, I want built-in functions for common tasks so I can be productive without importing external code.

**Acceptance Criteria:**
- [ ] I/O: `print`, `input`
- [ ] Math: `abs`, `floor`, `ceil`, `round`, `random`, `min`, `max`, `sqrt`
- [ ] Strings: `len`, `split`, `join`, `upper`, `lower`, `trim`, `contains`
- [ ] Arrays: `push`, `pop`, `shift`, `map`, `filter`, `reduce`, `sort`, `reverse`
- [ ] Type system: `type`, `str`, `num`, `bool`
- [ ] Utilities: `range`, `keys`, `values`

## Non-Functional Requirements

### NFR-1: Performance
- Programs with <1000 lines should execute in <1 second
- REPL response time <100ms for simple expressions

### NFR-2: Compatibility
- Works on Node.js 18+ (LTS versions)
- Web playground works in modern browsers (Chrome, Firefox, Safari, Edge)

### NFR-3: Code Quality
- 90%+ test coverage on core modules (lexer, parser, interpreter)
- No `any` types in TypeScript
- All public APIs documented with JSDoc

### NFR-4: Usability
- Installation via `npm install` + `npm run build`
- REPL available within 3 seconds of running the command
- Web playground loads in <2 seconds
