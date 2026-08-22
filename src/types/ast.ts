/**
 * TinyLang Abstract Syntax Tree (AST) Node Types
 * 
 * The AST represents the hierarchical structure of a TinyLang program.
 * Each node type corresponds to a syntactic construct in the language.
 */

import { SourcePosition, CommentKind } from './tokens';

// ============ Comments ============

/**
 * A comment, attached to the construct it belongs to.
 *
 * Comments are not part of a program's meaning, which is exactly why they were
 * easy to lose: the formatter renders from the AST, and until these fields
 * existed there was nowhere for a comment to be. `text` is verbatim - including
 * the `//` or `/*` delimiters and, for a block comment, its internal newlines -
 * so that formatting can reproduce it character for character.
 */
export interface Comment {
  kind: CommentKind;
  /** Verbatim source text, including delimiters. */
  text: string;
  /** True when the comment occupied its own line in the source. */
  ownLine: boolean;
  /** True when the author left at least one blank line above the comment. */
  blankBefore: boolean;
  /**
   * Zero-based column the comment started at in the source.
   *
   * A block comment's continuation lines are shifted by however far its first
   * line moves, which needs the column it moved *from*. Shifting every line by
   * the same amount is what makes the interior survive: shift them by different
   * amounts and a diagram, an indented example, or a closing delimiter on a line
   * of its own comes out sheared - and, because the formatter's comment check
   * compares relative indentation exactly, the whole file is then refused.
   */
  indent: number;
}

/**
 * Somewhere a comment can be anchored.
 *
 * Statements are the natural anchor and get these fields through BaseNode, but
 * a few constructs that comments demonstrably attach to are not nodes at all -
 * a `when` arm of a match, a variant of an enum - so they carry an anchor too.
 *
 * All three fields are optional and absent unless a comment or blank line was
 * actually there, which keeps them invisible to anything that does not look for
 * them. `src/formatter/equivalence.ts` ignores them: a comment must not make two
 * programs count as different in the formatter's meaning-preservation check,
 * because comments are verified separately and by text.
 */
export interface CommentAnchor {
  /** Own-line comments immediately above, in source order. */
  leadingComments?: Comment[];
  /**
   * Comments after the construct: the first on the same line when it did not
   * occupy its own line in the source, the rest on lines of their own.
   */
  trailingComments?: Comment[];
  /** True when the author left at least one blank line above. */
  blankBefore?: boolean;
}

/**
 * Comments inside a construct that has no statement to hang them on, keyed by
 * the region they were found in ('body', 'consequent', 'alternate', ...).
 *
 * Only an *empty* region needs this. In a region with statements, a comment
 * either precedes one (leading), follows one on its line (trailing) or comes
 * after the last of them (trailing, own-line). A `catch` block whose whole body is
 * a comment explaining why the error is ignored is the case that would otherwise
 * have nowhere to put it.
 */
export type DanglingComments = Record<string, Comment[]>;

// Base interface for all AST nodes
export interface BaseNode extends CommentAnchor {
  type: string;
  position: SourcePosition;
  danglingComments?: DanglingComments;
}

// ============ Program ============
export interface Program extends BaseNode {
  type: 'Program';
  body: Statement[];
}

// ============ Statements ============
export type Statement =
  | VariableDeclaration
  | DestructuringDeclaration
  | FunctionDeclaration
  | ClassDeclaration
  | EnumDeclaration
  | ReturnStatement
  | IfStatement
  | WhileStatement
  | ForStatement
  | BreakStatement
  | ContinueStatement
  | ExpressionStatement
  | PrintStatement
  | ImportStatement
  | MatchStatement
  | TestDeclaration
  | TryCatchStatement
  | ThrowStatement;

export interface VariableDeclaration extends BaseNode {
  type: 'VariableDeclaration';
  name: string;
  value: Expression;
  constant: boolean;
}

export interface DestructuringDeclaration extends BaseNode {
  type: 'DestructuringDeclaration';
  pattern: DestructurePattern;
  value: Expression;
  constant: boolean;
}

export type DestructurePattern =
  | { kind: 'array'; names: string[] }
  | { kind: 'object'; names: string[] };

export interface FunctionDeclaration extends BaseNode {
  type: 'FunctionDeclaration';
  name: string;
  params: Parameter[];
  body: Statement[];
  returnType?: string;
}

export interface Parameter {
  name: string;
  defaultValue?: Expression;
}

export interface ClassDeclaration extends BaseNode {
  type: 'ClassDeclaration';
  name: string;
  superClass?: string;
  methods: FunctionDeclaration[];
  properties: VariableDeclaration[];
}

export interface ReturnStatement extends BaseNode {
  type: 'ReturnStatement';
  value: Expression | null;
}

export interface IfStatement extends BaseNode {
  type: 'IfStatement';
  condition: Expression;
  consequent: Statement[];
  alternate: Statement[] | IfStatement | null;
}

export interface WhileStatement extends BaseNode {
  type: 'WhileStatement';
  condition: Expression;
  body: Statement[];
}

export interface ForStatement extends BaseNode {
  type: 'ForStatement';
  variable: string;
  iterable: Expression;
  body: Statement[];
}

export interface BreakStatement extends BaseNode {
  type: 'BreakStatement';
}

export interface ContinueStatement extends BaseNode {
  type: 'ContinueStatement';
}

export interface ExpressionStatement extends BaseNode {
  type: 'ExpressionStatement';
  expression: Expression;
}

export interface PrintStatement extends BaseNode {
  type: 'PrintStatement';
  expressions: Expression[];
}

export interface ImportStatement extends BaseNode {
  type: 'ImportStatement';
  names: string[];
  source: string;
}

export interface MatchStatement extends BaseNode {
  type: 'MatchStatement';
  subject: Expression;
  cases: MatchCase[];
  defaultCase?: Statement[];
  /** Comments attached to the `else =>` arm, which is not a node of its own. */
  defaultComments?: CommentAnchor;
}

/** A `when <pattern> => <body>` arm. Not a node, but comments attach to it. */
export interface MatchCase extends CommentAnchor {
  pattern: Expression;
  body: Statement[];
}

export interface TestDeclaration extends BaseNode {
  type: 'TestDeclaration';
  description: Expression;
  body: Statement[];
}

export interface TryCatchStatement extends BaseNode {
  type: 'TryCatchStatement';
  tryBody: Statement[];
  catchVariable: string;
  catchBody: Statement[];
}

export interface ThrowStatement extends BaseNode {
  type: 'ThrowStatement';
  value: Expression;
}

export interface EnumDeclaration extends BaseNode {
  type: 'EnumDeclaration';
  name: string;
  variants: string[];
  /**
   * Comments attached to each variant, index-aligned with `variants`.
   *
   * A variant is a bare string, so there is no node to hang a comment on;
   * present only when some variant in the enum carries one, and then it has
   * exactly as many entries as `variants`.
   */
  variantComments?: CommentAnchor[];
}

// ============ Expressions ============
export type Expression =
  | NumberLiteral
  | StringLiteral
  | InterpolatedString
  | BooleanLiteral
  | NullLiteral
  | ArrayLiteral
  | ObjectLiteral
  | Identifier
  | BinaryExpression
  | UnaryExpression
  | LogicalExpression
  | AssignmentExpression
  | CallExpression
  | MemberExpression
  | IndexExpression
  | FunctionExpression
  | ArrowFunction
  | NewExpression
  | ThisExpression
  | SpreadExpression
  | TernaryExpression
  | RangeExpression
  | PipeExpression
  | PipeMethodExpression
  | OptionalMemberExpression
  | OptionalIndexExpression
  | NullishCoalesceExpression;

export interface NumberLiteral extends BaseNode {
  type: 'NumberLiteral';
  value: number;
}

export interface StringLiteral extends BaseNode {
  type: 'StringLiteral';
  value: string;
}

export interface InterpolatedString extends BaseNode {
  type: 'InterpolatedString';
  parts: InterpolatedPart[];
}

export type InterpolatedPart =
  | { kind: 'literal'; value: string }
  | { kind: 'expression'; expression: Expression };

export interface BooleanLiteral extends BaseNode {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface NullLiteral extends BaseNode {
  type: 'NullLiteral';
}

export interface ArrayLiteral extends BaseNode {
  type: 'ArrayLiteral';
  elements: Expression[];
}

export interface ObjectLiteral extends BaseNode {
  type: 'ObjectLiteral';
  properties: ObjectProperty[];
}

export interface ObjectProperty {
  key: string;
  value: Expression;
}

export interface Identifier extends BaseNode {
  type: 'Identifier';
  name: string;
}

export interface BinaryExpression extends BaseNode {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends BaseNode {
  type: 'UnaryExpression';
  operator: string;
  operand: Expression;
}

export interface LogicalExpression extends BaseNode {
  type: 'LogicalExpression';
  operator: 'and' | 'or';
  left: Expression;
  right: Expression;
}

export interface AssignmentExpression extends BaseNode {
  type: 'AssignmentExpression';
  operator: string;
  target: Expression;
  value: Expression;
}

export interface CallExpression extends BaseNode {
  type: 'CallExpression';
  callee: Expression;
  args: Expression[];
}

export interface MemberExpression extends BaseNode {
  type: 'MemberExpression';
  object: Expression;
  property: string;
}

export interface IndexExpression extends BaseNode {
  type: 'IndexExpression';
  object: Expression;
  index: Expression;
}

export interface FunctionExpression extends BaseNode {
  type: 'FunctionExpression';
  params: Parameter[];
  body: Statement[];
}

export interface ArrowFunction extends BaseNode {
  type: 'ArrowFunction';
  params: Parameter[];
  body: Statement[] | Expression;
}

export interface NewExpression extends BaseNode {
  type: 'NewExpression';
  callee: Expression;
  args: Expression[];
}

export interface ThisExpression extends BaseNode {
  type: 'ThisExpression';
}

export interface SpreadExpression extends BaseNode {
  type: 'SpreadExpression';
  argument: Expression;
}

export interface TernaryExpression extends BaseNode {
  type: 'TernaryExpression';
  condition: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface RangeExpression extends BaseNode {
  type: 'RangeExpression';
  start: Expression;
  end: Expression;
  inclusive: boolean;
}

export interface PipeExpression extends BaseNode {
  type: 'PipeExpression';
  left: Expression;
  right: Expression;
}

export interface PipeMethodExpression extends BaseNode {
  type: 'PipeMethodExpression';
  left: Expression;
  method: string;
  args: Expression[];
}

export interface OptionalMemberExpression extends BaseNode {
  type: 'OptionalMemberExpression';
  object: Expression;
  property: string;
}

export interface OptionalIndexExpression extends BaseNode {
  type: 'OptionalIndexExpression';
  object: Expression;
  index: Expression;
}

export interface NullishCoalesceExpression extends BaseNode {
  type: 'NullishCoalesceExpression';
  left: Expression;
  right: Expression;
}
