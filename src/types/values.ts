/**
 * TinyLang Runtime Values
 * 
 * These types represent values at runtime during interpretation.
 * Every expression evaluates to one of these value types.
 */

import { Statement, Parameter } from './ast';

export type RuntimeValue =
  | NumberValue
  | StringValue
  | BooleanValue
  | NullValue
  | ArrayValue
  | ObjectValue
  | FunctionValue
  | NativeFunctionValue
  | ClassValue
  | InstanceValue;

export interface NumberValue {
  type: 'number';
  value: number;
}

export interface StringValue {
  type: 'string';
  value: string;
}

export interface BooleanValue {
  type: 'boolean';
  value: boolean;
}

export interface NullValue {
  type: 'null';
  value: null;
}

export interface ArrayValue {
  type: 'array';
  elements: RuntimeValue[];
}

export interface ObjectValue {
  type: 'object';
  properties: Map<string, RuntimeValue>;
}

export interface FunctionValue {
  type: 'function';
  name: string;
  params: Parameter[];
  body: Statement[];
  closure: Environment;
}

export type NativeFunction = (args: RuntimeValue[], env: Environment) => RuntimeValue;

export interface NativeFunctionValue {
  type: 'native-function';
  name: string;
  arity: number; // -1 means variadic
  fn: NativeFunction;
}

export interface ClassValue {
  type: 'class';
  name: string;
  superClass: ClassValue | null;
  methods: Map<string, FunctionValue>;
  properties: Map<string, RuntimeValue>;
}

export interface InstanceValue {
  type: 'instance';
  className: string;
  classRef: ClassValue;
  properties: Map<string, RuntimeValue>;
}

// ============ Environment ============

export class Environment {
  private variables: Map<string, RuntimeValue> = new Map();
  private constants: Set<string> = new Set();
  public parent: Environment | null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  /**
   * Define a new variable in the current scope
   */
  define(name: string, value: RuntimeValue, constant: boolean = false): void {
    if (this.variables.has(name)) {
      throw new RuntimeError(`Variable '${name}' is already declared in this scope`);
    }
    this.variables.set(name, value);
    if (constant) {
      this.constants.add(name);
    }
  }

  /**
   * Assign a new value to an existing variable
   */
  assign(name: string, value: RuntimeValue): RuntimeValue {
    if (this.variables.has(name)) {
      if (this.constants.has(name)) {
        throw new RuntimeError(`Cannot reassign constant '${name}'`);
      }
      this.variables.set(name, value);
      return value;
    }
    if (this.parent) {
      return this.parent.assign(name, value);
    }
    const suggestion = this.findSimilar(name);
    const hint = suggestion
      ? `Did you mean '${suggestion}'?`
      : `Did you forget to declare it with 'let' or 'const'?`;
    throw new RuntimeError(`Variable '${name}' is not defined. ${hint}`);
  }

  /**
   * Look up a variable's value, traversing up the scope chain
   */
  lookup(name: string): RuntimeValue {
    if (this.variables.has(name)) {
      return this.variables.get(name)!;
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    // Generate "Did you mean?" suggestion
    throw new RuntimeError(undefinedVariableMessage(name, this.getAllNames()));
  }

  /**
   * Check if a variable exists in any reachable scope
   */
  has(name: string): boolean {
    if (this.variables.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }

  /**
   * Create a child environment
   */
  createChild(): Environment {
    return new Environment(this);
  }

  /**
   * Get all variables defined in this environment (not including parent scopes)
   * Used by the VM to extract stdlib globals after registration.
   */
  getAll(): Map<string, RuntimeValue> {
    return new Map(this.variables);
  }

  /**
   * Collect all variable names from this scope and all parent scopes
   */
  private getAllNames(): string[] {
    const names = Array.from(this.variables.keys());
    if (this.parent) {
      names.push(...this.parent.getAllNames());
    }
    return names;
  }

  /**
   * Find the most similar variable name using Levenshtein distance.
   * Returns null if no good match is found (distance > 3).
   */
  private findSimilar(name: string): string | null {
    return suggestSimilarName(name, this.getAllNames());
  }
}

// ============ Errors ============

export class RuntimeError extends Error {
  constructor(
    message: string,
    public line?: number,
    public column?: number,
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

/**
 * Find the name in `candidates` closest to `name`, or null if none is within a
 * Levenshtein distance of 3. Ties go to the first candidate seen, so the caller
 * controls the outcome through candidate order.
 *
 * Shared so the VM can produce byte-identical "Did you mean?" hints to the
 * interpreter's; the VM keeps globals in a plain Map rather than an Environment
 * and previously reported undefined variables with no hint at all.
 */
export function suggestSimilarName(name: string, candidates: Iterable<string>): string | null {
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const dist = levenshteinDistance(name.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDistance && dist <= 3) {
      bestDistance = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * The message both engines use for a variable that is not in scope. Kept in one
 * place because the two used to word it differently.
 */
export function undefinedVariableMessage(
  name: string,
  candidates: Iterable<string>
): string {
  const suggestion = suggestSimilarName(name, candidates);
  const hint = suggestion
    ? `Did you mean '${suggestion}'?`
    : `Did you forget to declare it with 'let' or 'const'?`;
  return `Variable '${name}' is not defined. ${hint}`;
}

/**
 * Raised when the step budget is exhausted.
 *
 * Deliberately a distinct class so that both engines can refuse to let a
 * `try`/`catch` inside the runaway code catch it. A handler sitting inside the
 * offending loop would otherwise swallow the limit and the loop would spin
 * forever, which is the exact failure the limit exists to prevent.
 *
 * Shared by the tree-walk interpreter and the VM so that the two agree on both
 * the class and the message.
 */
export class StepLimitExceeded extends RuntimeError {
  constructor(message: string, line?: number, column?: number) {
    super(message, line, column);
    this.name = 'StepLimitExceeded';
  }
}

export class BreakSignal {
  readonly type = 'break';
}

export class ContinueSignal {
  readonly type = 'continue';
}

export class ReturnSignal {
  readonly type = 'return';
  constructor(public value: RuntimeValue) {}
}

// ============ Helper Functions ============

export function createNumber(value: number): NumberValue {
  return { type: 'number', value };
}

export function createString(value: string): StringValue {
  return { type: 'string', value };
}

export function createBoolean(value: boolean): BooleanValue {
  return { type: 'boolean', value };
}

export function createNull(): NullValue {
  return { type: 'null', value: null };
}

export function createArray(elements: RuntimeValue[]): ArrayValue {
  return { type: 'array', elements };
}

export function createObject(properties: Map<string, RuntimeValue>): ObjectValue {
  return { type: 'object', properties };
}

export function isTruthy(value: RuntimeValue): boolean {
  switch (value.type) {
    case 'null': return false;
    case 'boolean': return value.value;
    case 'number': return value.value !== 0;
    case 'string': return value.value.length > 0;
    case 'array': return value.elements.length > 0;
    default: return true;
  }
}

export function stringify(value: RuntimeValue): string {
  // The VM represents a user-defined function as a closure object tagged
  // 'vm-closure'. It is not part of the RuntimeValue union but it does reach
  // print, where it used to render as '<unknown>' while the interpreter
  // rendered the same function as '<fn name>'.
  const asClosure = value as unknown as { type?: string; fn?: { name?: string } };
  if (asClosure.type === 'vm-closure') {
    return `<fn ${asClosure.fn?.name ?? '<anonymous>'}>`;
  }
  switch (value.type) {
    case 'null': return 'null';
    case 'number': return String(value.value);
    case 'string': return value.value;
    case 'boolean': return String(value.value);
    case 'array':
      return '[' + value.elements.map(stringify).join(', ') + ']';
    case 'object': {
      const entries = Array.from(value.properties.entries())
        .map(([k, v]) => `${k}: ${stringify(v)}`);
      return '{' + entries.join(', ') + '}';
    }
    case 'function':
      return `<fn ${value.name}>`;
    case 'native-function':
      return `<native fn ${value.name}>`;
    case 'class':
      return `<class ${value.name}>`;
    case 'instance':
      return `<${value.className} instance>`;
    default:
      return '<unknown>';
  }
}

export function valueEquals(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'null': return true;
    case 'number': return a.value === (b as NumberValue).value;
    case 'string': return a.value === (b as StringValue).value;
    case 'boolean': return a.value === (b as BooleanValue).value;
    case 'array': {
      const bArr = b as ArrayValue;
      if (a.elements.length !== bArr.elements.length) return false;
      return a.elements.every((el, i) => valueEquals(el, bArr.elements[i]));
    }
    default: return a === b; // Reference equality for objects, functions, etc.
  }
}

/**
 * Compute the Levenshtein distance between two strings.
 * Used for "Did you mean?" suggestions in error messages.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}
