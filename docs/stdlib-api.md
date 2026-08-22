# TinyLang Standard Library API

## Overview

TinyLang ships with 60+ built-in functions across 6 modules. All functions are available globally without imports.

---

## IO Module

### `print(value)`
Output a value to the console.
```
print("Hello, world!")
print(42)
print([1, 2, 3])
```

### `input(prompt)`
Read a line from stdin (interactive only).
```
let name = input("What is your name? ")
print(f"Hello, {name}!")
```

---

## Math Module

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `abs(n)` | `number -> number` | Absolute value |
| `floor(n)` | `number -> number` | Round down |
| `ceil(n)` | `number -> number` | Round up |
| `round(n)` | `number -> number` | Round to nearest |
| `sqrt(n)` | `number -> number` | Square root |
| `pow(base, exp)` | `(number, number) -> number` | Exponentiation |
| `sin(n)` | `number -> number` | Sine (radians) |
| `cos(n)` | `number -> number` | Cosine (radians) |
| `tan(n)` | `number -> number` | Tangent (radians) |
| `log(n)` | `number -> number` | Natural logarithm |
| `random()` | `() -> number` | Random float 0..1 |
| `randomInt(min, max)` | `(number, number) -> number` | Random integer |
| `min(a, b)` | `(number, number) -> number` | Smaller value |
| `max(a, b)` | `(number, number) -> number` | Larger value |

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `PI` | 3.14159... | Pi |
| `E` | 2.71828... | Euler's number |
| `TAU` | 6.28318... | Tau (2 * Pi) |
| `INFINITY` | Infinity | Positive infinity |

### Examples

```
print(abs(-42))        // 42
print(floor(3.7))      // 3
print(ceil(3.2))       // 4
print(sqrt(144))       // 12
print(min(5, 3))       // 3
print(max(5, 3))       // 5
print(pow(2, 10))      // 1024
```

---

## Strings Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `len(s)` | `string -> number` | String length |
| `upper(s)` | `string -> string` | Uppercase |
| `lower(s)` | `string -> string` | Lowercase |
| `trim(s)` | `string -> string` | Remove whitespace |
| `split(s, sep)` | `(string, string) -> array` | Split by separator |
| `join(arr, sep)` | `(array, string) -> string` | Join array elements |
| `contains(s, sub)` | `(string, string) -> boolean` | Check substring |
| `replace(s, old, new)` | `(string, string, string) -> string` | Replace substring |
| `charAt(s, i)` | `(string, number) -> string` | Character at index |
| `startsWith(s, prefix)` | `(string, string) -> boolean` | Check prefix |
| `endsWith(s, suffix)` | `(string, string) -> boolean` | Check suffix |
| `repeat(s, n)` | `(string, number) -> string` | Repeat string |
| `padStart(s, len, ch)` | `(string, number, string) -> string` | Pad start |
| `padEnd(s, len, ch)` | `(string, number, string) -> string` | Pad end |

### Examples

```
print(len("hello"))              // 5
print(upper("hello"))            // HELLO
print(lower("WORLD"))            // world
print(trim("  hi  "))           // "hi"
print(split("a,b,c", ","))      // ["a", "b", "c"]
print(join(["x", "y"], "-"))    // "x-y"
print(contains("hello", "ell")) // true
print(replace("foo", "o", "0")) // "f00"
print(startsWith("hello", "he"))// true
print(repeat("ha", 3))          // "hahaha"
```

---

## Arrays Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `len(arr)` | `array -> number` | Array length |
| `push(arr, val)` | `(array, any) -> array` | Add to end |
| `pop(arr)` | `array -> any` | Remove from end |
| `shift(arr)` | `array -> any` | Remove from start |
| `unshift(arr, val)` | `(array, any) -> array` | Add to start |
| `slice(arr, start, end)` | `(array, number, number) -> array` | Sub-array |
| `concat(a, b)` | `(array, array) -> array` | Join arrays |
| `indexOf(arr, val)` | `(array, any) -> number` | Find index (-1 if missing) |
| `includes(arr, val)` | `(array, any) -> boolean` | Check membership |
| `sort(arr)` | `array -> array` | Sort (mutates) |
| `reverse(arr)` | `array -> array` | Reverse (mutates) |
| `flatten(arr)` | `array -> array` | Flatten one level |
| `zip(a, b)` | `(array, array) -> array` | Pair elements |
| `enumerate(arr)` | `array -> array` | Index-value pairs |
| `unique(arr)` | `array -> array` | Remove duplicates |

### Array Methods (dot notation)

```
let nums = [1, 2, 3, 4, 5]

// Map: transform each element
let doubled = nums.map((x) => x * 2)  // [2, 4, 6, 8, 10]

// Filter: keep matching elements
let even = nums.filter((x) => x % 2 == 0)  // [2, 4]

// Reduce: accumulate to single value
let sum = nums.reduce((a, b) => a + b, 0)  // 15

// ForEach: iterate with side effects
nums.forEach((x) => print(x))
```

### Examples

```
let arr = [3, 1, 4, 1, 5]
print(len(arr))           // 5
push(arr, 9)              // [3,1,4,1,5,9]
print(pop(arr))           // 9
print(slice(arr, 1, 3))   // [1, 4]
print(includes(arr, 4))   // true
print(indexOf(arr, 4))    // 2
print(unique([1,1,2,2]))  // [1, 2]
```

---

## Types Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `type(val)` | `any -> string` | Get type name |
| `str(val)` | `any -> string` | Convert to string |
| `num(val)` | `any -> number` | Convert to number |
| `bool(val)` | `any -> boolean` | Convert to boolean |
| `isNumber(val)` | `any -> boolean` | Check if number |
| `isString(val)` | `any -> boolean` | Check if string |
| `isArray(val)` | `any -> boolean` | Check if array |
| `isNull(val)` | `any -> boolean` | Check if null |
| `isFunction(val)` | `any -> boolean` | Check if function |

### Examples

```
print(type(42))         // "number"
print(type("hi"))       // "string"
print(type([1,2]))      // "array"
print(str(42))          // "42"
print(num("3.14"))      // 3.14
print(isNumber(42))     // true
print(isString(42))     // false
```

---

## Utils Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `range(start, end)` | `(number, number) -> array` | Generate number array |
| `keys(obj)` | `object -> array` | Object keys |
| `values(obj)` | `object -> array` | Object values |
| `entries(obj)` | `object -> array` | Key-value pairs |
| `time()` | `() -> number` | Current timestamp (ms) |
| `clone(val)` | `any -> any` | Deep copy |
| `assert(cond, msg)` | `(boolean, string) -> null` | Assert condition |
| `format(template, ...args)` | `(string, ...) -> string` | Format string |

### Examples

```
print(range(1, 5))      // [1, 2, 3, 4]
let obj = {a: 1, b: 2}
print(keys(obj))        // ["a", "b"]
print(values(obj))      // [1, 2]
print(entries(obj))     // [["a", 1], ["b", 2]]

let start = time()
// ... computation ...
let elapsed = time() - start
print(f"Took {elapsed}ms")
```
