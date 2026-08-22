/**
 * TinyLang Linter - Static Analysis
 *
 * Runs a set of configurable rules against the AST and produces diagnostics.
 */

import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { Program } from '../types/ast';
import { unusedVariablesRule } from './rules/unused-variables';
import { unreachableCodeRule } from './rules/unreachable-code';
import { noEmptyBlocksRule } from './rules/no-empty-blocks';
import { preferConstRule } from './rules/prefer-const';
import { noShadowRule } from './rules/no-shadow';

export interface Diagnostic {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  fix?: { range: [number, number]; replacement: string };
}

export type LintRule = (program: Program, source: string) => Diagnostic[];

export class Linter {
  private rules: LintRule[];

  constructor() {
    this.rules = [
      unusedVariablesRule,
      unreachableCodeRule,
      noEmptyBlocksRule,
      preferConstRule,
      noShadowRule,
    ];
  }

  /**
   * Lint a TinyLang source string and return diagnostics.
   */
  lint(source: string): Diagnostic[] {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    const diagnostics: Diagnostic[] = [];
    for (const rule of this.rules) {
      diagnostics.push(...rule(program, source));
    }

    // Sort by line then column
    diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
    return diagnostics;
  }

  /**
   * Lint and apply auto-fixes where available.
   */
  lintAndFix(source: string): { diagnostics: Diagnostic[]; fixedSource: string } {
    const diagnostics = this.lint(source);
    const fixable = diagnostics.filter(d => d.fix);

    if (fixable.length === 0) {
      return { diagnostics, fixedSource: source };
    }

    // Apply fixes from end to start so offsets remain valid
    const sortedFixes = fixable
      .filter(d => d.fix)
      .sort((a, b) => b.fix!.range[0] - a.fix!.range[0]);

    let fixed = source;
    for (const diag of sortedFixes) {
      const [start, end] = diag.fix!.range;
      fixed = fixed.slice(0, start) + diag.fix!.replacement + fixed.slice(end);
    }

    // Return remaining diagnostics (those without fixes)
    const remaining = diagnostics.filter(d => !d.fix);
    return { diagnostics: remaining, fixedSource: fixed };
  }
}
