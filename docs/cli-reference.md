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
| 1 | Runtime error, lint errors, or test failures |
| 2 | Parse error (invalid syntax) |
