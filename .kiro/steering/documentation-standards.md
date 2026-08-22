# Documentation Standards

## Overview

TinyLang documentation serves three audiences:
1. **Users**: Language learners who want to write TinyLang programs
2. **Contributors**: Developers who want to improve the toolchain
3. **Evaluators**: Judges and reviewers assessing the project quality

## Documentation Locations

| Location | Audience | Content |
|----------|----------|---------|
| `README.md` | Everyone | Overview, quick start, feature highlights |
| `docs/` | Users | Language reference, stdlib API, tutorials |
| `.kiro/specs/` | Contributors | Technical specifications and design docs |
| `.kiro/steering/` | Contributors | Development standards and guidelines |
| Code comments | Contributors | Implementation notes, algorithm explanations |
| `examples/` | Users | Working code examples with comments |

## Writing Style

- Use clear, concise English
- Write in present tense ("The parser produces an AST")
- Use active voice ("The VM executes instructions")
- Avoid jargon unless defining it
- Include code examples for every feature
- Use consistent formatting across all docs

## Code Examples

Every documented feature must include:
1. A minimal example showing basic usage
2. A practical example showing real-world application
3. Expected output (where applicable)

Format:
```
// Description of what the code does
let example = "code here"
print(example)  // Output: code here
```

## API Documentation

For stdlib functions, document:
- **Signature**: `functionName(param1: type, param2: type) -> returnType`
- **Description**: One-sentence summary
- **Parameters**: Each parameter with type and purpose
- **Returns**: What the function returns
- **Example**: Working code snippet
- **Notes**: Edge cases, errors thrown, limitations

## README Structure

The README should include:
1. Project name and tagline
2. Feature overview table
3. Quick start (3 steps max)
4. Code example showing language highlights
5. Architecture diagram or overview
6. CLI command reference
7. Links to detailed docs
8. Contributing section
9. License

## Keeping Docs Updated

- Update docs when changing features
- Run all examples to verify they still work
- Version-stamp the docs (show which release they apply to)
- Link between related docs (cross-reference)
