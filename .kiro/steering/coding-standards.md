# Coding Standards

## TypeScript Guidelines
- Strict mode enabled (`strict: true` in tsconfig)
- No `any` types — use proper generics or union types
- All public methods must have JSDoc comments
- Use `readonly` for immutable properties
- Prefer `interface` over `type` for object shapes
- Use `enum` only for finite, well-known sets (like TokenType)

## Error Handling Philosophy
TinyLang targets beginners. Every error message must:
1. Say WHAT went wrong (clear, jargon-free language)
2. Say WHERE it happened (line and column)
3. Suggest HOW to fix it (a "hint" with the correct syntax)

Example:
```
❌ Syntax Error at line 3, column 5: Expected ')' after function arguments

  3 | fn add(a, b {
    |             ^

💡 Hint: Function parameters must be enclosed in parentheses. Try: fn add(a, b) {
```

## Testing Standards
- Every module must have corresponding unit tests
- Test file naming: `<module>.test.ts`
- Use descriptive `describe` blocks and `it` labels
- Test both success cases AND error cases
- Integration tests go in `tests/integration/`

## Naming Conventions
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces: `PascalCase` (no `I` prefix)
- Enums: `PascalCase` with `UPPER_SNAKE_CASE` members

## Import Order
1. Node.js built-ins
2. Third-party packages
3. Internal types
4. Internal modules (relative paths)

## Documentation
- All exported functions/classes need JSDoc
- Complex algorithms get inline comments explaining the approach
- README sections: Overview, Installation, Quick Start, Language Reference, Architecture, Contributing
