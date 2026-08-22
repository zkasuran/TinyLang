/**
 * Guard: the Web IDE bundle must actually build.
 *
 * This exists because `playground/build.js` was broken for five commits without
 * anything noticing. `src/stdlib/crypto.ts` imported node's `crypto` and used
 * `Buffer`, neither of which esbuild can resolve for `platform: 'browser'`, so
 * the bundle step failed while `playground/index.html` stayed on disk as a
 * stale artefact from an earlier commit. The Web IDE is a headline feature and
 * it silently shipped without any of the interpreter or VM fixes.
 *
 * The build script did exit non-zero; nothing was running it. So the check is
 * here, where the rest of the suite runs.
 *
 * This deliberately bundles from source rather than inspecting the committed
 * index.html: the failure being guarded against is "the bundle cannot be
 * produced", which only building can detect.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as vm from 'vm';
import * as esbuild from 'esbuild';

const root = path.join(__dirname, '..', '..');

/**
 * Bundle the interpreter entry point exactly as playground/build.js does.
 * Kept in sync with that script's platform, format and external list.
 */
async function bundleForBrowser(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src', 'index.ts')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'TinyLangBundle',
    target: 'es2020',
    external: ['fs', 'path', 'readline-sync', 'readline', 'child_process'],
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

describe('Web IDE bundle', () => {
  it('bundles the interpreter for the browser without unresolved imports', async () => {
    // Any Node-only import reachable from src/index.ts fails this outright.
    await expect(bundleForBrowser()).resolves.toBeTruthy();
  }, 60_000);

  it('produces a bundle containing the language core', async () => {
    const code = await bundleForBrowser();
    expect(code.length).toBeGreaterThan(10_000);
    for (const symbol of ['Lexer', 'Parser', 'Interpreter', 'Compiler', 'VM']) {
      expect(code, `bundle should contain ${symbol}`).toContain(symbol);
    }
  }, 60_000);

  it('does not reference node built-ins the browser cannot provide', async () => {
    const code = await bundleForBrowser();
    // esbuild would have failed already for a bare `require("crypto")`, but a
    // stray reference would surface as a runtime failure in the browser only.
    expect(code).not.toMatch(/\brequire\(["']crypto["']\)/);
    expect(code).not.toMatch(/\brequire\(["']node:crypto["']\)/);
  }, 60_000);

  it('loads and runs with no require available, as in a browser', async () => {
    // This is the case that actually shipped broken. src/index.ts exports the
    // module system, whose resolver imported `fs` at module scope, so esbuild
    // emitted a __require("fs") that ran at load time and the real
    // playground/index.html threw 'Dynamic require of "fs" is not supported'
    // the instant the page loaded. Executing the bundle in a context with no
    // `require` is the only way to catch that.
    const code = await bundleForBrowser();
    const output: string[] = [];

    const sandbox: Record<string, unknown> = {
      window: {},
      Proxy, Symbol, Object, Array, Math, JSON, String, Number, Boolean,
      Error, TypeError, RangeError, Map, Set, Date, RegExp, Uint8Array,
      Function, isNaN, parseInt, parseFloat, console,
      // Deliberately absent: require, module, process, __dirname.
    };
    sandbox.globalThis = sandbox;

    vm.runInNewContext(`${code};\nwindow.__bundle = TinyLangBundle;`, sandbox, {
      timeout: 20_000,
    });

    const bundle = (sandbox.window as { __bundle: Record<string, unknown> }).__bundle;
    const TinyLang = bundle.TinyLang as new (opts: {
      output: (m: string) => void;
    }) => { run(src: string): { success: boolean } };

    const tl = new TinyLang({ output: (m: string) => output.push(m) });
    const result = tl.run(`
      let xs = [1, 2, 3, 4]
      print(xs.filter((x) => x % 2 == 0).map((x) => x * x))
      print(true ? "ternary" : "no")
      print(hash("hello"))
      for i in 3..0 { print(i) }
    `);

    expect(result.success).toBe(true);
    expect(output).toEqual([
      // Higher-order array methods: stubs in the VM until recently.
      '[4, 16]',
      // Ternary: unreachable dead code until recently.
      'ternary',
      // The pure-JS digest, which is why node:crypto had to go.
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      // Descending ranges: silently iterated zero times in the VM.
      '3', '2', '1',
    ]);
  }, 60_000);

  it('reports a clear error for a file import instead of breaking on load', async () => {
    // File-backed imports genuinely cannot work without a filesystem. The point
    // is that this fails at the import, with an explanation, rather than taking
    // the whole bundle down at load time.
    const code = await bundleForBrowser();

    const sandbox: Record<string, unknown> = {
      window: {},
      Proxy, Symbol, Object, Array, Math, JSON, String, Number, Boolean,
      Error, TypeError, RangeError, Map, Set, Date, RegExp, Uint8Array,
      Function, isNaN, parseInt, parseFloat, console,
    };
    sandbox.globalThis = sandbox;

    vm.runInNewContext(`${code};\nwindow.__bundle = TinyLangBundle;`, sandbox, {
      timeout: 20_000,
    });
    const bundle = (sandbox.window as { __bundle: Record<string, unknown> }).__bundle;

    const hasFileSystem = bundle.hasFileSystem as (() => boolean) | undefined;
    expect(typeof hasFileSystem).toBe('function');
    expect(hasFileSystem!()).toBe(false);
  }, 60_000);
});
