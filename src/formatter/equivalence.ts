/**
 * Structural AST equivalence.
 *
 * Used by the formatter to prove that formatted output means exactly what the
 * input meant. Two ASTs are equivalent when they are identical after ignoring
 * source positions (which necessarily move when whitespace changes) and after
 * treating an explicitly-undefined property as an absent one (the parser sets
 * `superClass`, `defaultCase` and `defaultValue` only sometimes).
 *
 * Nothing else is ignored. In particular node types, operators, the `constant`
 * flag of a declaration, the `inclusive` flag of a range, property keys and the
 * order of every list are all compared, because every one of them changes what
 * a program does.
 */

/** Keys that legitimately differ between two spellings of the same program. */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['position']);

const MAX_SNIPPET = 220;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Significant keys of a node, sorted, with undefined-valued keys dropped. */
function significantKeys(node: Record<string, unknown>): string[] {
  return Object.keys(node)
    .filter((k) => !IGNORED_KEYS.has(k) && node[k] !== undefined)
    .sort();
}

/** A short, position-free rendering of a subtree, for error messages. */
function snippet(value: unknown): string {
  const text = JSON.stringify(value, (key, v) =>
    IGNORED_KEYS.has(key) ? undefined : v
  );
  if (text === undefined) return String(value);
  return text.length > MAX_SNIPPET ? text.slice(0, MAX_SNIPPET) + '…' : text;
}

/**
 * Find the first structural difference between two ASTs.
 *
 * Returns a human-readable description of where they diverge, or null when they
 * are equivalent. The path is reported so that a failure names the construct
 * that was mishandled instead of just asserting that something, somewhere, is
 * wrong.
 */
export function astDifference(
  expected: unknown,
  actual: unknown,
  path = '$'
): string | null {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return `${path}: expected ${snippet(expected)}, got ${snippet(actual)}`;
    }
    if (expected.length !== actual.length) {
      return (
        `${path}: expected ${expected.length} item(s), got ${actual.length}\n` +
        `  before: ${snippet(expected)}\n` +
        `  after:  ${snippet(actual)}`
      );
    }
    for (let i = 0; i < expected.length; i++) {
      const diff = astDifference(expected[i], actual[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (isPlainObject(expected) || isPlainObject(actual)) {
    if (!isPlainObject(expected) || !isPlainObject(actual)) {
      return `${path}: expected ${snippet(expected)}, got ${snippet(actual)}`;
    }
    const expectedKeys = significantKeys(expected);
    const actualKeys = significantKeys(actual);
    if (expectedKeys.join(',') !== actualKeys.join(',')) {
      return (
        `${path}: property set differs\n` +
        `  before: ${expectedKeys.join(', ')}\n` +
        `  after:  ${actualKeys.join(', ')}`
      );
    }
    for (const key of expectedKeys) {
      const diff = astDifference(expected[key], actual[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }

  if (expected !== actual) {
    return `${path}: expected ${snippet(expected)}, got ${snippet(actual)}`;
  }
  return null;
}

/** Whether two ASTs are structurally equivalent. */
export function astEquivalent(expected: unknown, actual: unknown): boolean {
  return astDifference(expected, actual) === null;
}
