/**
 * Lazy access to the Node filesystem, for the file-backed module system.
 *
 * `src/index.ts` is the single entry point for both the CLI and the Web IDE
 * bundle, and it exports the module system. When `fs` and `path` were imported
 * at module scope, esbuild (which marks them external for `platform: 'browser'`)
 * emitted a `__require("fs")` that ran at *load* time. The generated
 * playground/index.html therefore threw
 *
 *     Dynamic require of "fs" is not supported
 *
 * the moment the page loaded, taking the whole Web IDE down. Nothing caught it
 * because the bundle was never executed in a test.
 *
 * Requiring lazily moves that call inside a function, so the bundle loads
 * cleanly in a browser and only fails if a program actually tries to resolve a
 * file-backed import - which genuinely cannot work there. The failure is then
 * reported against the import that caused it instead of breaking everything.
 */

/** The subset of `fs` the module system uses. */
export interface FileSystemHost {
  existsSync(p: string): boolean;
  statSync(p: string): { isFile(): boolean };
  readFileSync(p: string, encoding: 'utf-8'): string;
}

/** The subset of `path` the module system uses. */
export interface PathHost {
  dirname(p: string): string;
  basename(p: string): string;
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
}

function unavailable(what: string): never {
  throw new Error(
    `File-backed modules are unavailable in this environment: Node's '${what}' ` +
      'module could not be loaded. Importing from a file path requires a ' +
      'filesystem, so it works under the CLI but not in the browser.'
  );
}

let cachedFs: FileSystemHost | null = null;
let cachedPath: PathHost | null = null;

/** Node's `fs`, loaded on first use. Throws a clear error where unavailable. */
export function getFs(): FileSystemHost {
  if (cachedFs) return cachedFs;
  try {
    // Deliberately a call-time require, not a top-level import.
    cachedFs = require('fs') as FileSystemHost;
  } catch {
    unavailable('fs');
  }
  return cachedFs;
}

/** Node's `path`, loaded on first use. Throws a clear error where unavailable. */
export function getPath(): PathHost {
  if (cachedPath) return cachedPath;
  try {
    // Deliberately a call-time require, not a top-level import.
    cachedPath = require('path') as PathHost;
  } catch {
    unavailable('path');
  }
  return cachedPath;
}

/**
 * Whether a filesystem is reachable. Lets callers branch instead of catching,
 * and lets the bundle guard test assert the browser path without side effects.
 */
export function hasFileSystem(): boolean {
  try {
    getFs();
    getPath();
    return true;
  } catch {
    return false;
  }
}
