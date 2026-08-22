/**
 * TinyLang Module Resolver
 *
 * Resolves import paths to absolute file paths.
 * Supports relative imports, stdlib modules, and .tiny_modules/ packages.
 */

import { getFs, getPath } from './node-host';

/** Well-known standard library module names */
const STDLIB_MODULES = new Set(['math', 'strings', 'io', 'arrays', 'types', 'utils']);

/** Special prefix indicating a stdlib module */
export const STDLIB_PREFIX = '__stdlib__:';

export class ModuleResolver {
  /**
   * Resolve an import source to an absolute file path or stdlib marker.
   *
   * Resolution order:
   * 1. Relative path (./ or ../) - resolve relative to importing file
   * 2. Stdlib module name - return special marker
   * 3. Package in .tiny_modules/ directory
   */
  resolve(importSource: string, fromFile: string): string {
    // 1. Relative path
    if (importSource.startsWith('./') || importSource.startsWith('../')) {
      return this.resolveRelative(importSource, fromFile);
    }

    // 2. Stdlib module
    if (STDLIB_MODULES.has(importSource)) {
      return `${STDLIB_PREFIX}${importSource}`;
    }

    // 3. .tiny_modules/ package
    return this.resolvePackage(importSource, fromFile);
  }

  private resolveRelative(importSource: string, fromFile: string): string {
    const dir = getPath().dirname(fromFile);
    // Try exact path, then with .tiny extension
    const candidates = [
      getPath().resolve(dir, importSource),
      getPath().resolve(dir, importSource + '.tiny'),
      getPath().resolve(dir, importSource, 'index.tiny'),
    ];

    for (const candidate of candidates) {
      if (getFs().existsSync(candidate) && getFs().statSync(candidate).isFile()) {
        return candidate;
      }
    }

    throw new Error(
      `Module not found: '${importSource}' (imported from ${getPath().basename(fromFile)})`
    );
  }

  private resolvePackage(importSource: string, fromFile: string): string {
    let dir = getPath().dirname(fromFile);

    // Walk up looking for .tiny_modules/
    while (true) {
      const modulesDir = getPath().join(dir, '.tiny_modules');
      if (getFs().existsSync(modulesDir)) {
        const candidates = [
          getPath().join(modulesDir, importSource + '.tiny'),
          getPath().join(modulesDir, importSource, 'index.tiny'),
        ];

        for (const candidate of candidates) {
          if (getFs().existsSync(candidate) && getFs().statSync(candidate).isFile()) {
            return candidate;
          }
        }
      }

      const parentDir = getPath().dirname(dir);
      if (parentDir === dir) break;
      dir = parentDir;
    }

    throw new Error(
      `Module not found: '${importSource}' (imported from ${getPath().basename(fromFile)})`
    );
  }
}
