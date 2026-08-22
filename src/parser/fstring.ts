/**
 * f-string splitting.
 *
 * The lexer stores an f-string as a single FSTRING token whose value is the raw
 * text between the quotes, with `{...}` interpolations left intact. Splitting
 * that text into literal runs and interpolated expression sources is needed in
 * two places - the parser, to build the AST, and the formatter's comment check,
 * to see comments written inside an interpolation - so the rules live here
 * rather than being spelled out twice.
 */

/** One piece of a split f-string: literal text, or the source of a `{...}`. */
export type RawInterpolatedPart =
  | { kind: 'literal'; value: string }
  | { kind: 'expression'; source: string };

/**
 * Split the raw text of an f-string.
 *
 * `\{` is an escaped brace and contributes a literal `{`. Otherwise `{` opens an
 * interpolation that runs to its matching `}`, counting nesting so that an
 * object literal inside an interpolation does not end it early. An unterminated
 * interpolation is returned as an expression part containing whatever was there;
 * the lexer has already rejected that case, so this only decides what happens to
 * input the lexer could not have produced.
 */
export function splitInterpolatedString(raw: string): RawInterpolatedPart[] {
  const parts: RawInterpolatedPart[] = [];
  let literal = '';
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === '\\' && i + 1 < raw.length && raw[i + 1] === '{') {
      literal += '{';
      i += 2;
    } else if (raw[i] === '{') {
      if (literal.length > 0) {
        parts.push({ kind: 'literal', value: literal });
        literal = '';
      }
      i++; // skip the opening brace
      let depth = 1;
      let source = '';
      while (i < raw.length && depth > 0) {
        if (raw[i] === '{') depth++;
        else if (raw[i] === '}') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        source += raw[i];
        i++;
      }
      parts.push({ kind: 'expression', source });
    } else {
      literal += raw[i];
      i++;
    }
  }

  if (literal.length > 0) {
    parts.push({ kind: 'literal', value: literal });
  }

  return parts;
}
