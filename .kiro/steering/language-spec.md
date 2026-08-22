# TinyLang Language Specification

## Syntax Overview

TinyLang uses a clean, beginner-friendly syntax inspired by Python and JavaScript.
Statements are separated by newlines. Blocks use curly braces `{}`.

## Data Types
- **Number**: `42`, `3.14`, `-7`
- **String**: `"hello"`, `'world'` (escape sequences: `\n`, `\t`, `\\`, `\"`, `\'`)
- **Boolean**: `true`, `false`
- **Null**: `null`
- **Array**: `[1, 2, 3]`
- **Object**: `{name: "Alice", age: 30}`

## Variables
```
let x = 10          // mutable variable
const PI = 3.14159  // immutable constant
x = 20              // reassignment (only for `let`)
```

## Operators
- Arithmetic: `+`, `-`, `*`, `/`, `%`, `**` (power)
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `and`, `or`, `not`
- Assignment: `=`, `+=`, `-=`, `*=`, `/=`
- String concatenation: `+`

## Control Flow
```
if condition {
  // ...
} else if other {
  // ...
} else {
  // ...
}

while condition {
  // ...
}

for item in collection {
  // ...
}

for i in 0..10 {
  // range-based loop (exclusive end)
}

match value {
  when 1 => print("one")
  when 2 => print("two")
  else => print("other")
}
```

## Functions
```
fn greet(name) {
  return "Hello, " + name + "!"
}

// With default parameters
fn power(base, exp = 2) {
  return base ** exp
}

// Arrow functions
let double = (x) => x * 2
let add = (a, b) => { return a + b }
```

## Classes
```
class Animal {
  let name = ""
  let sound = ""
  
  fn init(name, sound) {
    this.name = name
    this.sound = sound
  }
  
  fn speak() {
    print(this.name + " says " + this.sound)
  }
}

class Dog extends Animal {
  fn init(name) {
    this.name = name
    this.sound = "Woof"
  }
  
  fn fetch() {
    print(this.name + " fetches the ball!")
  }
}

let buddy = new Dog("Buddy")
buddy.speak()   // "Buddy says Woof"
buddy.fetch()   // "Buddy fetches the ball!"
```

## Built-in Functions
- `print(...)` — Output to console
- `input(prompt)` — Read user input
- `len(collection)` — Length of string/array
- `type(value)` — Get type as string
- `str(value)` — Convert to string
- `num(value)` — Convert to number
- `push(array, value)` — Add to array end
- `pop(array)` — Remove from array end
- `range(start, end)` — Generate number range
- `abs(n)`, `floor(n)`, `ceil(n)`, `round(n)` — Math functions
- `min(...)`, `max(...)` — Min/max of arguments
- `random()` — Random float 0-1
- `split(str, delim)` — Split string
- `join(array, delim)` — Join array to string
- `map(array, fn)`, `filter(array, fn)`, `reduce(array, fn, init)` — Higher-order functions
- `keys(object)`, `values(object)` — Object utilities

## Comments
```
// Single-line comment

/* 
  Multi-line
  comment
*/
```

## Import System
```
import {sqrt, PI} from "math"
```

## Error Handling
All errors include:
- Error type (Syntax, Runtime, Type)
- Line and column numbers
- Helpful hint message suggesting the fix
