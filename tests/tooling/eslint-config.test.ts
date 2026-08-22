/**
 * `npm run lint` was advertised in package.json but had never run once: ESLint 9
 * resolves `eslint.config.*` and the repository contained no configuration file
 * of any generation, so the script's only possible outcome was the "couldn't
 * find an eslint.config.js" error.
 *
 * These tests hold the two halves of the fix in place: that a config exists and
 * is loadable, and that the codebase actually satisfies it. The second is the
 * one that matters -- a config that exists but reports errors leaves the script
 * exiting non-zero, which is the same broken build signal as before.
 */

import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const configPath = path.join(repoRoot, 'eslint.config.js');

/**
 * One ESLint run over exactly what `npm run lint` covers, shared by the tests
 * below. The promise is memoised rather than its result, so that concurrent
 * callers await the same run instead of racing to start a second one.
 */
let cachedRun: Promise<ESLint.LintResult[]> | null = null;
function lintRepo(): Promise<ESLint.LintResult[]> {
  if (!cachedRun) {
    cachedRun = new ESLint({ cwd: repoRoot }).lintFiles(['src/', 'tests/']);
  }
  return cachedRun;
}

describe('ESLint configuration', () => {
  it('exists as a flat config at the path ESLint 9 looks for', () => {
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('loads, which an ESM export in this CommonJS package would not', () => {
    // package.json has no "type": "module" and tsconfig emits commonjs, so the
    // config has to be CommonJS. require() failing here is the exact breakage a
    // stray `export default` would cause.
    const loaded = require(configPath);
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded.length).toBeGreaterThan(0);
  });

  it('actually lints some files rather than silently matching nothing', async () => {
    const results = await lintRepo();
    // A config whose `files` patterns miss everything would report zero errors
    // too, and look identical to success.
    expect(results.length).toBeGreaterThan(20);
    expect(results.some((r) => r.filePath.includes(`${path.sep}src${path.sep}`))).toBe(true);
    expect(results.some((r) => r.filePath.includes(`${path.sep}tests${path.sep}`))).toBe(true);
  });

  it('covers both TypeScript sources and test sources', async () => {
    const results = await lintRepo();
    const linted = results.map((r) => path.relative(repoRoot, r.filePath).split(path.sep).join('/'));
    expect(linted).toContain('src/vm/vm.ts');
    expect(linted).toContain('src/lexer/lexer.ts');
    expect(linted).toContain('src/formatter/formatter.ts');
    expect(linted).toContain('tests/integration/differential.test.ts');
  });

  it('reports no errors, so `npm run lint` exits zero', async () => {
    const results = await lintRepo();
    const problems = results.flatMap((r) =>
      r.messages
        .filter((m) => m.severity === 2)
        .map((m) => `${path.relative(repoRoot, r.filePath)}:${m.line}  ${m.message} (${m.ruleId})`)
    );
    expect(problems).toEqual([]);
  });

  it('reports no warnings either, including no stale eslint-disable directives', async () => {
    const results = await lintRepo();
    const problems = results.flatMap((r) =>
      r.messages
        .filter((m) => m.severity === 1)
        .map((m) => `${path.relative(repoRoot, r.filePath)}:${m.line}  ${m.message} (${m.ruleId})`)
    );
    expect(problems).toEqual([]);
  });

  it('does not lint build output, the generated bundle, or scratch files', async () => {
    const results = await lintRepo();
    const linted = results.map((r) => path.relative(repoRoot, r.filePath).split(path.sep).join('/'));
    for (const excluded of ['dist/', 'node_modules/', 'playground/index.html', '.scratch/']) {
      expect(
        linted.filter((f) => f.startsWith(excluded) || f === excluded),
        `${excluded} must not be linted`
      ).toEqual([]);
    }
  });

  it('keeps the bug-catching rules on rather than switching them off for green', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const config = await eslint.calculateConfigForFile(path.join(repoRoot, 'src/vm/vm.ts'));
    const rules = config.rules as Record<string, unknown[]>;
    for (const rule of [
      'no-control-regex',
      'no-unreachable',
      'no-dupe-else-if',
      'no-duplicate-case',
      'no-self-compare',
      'no-constant-binary-expression',
      'no-unsafe-optional-chaining',
      'prefer-const',
      'eqeqeq',
      '@typescript-eslint/no-unused-vars',
      '@typescript-eslint/no-explicit-any',
    ]) {
      expect(rules[rule], `${rule} must be enabled`).toBeDefined();
      // ESLint normalises severity to a leading number: 0 is "off".
      expect(rules[rule][0], `${rule} must not be off`).not.toBe(0);
    }
  });
});
