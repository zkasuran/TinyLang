# CLI Reference

## Usage

```bash
node dist/cli/index.js <command> [options] [file]
```

Or with an alias:
```bash
alias tinylang="node $(pwd)/dist/cli/index.js"
tinylang run hello.tiny
```

---

## Commands

### `run` -- Execute a TinyLang Program

```bash
tinylang run <file.tiny>
```

Parses and interprets the source file using the tree-walk interpreter.

### `compile` -- Compile to Bytecode

```bash
tinylang compile <file.tiny>
```

Compiles the source to bytecode and writes a `.tinyc` binary file. Reports instruction count and compilation time.

### `exec` -- Execute via VM

```bash
tinylang exec <file.tiny|file.tinyc>
```

If given a `.tiny` file, compiles then executes on the VM. If given a `.tinyc` file, loads and executes the pre-compiled bytecode directly.

### `debug` -- Interactive Debugger

```bash
tinylang debug <file.tiny>
```

Launches the interactive debugger. Commands:
- `b <line>` -- Set breakpoint
- `b <line> when <expr>` -- Conditional breakpoint
- `d <id>` -- Delete breakpoint
- `s` -- Step over
- `i` -- Step into
- `o` -- Step out
- `c` -- Continue
- `p <expr>` -- Print expression
- `w <expr>` -- Watch expression
- `locals` -- Show local variables
- `stack` -- Show call stack
- `q` -- Quit

### `fmt` -- Format Source Code

```bash
tinylang fmt <file.tiny>
tinylang fmt --check <file.tiny>   # Exit 1 if unformatted
tinylang fmt --write <file.tiny>   # Overwrite in place
```

AST-based formatting that produces consistent, readable code.

Every result is re-parsed and compared against the AST it was produced from. If
anything differs, the command reports the difference and exits 1 without writing,
so `--write` cannot replace a file with code that means something else.

### `lint` -- Static Analysis

```bash
tinylang lint <file.tiny>
tinylang lint --fix <file.tiny>    # Auto-fix issues
```

Runs 5 rules:
- `unused-variables` -- Variables declared but never read
- `unreachable-code` -- Code after return/break/continue
- `no-empty-blocks` -- Empty function/if/while bodies
- `prefer-const` -- Variables never reassigned
- `no-shadow` -- Inner variables hiding outer scope

### `test` -- Run Test Blocks

```bash
tinylang test <file.tiny>
```

Discovers and executes all `test "..." { ... }` blocks in the file. Reports pass/fail with colored output.

### `wasm` -- Compile to WebAssembly Text

```bash
tinylang wasm <file.tiny>
tinylang wasm <file.tiny> -o out.wat   # Choose the output path
```

Compiles function declarations to WebAssembly Text Format (`.wat`). The target
covers a deliberately narrow subset: integer functions, parameters, locals,
`if`/`else`, `while`, direct calls and recursion, arithmetic, comparisons, and
`and`/`or`. Every value is an `i32`.

A function that uses anything outside that subset is **left out of the module
entirely** and is not exported. That is reported as an **error, not a warning**,
and the command **exits non-zero**, because the export the caller asked for does
not exist in the output:

```
$ tinylang wasm mixed.tiny
1 function(s) could not be compiled to WASM:
  - describe: unsupported expression type for WASM: StringLiteral
  These functions are absent from the module and are not exported.
Note: 1 top-level statement(s) were left out (the WASM target compiles function declarations only).
Compiled to WebAssembly: mixed.wat (181 bytes)
Compiled and exported: addUp
Incomplete: 1 function(s) compiled, 1 could not be.
$ echo $?
1
```

The `.wat` file is still written when at least one function compiled, so the
functions that did translate remain usable; if no function is expressible in the
subset, nothing is written at all. Top-level statements are not part of the WASM
output and are reported as a note rather than an error. The compiler never emits
a stand-in for an operation it cannot translate.

### `check` -- Syntax Verification

```bash
tinylang check <file.tiny>
```

Parses the file and reports any syntax errors without executing.

### `repl` -- Interactive Shell

```bash
tinylang repl
```

Interactive Read-Eval-Print Loop for experimenting with TinyLang expressions.

### `init` -- Scaffold Project

```bash
tinylang init [directory]
```

Creates a new TinyLang project with starter files:
- `main.tiny` -- Entry point
- `lib.tiny` -- Helper functions
- `main.test.tiny` -- Test file
- `.tinylang.json` -- Configuration

### `bench` -- Benchmark

```bash
tinylang bench <file.tiny>
```

Runs the file multiple times and reports:
- Interpreter execution time (min/max/avg)
- VM execution time (min/max/avg)
- Speedup ratio (VM vs interpreter)

### `doc` -- Generate Documentation

```bash
tinylang doc <file.tiny>
```

Extracts doc comments and function signatures, outputs markdown documentation.

### `help` -- Show Help

```bash
tinylang help
tinylang --help
```

### `version` -- Show Version

```bash
tinylang --version
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error, lint errors, test failures, unformattable input, or a `wasm` compilation that left a function out |
| 2 | Parse error (invalid syntax) |
