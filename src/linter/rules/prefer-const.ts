/**
 * Rule: prefer-const
 * Find variables declared with `let` that are never reassigned.
 * Suggest using `const` instead. Provides auto-fix.
 */

import { Program, Statement, Expression } from '../../types/ast';
import { Diagnostic } from '../linter';

export function preferConstRule(program: Program, source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Collect all let declarations
  const letDeclarations: Map<string, { line: number; column: number; offset: number }> = new Map();
  // Collect all assignment targets
  const assignedNames: Set<string> = new Set();

  function walkStatements(statements: Statement[]): void {
    for (const stmt of statements) {
      walkStatement(stmt);
    }
  }

  function walkStatement(stmt: Statement): void {
    switch (stmt.type) {
      case 'VariableDeclaration':
        if (!stmt.constant) {
          letDeclarations.set(stmt.name, {
            line: stmt.position.line,
            column: stmt.position.column,
            offset: stmt.position.offset,
          });
        }
        walkExpression(stmt.value);
        break;
      case 'FunctionDeclaration':
        walkStatements(stmt.body);
        break;
      case 'ClassDeclaration':
        for (const m of stmt.methods) {
          walkStatements(m.body);
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
        walkStatements(stmt.consequent);
        if (stmt.alternate) {
          if (Array.isArray(stmt.alternate)) {
            walkStatements(stmt.alternate);
          } else {
            walkStatement(stmt.alternate);
          }
        }
        break;
      case 'WhileStatement':
        walkExpression(stmt.condition);
        walkStatements(stmt.body);
        break;
      case 'ForStatement':
        walkExpression(stmt.iterable);
        walkStatements(stmt.body);
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
          walkStatements(c.body);
        }
        if (stmt.defaultCase) walkStatements(stmt.defaultCase);
        break;
      case 'TestDeclaration':
        walkExpression(stmt.description);
        walkStatements(stmt.body);
        break;
      default:
        break;
    }
  }

  function walkExpression(expr: Expression): void {
    switch (expr.type) {
      case 'AssignmentExpression':
        // The target of an assignment is being reassigned
        if (expr.target.type === 'Identifier') {
          assignedNames.add(expr.target.name);
        }
        walkExpression(expr.target);
        walkExpression(expr.value);
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
          walkStatements(expr.body);
        } else {
          walkExpression(expr.body);
        }
        break;
      case 'FunctionExpression':
        walkStatements(expr.body);
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
      default:
        break;
    }
  }

  walkStatements(program.body);

  // Find let declarations that are never reassigned
  for (const [name, info] of letDeclarations) {
    if (!assignedNames.has(name)) {
      // Find the 'let' keyword in source to create auto-fix
      const offset = info.offset;
      const letKeyword = source.slice(offset, offset + 3);
      const fix = letKeyword === 'let' ? {
        range: [offset, offset + 3] as [number, number],
        replacement: 'const',
      } : undefined;

      diagnostics.push({
        rule: 'prefer-const',
        severity: 'info',
        message: `'${name}' is never reassigned. Use 'const' instead of 'let'.`,
        line: info.line,
        column: info.column,
        fix,
      });
    }
  }

  return diagnostics;
}
