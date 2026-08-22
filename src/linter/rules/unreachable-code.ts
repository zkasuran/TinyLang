/**
 * Rule: unreachable-code
 * Detect statements after return/break/continue in the same block.
 */

import { Program, Statement } from '../../types/ast';
import { Diagnostic } from '../linter';

export function unreachableCodeRule(program: Program, _source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  function checkBlock(statements: Statement[]): void {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Check if current statement is a terminator
      if (stmt.type === 'ReturnStatement' || stmt.type === 'BreakStatement' || stmt.type === 'ContinueStatement') {
        // Everything after this in the same block is unreachable
        if (i < statements.length - 1) {
          const next = statements[i + 1];
          diagnostics.push({
            rule: 'unreachable-code',
            severity: 'warning',
            message: `Unreachable code after ${stmt.type === 'ReturnStatement' ? 'return' : stmt.type === 'BreakStatement' ? 'break' : 'continue'} statement`,
            line: next.position.line,
            column: next.position.column,
          });
        }
      }

      // Recurse into nested blocks
      walkStatement(stmt);
    }
  }

  function walkStatement(stmt: Statement): void {
    switch (stmt.type) {
      case 'FunctionDeclaration':
        checkBlock(stmt.body);
        break;
      case 'IfStatement':
        checkBlock(stmt.consequent);
        if (stmt.alternate) {
          if (Array.isArray(stmt.alternate)) {
            checkBlock(stmt.alternate);
          } else {
            walkStatement(stmt.alternate);
          }
        }
        break;
      case 'WhileStatement':
        checkBlock(stmt.body);
        break;
      case 'ForStatement':
        checkBlock(stmt.body);
        break;
      case 'MatchStatement':
        for (const c of stmt.cases) {
          checkBlock(c.body);
        }
        if (stmt.defaultCase) checkBlock(stmt.defaultCase);
        break;
      case 'ClassDeclaration':
        for (const m of stmt.methods) {
          checkBlock(m.body);
        }
        break;
      case 'TestDeclaration':
        checkBlock(stmt.body);
        break;
      default:
        break;
    }
  }

  checkBlock(program.body);

  return diagnostics;
}
