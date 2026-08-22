/**
 * Rule: no-shadow
 * Detect when an inner scope variable has the same name as an outer scope variable.
 */

import { Program, Statement, Expression } from '../../types/ast';
import { Diagnostic } from '../linter';

export function noShadowRule(program: Program, _source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  function walkStatements(statements: Statement[], scope: Set<string>[]): void {
    for (const stmt of statements) {
      walkStatement(stmt, scope);
    }
  }

  function walkStatement(stmt: Statement, scope: Set<string>[]): void {
    switch (stmt.type) {
      case 'VariableDeclaration': {
        checkShadow(stmt.name, stmt.position.line, stmt.position.column, scope);
        addToCurrentScope(stmt.name, scope);
        walkExpression(stmt.value, scope);
        break;
      }
      case 'FunctionDeclaration': {
        addToCurrentScope(stmt.name, scope);
        const innerScope = new Set<string>();
        // Add params to inner scope
        for (const p of stmt.params) {
          innerScope.add(p.name);
        }
        walkStatements(stmt.body, [...scope, innerScope]);
        break;
      }
      case 'ClassDeclaration': {
        addToCurrentScope(stmt.name, scope);
        for (const m of stmt.methods) {
          const innerScope = new Set<string>();
          for (const p of m.params) {
            innerScope.add(p.name);
          }
          walkStatements(m.body, [...scope, innerScope]);
        }
        break;
      }
      case 'IfStatement': {
        walkExpression(stmt.condition, scope);
        const ifScope = new Set<string>();
        walkStatements(stmt.consequent, [...scope, ifScope]);
        if (stmt.alternate) {
          if (Array.isArray(stmt.alternate)) {
            const elseScope = new Set<string>();
            walkStatements(stmt.alternate, [...scope, elseScope]);
          } else {
            walkStatement(stmt.alternate, scope);
          }
        }
        break;
      }
      case 'WhileStatement': {
        walkExpression(stmt.condition, scope);
        const whileScope = new Set<string>();
        walkStatements(stmt.body, [...scope, whileScope]);
        break;
      }
      case 'ForStatement': {
        walkExpression(stmt.iterable, scope);
        const forScope = new Set<string>();
        checkShadow(stmt.variable, stmt.position.line, stmt.position.column, scope);
        forScope.add(stmt.variable);
        walkStatements(stmt.body, [...scope, forScope]);
        break;
      }
      case 'ReturnStatement':
        if (stmt.value) walkExpression(stmt.value, scope);
        break;
      case 'ExpressionStatement':
        walkExpression(stmt.expression, scope);
        break;
      case 'PrintStatement':
        for (const e of stmt.expressions) walkExpression(e, scope);
        break;
      case 'MatchStatement':
        walkExpression(stmt.subject, scope);
        for (const c of stmt.cases) {
          walkExpression(c.pattern, scope);
          const caseScope = new Set<string>();
          walkStatements(c.body, [...scope, caseScope]);
        }
        if (stmt.defaultCase) {
          const defaultScope = new Set<string>();
          walkStatements(stmt.defaultCase, [...scope, defaultScope]);
        }
        break;
      case 'TestDeclaration': {
        walkExpression(stmt.description, scope);
        const testScope = new Set<string>();
        walkStatements(stmt.body, [...scope, testScope]);
        break;
      }
      default:
        break;
    }
  }

  function walkExpression(expr: Expression, scope: Set<string>[]): void {
    switch (expr.type) {
      case 'ArrowFunction': {
        const innerScope = new Set<string>();
        for (const p of expr.params) {
          innerScope.add(p.name);
        }
        if (Array.isArray(expr.body)) {
          walkStatements(expr.body, [...scope, innerScope]);
        } else {
          walkExpression(expr.body, [...scope, innerScope]);
        }
        break;
      }
      case 'FunctionExpression': {
        const innerScope = new Set<string>();
        for (const p of expr.params) {
          innerScope.add(p.name);
        }
        walkStatements(expr.body, [...scope, innerScope]);
        break;
      }
      case 'BinaryExpression':
        walkExpression(expr.left, scope);
        walkExpression(expr.right, scope);
        break;
      case 'UnaryExpression':
        walkExpression(expr.operand, scope);
        break;
      case 'LogicalExpression':
        walkExpression(expr.left, scope);
        walkExpression(expr.right, scope);
        break;
      case 'AssignmentExpression':
        walkExpression(expr.target, scope);
        walkExpression(expr.value, scope);
        break;
      case 'CallExpression':
        walkExpression(expr.callee, scope);
        for (const a of expr.args) walkExpression(a, scope);
        break;
      case 'MemberExpression':
        walkExpression(expr.object, scope);
        break;
      case 'IndexExpression':
        walkExpression(expr.object, scope);
        walkExpression(expr.index, scope);
        break;
      case 'ArrayLiteral':
        for (const e of expr.elements) walkExpression(e, scope);
        break;
      case 'ObjectLiteral':
        for (const p of expr.properties) walkExpression(p.value, scope);
        break;
      case 'NewExpression':
        walkExpression(expr.callee, scope);
        for (const a of expr.args) walkExpression(a, scope);
        break;
      case 'SpreadExpression':
        walkExpression(expr.argument, scope);
        break;
      case 'TernaryExpression':
        walkExpression(expr.condition, scope);
        walkExpression(expr.consequent, scope);
        walkExpression(expr.alternate, scope);
        break;
      case 'RangeExpression':
        walkExpression(expr.start, scope);
        walkExpression(expr.end, scope);
        break;
      default:
        break;
    }
  }

  function checkShadow(name: string, line: number, column: number, scope: Set<string>[]): void {
    // Check all outer scopes (not the current innermost scope)
    for (let i = 0; i < scope.length; i++) {
      if (scope[i].has(name)) {
        diagnostics.push({
          rule: 'no-shadow',
          severity: 'warning',
          message: `Variable '${name}' shadows a variable in an outer scope`,
          line,
          column,
        });
        return;
      }
    }
  }

  function addToCurrentScope(name: string, scope: Set<string>[]): void {
    if (scope.length > 0) {
      scope[scope.length - 1].add(name);
    }
  }

  const topScope = new Set<string>();
  walkStatements(program.body, [topScope]);

  return diagnostics;
}
