/**
 * Rule: unused-variables
 * Detect variables declared with let/const but never read.
 */

import { Program, Statement, Expression } from '../../types/ast';
import { Diagnostic } from '../linter';

export function unusedVariablesRule(program: Program, _source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declarations: Map<string, { line: number; column: number; scope: number }> = new Map();
  const references: Set<string> = new Set();

  function walkStatements(statements: Statement[], _scopeLevel: number): void {
    for (const stmt of statements) {
      walkStatement(stmt, _scopeLevel);
    }
  }

  function walkStatement(stmt: Statement, scopeLevel: number): void {
    switch (stmt.type) {
      case 'VariableDeclaration':
        declarations.set(stmt.name, {
          line: stmt.position.line,
          column: stmt.position.column,
          scope: scopeLevel,
        });
        walkExpression(stmt.value);
        break;
      case 'FunctionDeclaration':
        // Function name is a declaration but it is used as a reference too typically
        declarations.set(stmt.name, {
          line: stmt.position.line,
          column: stmt.position.column,
          scope: scopeLevel,
        });
        walkStatements(stmt.body, scopeLevel + 1);
        break;
      case 'ClassDeclaration':
        declarations.set(stmt.name, {
          line: stmt.position.line,
          column: stmt.position.column,
          scope: scopeLevel,
        });
        for (const m of stmt.methods) {
          walkStatements(m.body, scopeLevel + 1);
        }
        for (const p of stmt.properties) {
          walkExpression(p.value);
        }
        break;
      case 'ReturnStatement':
        if (stmt.value) walkExpression(stmt.value);
        break;
      case 'IfStatement':
        walkExpression(stmt.condition);
        walkStatements(stmt.consequent, scopeLevel + 1);
        if (stmt.alternate) {
          if (Array.isArray(stmt.alternate)) {
            walkStatements(stmt.alternate, scopeLevel + 1);
          } else {
            walkStatement(stmt.alternate, scopeLevel);
          }
        }
        break;
      case 'WhileStatement':
        walkExpression(stmt.condition);
        walkStatements(stmt.body, scopeLevel + 1);
        break;
      case 'ForStatement':
        // The loop variable is a usage context - don't flag it
        references.add(stmt.variable);
        walkExpression(stmt.iterable);
        walkStatements(stmt.body, scopeLevel + 1);
        break;
      case 'ExpressionStatement':
        walkExpression(stmt.expression);
        break;
      case 'PrintStatement':
        for (const e of stmt.expressions) walkExpression(e);
        break;
      case 'MatchStatement':
        walkExpression(stmt.subject);
        for (const c of stmt.cases) {
          walkExpression(c.pattern);
          walkStatements(c.body, scopeLevel + 1);
        }
        if (stmt.defaultCase) walkStatements(stmt.defaultCase, scopeLevel + 1);
        break;
      case 'ImportStatement':
        for (const name of stmt.names) {
          declarations.set(name, {
            line: stmt.position.line,
            column: stmt.position.column,
            scope: scopeLevel,
          });
        }
        break;
      case 'TestDeclaration':
        walkExpression(stmt.description);
        walkStatements(stmt.body, scopeLevel + 1);
        break;
      case 'BreakStatement':
      case 'ContinueStatement':
        break;
    }
  }

  function walkExpression(expr: Expression): void {
    switch (expr.type) {
      case 'Identifier':
        references.add(expr.name);
        break;
      case 'BinaryExpression':
        walkExpression(expr.left);
        walkExpression(expr.right);
        break;
      case 'UnaryExpression':
        walkExpression(expr.operand);
        break;
      case 'LogicalExpression':
        walkExpression(expr.left);
        walkExpression(expr.right);
        break;
      case 'AssignmentExpression':
        walkExpression(expr.target);
        walkExpression(expr.value);
        break;
      case 'CallExpression':
        walkExpression(expr.callee);
        for (const a of expr.args) walkExpression(a);
        break;
      case 'MemberExpression':
        walkExpression(expr.object);
        break;
      case 'IndexExpression':
        walkExpression(expr.object);
        walkExpression(expr.index);
        break;
      case 'ArrayLiteral':
        for (const e of expr.elements) walkExpression(e);
        break;
      case 'ObjectLiteral':
        for (const p of expr.properties) walkExpression(p.value);
        break;
      case 'ArrowFunction':
        if (Array.isArray(expr.body)) {
          walkStatements(expr.body, 0);
        } else {
          walkExpression(expr.body);
        }
        break;
      case 'FunctionExpression':
        walkStatements(expr.body, 0);
        break;
      case 'NewExpression':
        walkExpression(expr.callee);
        for (const a of expr.args) walkExpression(a);
        break;
      case 'SpreadExpression':
        walkExpression(expr.argument);
        break;
      case 'TernaryExpression':
        walkExpression(expr.condition);
        walkExpression(expr.consequent);
        walkExpression(expr.alternate);
        break;
      case 'RangeExpression':
        walkExpression(expr.start);
        walkExpression(expr.end);
        break;
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
      case 'NullLiteral':
      case 'ThisExpression':
        break;
    }
  }

  walkStatements(program.body, 0);

  for (const [name, info] of declarations) {
    if (!references.has(name)) {
      diagnostics.push({
        rule: 'unused-variables',
        severity: 'warning',
        message: `Variable '${name}' is declared but never used`,
        line: info.line,
        column: info.column,
      });
    }
  }

  return diagnostics;
}
