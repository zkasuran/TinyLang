/**
 * TinyLang Abstract Syntax Tree (AST) Node Types
 * 
 * The AST represents the hierarchical structure of a TinyLang program.
 * Each node type corresponds to a syntactic construct in the language.
 */

import { SourcePosition } from './tokens';

// Base interface for all AST nodes
export interface BaseNode {
  type: string;
  position: SourcePosition;
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
}

export interface MatchCase {
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
