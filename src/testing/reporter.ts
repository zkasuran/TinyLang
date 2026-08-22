/**
 * TinyLang Test Reporter
 *
 * Formats test results with colors for console output.
 */

import { TestResult } from './runner';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

export function formatTestResults(results: TestResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    if (result.passed) {
      lines.push(`${GREEN}  \u2713 ${result.description}${RESET}${DIM} (${result.duration}ms)${RESET}`);
    } else {
      lines.push(`${RED}  \u2717 ${result.description}${RESET}`);
      if (result.error) {
        lines.push(`${RED}    ${result.error}${RESET}`);
      }
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  lines.push('');
  const summaryColor = failed > 0 ? RED : GREEN;
  lines.push(`${summaryColor}${passed} passed, ${failed} failed, ${total} total (${totalDuration}ms)${RESET}`);

  return lines.join('\n');
}
