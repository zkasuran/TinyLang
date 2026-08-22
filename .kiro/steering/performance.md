# Performance Guidelines

## Architecture

TinyLang provides two execution engines with different performance characteristics:

| Engine | Speed | Use Case |
|--------|-------|----------|
| Tree-walk Interpreter | Slower (~1x) | Debugging, REPL, simple scripts |
| Bytecode Compiler + VM | Faster (~3-10x) | Production, benchmarks, larger programs |

## Benchmarking

### Built-in Benchmark Command

```bash
node dist/cli/index.js bench examples/07-fibonacci.tiny
```

This runs the program multiple times and reports:
- Execution time (min, max, average, median)
- Interpreter vs VM comparison
- Speedup ratio

### Writing Benchmarks

Good benchmarks:
- Exercise specific operations (arithmetic, function calls, closures, loops)
- Run long enough to measure reliably (>10ms)
- Avoid I/O (print) in the hot loop
- Are deterministic (no random)

## VM Performance Considerations

### Stack Operations
- The VM stack is pre-allocated for performance
- Stack overflow is detected via a configurable limit (default: 10,000 frames)
- Minimize stack depth by preferring iteration over deep recursion

### Constant Pool
- Deduplicate constants during compilation
- Small integers and common strings can be cached
- The constant pool is indexed by 16-bit values (max 65,535 constants)

### Instruction Encoding
- Single-byte opcodes for common operations
- Operands encoded inline after the opcode
- Jump targets are 16-bit relative offsets

## Optimization Passes

The compiler runs optimization passes before generating final bytecode:

1. **Constant Folding**: Evaluate compile-time constant expressions
   - `2 + 3` becomes `5` at compile time
   - Only pure expressions (no side effects)

2. **Dead Code Elimination**: Remove unreachable code
   - Code after unconditional `return`
   - Code after `break` in loops
   - Branches with constant false conditions

## Memory Management

- The interpreter uses JavaScript's garbage collector
- The VM uses reference counting for heap objects (arrays, objects, closures)
- Closures capture variables by reference via upvalues
- Circular references in objects can cause memory leaks (document this limitation)

## Guidelines for Contributors

1. Never add O(n^2) algorithms where O(n) or O(n log n) is possible
2. Avoid allocations in hot loops (reuse arrays/objects)
3. Use the benchmark command to verify performance changes
4. Profile before optimizing - measure, don't guess
5. Keep the interpreter simple; optimize the VM path
