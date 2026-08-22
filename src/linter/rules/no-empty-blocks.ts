/**
 * Rule: no-empty-blocks
 * Flag empty function bodies, empty if/else/while/for blocks.
 */

import { Program, Statement } from '../../types/ast';
import { Diagnostic } from '../linter';

export function noEmptyBlocksRule(program: Program, _source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  function walkStatements(statements: Statement[]): void {
    for (const stmt of statements) {
      walkStatement(stmt);
    }
  }

  function walkStatement(stmt: Statement): void {
    switch (stmt.type) {
      case 'FunctionDeclaration':
        if (stmt.body.length === 0) {
          diagnostics.push({
            rule: 'no-empty-blocks',
            severity: 'warning',
            message: `Function '${stmt.name}' has an empty body`,
            line: stmt.position.line,
            column: stmt.position.column,
          });
        } else {
          walkStatements(stmt.body);
        }
        break;
      case 'IfStatement':
        if (stmt.consequent.length === 0) {
          diagnostics.push({
            rule: 'no-empty-blocks',
            severity: 'warning',
            message: 'Empty if block',
            line: stmt.position.line,
            column: stmt.position.column,
          });
        } else {
          walkStatements(stmt.consequent);
        }
        if (stmt.alternate) {
          if (Array.isArray(stmt.alternate)) {
            if (stmt.alternate.length === 0) {
              diagnostics.push({
                rule: 'no-empty-blocks',
                severity: 'warning',
                message: 'Empty else block',
                line: stmt.position.line,
                column: stmt.position.column,
              });
            } else {
              walkStatements(stmt.alternate);
            }
          } else {
            walkStatement(stmt.alternate);
          }
        }
        break;
      case 'WhileStatement':
        if (stmt.body.length === 0) {
          diagnostics.push({
            rule: 'no-empty-blocks',
            severity: 'warning',
            message: 'Empty while block',
            line: stmt.position.line,
            column: stmt.position.column,
          });
        } else {
          walkStatements(stmt.body);
        }
        break;
      case 'ForStatement':
        if (stmt.body.length === 0) {
          diagnostics.push({
            rule: 'no-empty-blocks',
            severity: 'warning',
            message: 'Empty for block',
            line: stmt.position.line,
            column: stmt.position.column,
          });
        } else {
          walkStatements(stmt.body);
        }
        break;
      case 'ClassDeclaration':
        for (const m of stmt.methods) {
          walkStatement(m);
        }
        break;
      case 'MatchStatement':
        for (const c of stmt.cases) {
          walkStatements(c.body);
        }
        if (stmt.defaultCase) walkStatements(stmt.defaultCase);
        break;
      case 'TestDeclaration':
        if (stmt.body.length === 0) {
          diagnostics.push({
            rule: 'no-empty-blocks',
            severity: 'warning',
            message: 'Empty test block',
            line: stmt.position.line,
            column: stmt.position.column,
          });
        } else {
          walkStatements(stmt.body);
        }
        break;
      default:
        break;
    }
  }

  walkStatements(program.body);

  return diagnostics;
}
