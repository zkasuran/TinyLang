# Error Handling Standards

## Error Classes

TinyLang uses typed error classes with source position information:

| Class | Module | Purpose |
|-------|--------|---------|
| `LexerError` | Lexer | Invalid characters, unterminated strings, malformed numbers |
| `ParseError` | Parser | Syntax errors, unexpected tokens, missing delimiters |
| `RuntimeError` | Interpreter/VM | Type errors, undefined variables, division by zero |
| `CompilerError` | Compiler | Invalid AST nodes, unsupported operations |

## Error Structure

All errors carry:
- `message`: Human-readable description
- `position`: `{ line: number, column: number }` for source mapping
- `hint` (optional): Suggestion for how to fix the error

## Error Messages

### Guidelines

1. **Be specific**: "Expected ')' after function arguments" not "Syntax error"
2. **Include context**: Show what was found vs what was expected
3. **Suggest fixes**: Use "Did you mean?" for typo suggestions
4. **Show location**: Always include line and column numbers

### Format

```
Error at line {line}, column {col}: {message}
  |
{line} | {source_line}
  |     {pointer}
  
Hint: {suggestion}
```

## Error Recovery

### Lexer
- Skip invalid characters and continue tokenizing
- Report all errors, not just the first one

### Parser
- Synchronize at statement boundaries after errors
- Continue parsing to find additional errors
- Never enter infinite loops on malformed input

### Interpreter
- Catch RuntimeErrors and display with full stack trace
- Show the call stack at the point of failure
- Clean up resources (environments) even on error

## "Did You Mean?" Suggestions

When an undefined variable is referenced:
1. Compute Levenshtein distance to all variables in scope
2. Suggest variables within distance 2
3. Format: `Did you mean '{closest}'?`

## User-Facing Error Quality

- Errors should help beginners understand what went wrong
- Avoid jargon (say "function" not "callable")
- Test error messages as part of the test suite
- Every error path should have a test verifying the message
