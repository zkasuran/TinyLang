# Getting Started with TinyLang

## Installation

```bash
# Clone the repository
git clone https://github.com/zkasuran/TinyLang.git
cd TinyLang

# Install dependencies
npm install

# Build the compiler
npm run build

# Verify installation
node dist/cli/index.js --version
```

## Your First Program

Create a file called `hello.tiny`:

```
print("Hello, TinyLang!")

let name = "World"
print(f"Greetings, {name}!")
```

Run it:
```bash
node dist/cli/index.js run hello.tiny
```

Output:
```
Hello, TinyLang!
Greetings, World!
```

## Using the REPL

For interactive exploration, launch the REPL:

```bash
node dist/cli/index.js repl
```

Type expressions and see results immediately:
```
> 2 + 2
4
> let x = [1, 2, 3]
> x.map((n) => n * 10)
[10, 20, 30]
```

## Running with the VM (Faster Execution)

Compile to bytecode for faster execution:

```bash
# Compile to .tinyc
node dist/cli/index.js compile hello.tiny

# Execute compiled bytecode
node dist/cli/index.js exec hello.tinyc
```

Or do both in one step:
```bash
node dist/cli/index.js exec hello.tiny
```

## Web IDE (No Installation)

Open `playground/index.html` in any modern browser for a full IDE experience:
- Syntax highlighting
- Auto-completion
- Visual debugger
- AST viewer
- Multiple file support

## Next Steps

- [Language Reference](language-reference.md) -- Full syntax guide
- [Standard Library](stdlib-api.md) -- All 60+ built-in functions
- [CLI Reference](cli-reference.md) -- All commands and options
- [Examples](../examples/) -- Working example programs
- [Architecture](compiler-architecture.md) -- How the compiler works
