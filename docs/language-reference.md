# TinyLang Language Reference

## Overview

TinyLang is a dynamically-typed programming language with clean, modern syntax. It supports variables, functions, classes, pattern matching, error handling, and more.

---

## Data Types

| Type | Description | Examples |
|------|-------------|---------|
| `number` | Double-precision floating point | `42`, `3.14`, `-7` |
| `string` | UTF-8 text | `"hello"`, `'world'`, `f"Hi {name}"` |
| `boolean` | Logical true/false | `true`, `false` |
| `null` | Absence of value | `null` |
| `array` | Ordered collection | `[1, 2, 3]`, `["a", "b"]` |
| `object` | Key-value pairs | `{name: "Alice", age: 30}` |

---

## Variables

### `let` - Mutable Variables

```
let x = 42
x = 100        // can reassign
let name = "TinyLang"
```

### `const` - Immutable Variables

```
const PI = 3.14159
const MAX_SIZE = 100
// PI = 3  <-- Error: Cannot reassign const
```

---

## Operators

### Arithmetic
| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `2 + 3` -> `5` |
| `-` | Subtraction | `10 - 4` -> `6` |
| `*` | Multiplication | `3 * 7` -> `21` |
| `/` | Division | `10 / 3` -> `3.333...` |
| `%` | Modulo | `10 % 3` -> `1` |
| `**` | Power | `2 ** 10` -> `1024` |
| `"x" * 3` | String repeat | `"ha" * 3` -> `"hahaha"` |

### Comparison
| Operator | Description |
|----------|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `>` | Greater than |
| `>=` | Greater than or equal |

### Logical
| Operator | Description |
|----------|-------------|
| `and` | Logical AND |
| `or` | Logical OR |
| `not` | Logical NOT |

### Assignment
| Operator | Equivalent |
|----------|-----------|
| `=` | Direct assignment |
| `+=` | `x = x + n` |
| `-=` | `x = x - n` |
| `*=` | `x = x * n` |
| `/=` | `x = x / n` |

Assigning to a `const` is an error in both engines:

```
const RATE = 3.14
RATE = 99   // RuntimeError: Cannot reassign constant 'RATE'
```

The binding is what is constant, not the value it refers to: `const list = [1]`
followed by `list[0] = 9` is allowed.

### Conditional (Ternary)

`cond ? whenTrue : whenFalse` is an expression, so it can appear anywhere a
value can. Only the arm that is selected is evaluated.

```
let label = n > 0 ? "positive" : "not positive"

print(items.length() == 0 ? "empty" : "has items")

let config = {retries: isProd ? 5 : 1}
```

It binds looser than every operator except assignment, so a comparison forms
the condition without parentheses, and it is right-associative, so a chain reads
top to bottom:

```
let grade = score > 90 ? "A" : score > 80 ? "B" : "C"
// groups as: score > 90 ? "A" : (score > 80 ? "B" : "C")
```

---

## Control Flow

### If/Else

```
if x > 0 {
  print("positive")
} else {
  if x < 0 {
    print("negative")
  } else {
    print("zero")
  }
}
```

### While Loop

```
let i = 0
while i < 10 {
  print(i)
  i += 1
}
```

### For-In Loop

```
// Iterate over array
for item in [1, 2, 3, 4, 5] {
  print(item)
}

// Iterate over range
for i in 0..10 {
  print(i)  // 0, 1, 2, ..., 9
}
```

### Break and Continue

```
for i in 0..100 {
  if i % 2 == 0 { continue }  // skip even
  if i > 20 { break }         // stop at 20
  print(i)
}
```

### Match Expression

```
let day = "Monday"
match day {
  when "Monday" => print("Start of week")
  when "Friday" => print("TGIF!")
  when "Saturday" => print("Weekend!")
  when "Sunday" => print("Weekend!")
  else => print("Midweek")
}
```

---

## Functions

### Named Functions

```
fn greet(name) {
  return f"Hello, {name}!"
}
print(greet("world"))
```

### Default Parameters

```
fn power(base, exp, 2) {
  let result = 1
  for i in 0..exp {
    result *= base
  }
  return result
}
print(power(3))     // 9 (uses default exp=2)
print(power(2, 10)) // 1024
```

### Arrow Functions

```
let double = (x) => x * 2
let add = (a, b) => a + b

let numbers = [1, 2, 3, 4, 5]
let doubled = numbers.map((x) => x * 2)
```

### Closures

```
fn makeCounter(start) {
  let count = start
  return () => {
    count += 1
    return count
  }
}

let counter = makeCounter(0)
print(counter())  // 1
print(counter())  // 2
print(counter())  // 3
```

---

## Classes

### Basic Class

```
class Animal {
  fn init(name, sound) {
    this.name = name
    this.sound = sound
  }
  
  fn speak() {
    return f"{this.name} says {this.sound}!"
  }
}

let dog = new Animal("Dog", "Woof")
print(dog.speak())  // Dog says Woof!
```

### Inheritance

```
class Shape {
  fn init(name) {
    this.name = name
  }
  fn describe() {
    return f"I am a {this.name}"
  }
}

class Circle extends Shape {
  fn init(radius) {
    this.name = "circle"
    this.radius = radius
  }
  fn area() {
    return PI * this.radius ** 2
  }
}

let c = new Circle(5)
print(c.describe())  // I am a circle
print(c.area())      // 78.539...
```

---

## String Interpolation

Use `f"..."` to embed expressions inside strings:

```
let name = "TinyLang"
let version = 1.0
print(f"Welcome to {name} v{version}!")
print(f"2 + 2 = {2 + 2}")
print(f"Array length: {len([1,2,3])}")
```

---

## Destructuring

### Array Destructuring

```
let [a, b, c] = [10, 20, 30]
print(a)  // 10
print(b)  // 20

// From function return
fn getPoint() { return [3, 4] }
let [x, y] = getPoint()
```

### Object Destructuring

```
let person = {name: "Alice", age: 30, city: "NYC"}
let {name, age, city} = person
print(name)  // Alice
```

---

## Spread Operator

```
let first = [1, 2, 3]
let second = [4, 5, 6]
let combined = [...first, ...second]  // [1,2,3,4,5,6]

let chars = [..."hello"]  // ["h","e","l","l","o"]

let withExtra = [0, ...first, 99]  // [0,1,2,3,99]
```

---

## Error Handling

### Try/Catch/Throw

```
fn divide(a, b) {
  if b == 0 {
    throw "Division by zero"
  }
  return a / b
}

try {
  let result = divide(10, 0)
} catch err {
  print(f"Error: {err.message}")
}
```

---

## Range Expressions

```
// 0..5 generates [0, 1, 2, 3, 4]
for i in 0..5 {
  print(i)
}

// Used with for loops
for i in 1..101 {
  // iterate 1 to 100
}
```

---

## Test Blocks

```
fn add(a, b) { return a + b }

test "addition works" {
  expectToBe(add(2, 3), 5)
  expectToBe(add(-1, 1), 0)
}

test "handles edge cases" {
  expectToBe(add(0, 0), 0)
}
```

Run tests with: `tinylang test file.tiny`
