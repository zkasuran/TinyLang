/**
 * TinyLang Module Loader
 *
 * Loads and executes module files, returning their environment.
 * Handles caching (modules only execute once) and circular dependency detection.
 */

import { getFs } from './node-host';
import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { Interpreter } from '../interpreter/interpreter';
import { registerStdlib } from '../stdlib/register';
import { Environment } from '../types/values';
import { STDLIB_PREFIX, ModuleResolver } from './resolver';

export class ModuleLoader {
  /** Cache of fully loaded module environments (by absolute path) */
  private moduleCache: Map<string, Environment> = new Map();

  /** Stack of modules currently being loaded (for circular dep detection) */
  private loadingStack: Set<string> = new Set();

  /** Resolver instance for resolving import paths */
  private resolver: ModuleResolver = new ModuleResolver();

  /**
   * Load a module and return its environment.
   * If the module is already cached, returns the cached environment.
   * Detects circular dependencies.
   */
  loadModule(filePath: string): Environment {
    // Check cache first
    const cached = this.moduleCache.get(filePath);
    if (cached) {
      return cached;
    }

    // Check for stdlib modules
    if (filePath.startsWith(STDLIB_PREFIX)) {
      return this.loadStdlibModule(filePath);
    }

    // Circular dependency detection
    if (this.loadingStack.has(filePath)) {
      const stack = Array.from(this.loadingStack);
      const cycle = [...stack.slice(stack.indexOf(filePath)), filePath]
        .map(p => {
          const parts = p.split('/');
          return parts[parts.length - 1];
        })
        .join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    // Mark as loading
    this.loadingStack.add(filePath);

    try {
      // Read and execute the module
      const source = getFs().readFileSync(filePath, 'utf-8');
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      // Create a fresh environment for the module
      const moduleEnv = new Environment();
      registerStdlib(moduleEnv, { output: () => { /* suppress module output during loading */ } });

      // Create interpreter and execute
      const interpreter = new Interpreter({
        output: () => { /* suppress output during module loading */ },
      });

      // Set the module loader on interpreter so nested imports work
      interpreter.setModuleLoader(this, filePath, this.resolver);
      interpreter.executeInEnvironment(program, moduleEnv);

      // Cache and return
      this.moduleCache.set(filePath, moduleEnv);
      return moduleEnv;
    } finally {
      this.loadingStack.delete(filePath);
    }
  }

  private loadStdlibModule(filePath: string): Environment {
    // Return an environment with just the stdlib functions for this module
    const moduleName = filePath.slice(STDLIB_PREFIX.length);
    const env = new Environment();
    registerStdlib(env, { output: () => {} });

    // The stdlib is already registered globally. For stdlib module imports,
    // just return the global env which has all stdlib functions.
    // This is a simplified approach - all stdlib functions are available.
    this.moduleCache.set(filePath, env);

    // Mark with module name for reference
    void moduleName;
    return env;
  }

  /**
   * Clear the module cache (useful for testing)
   */
  clearCache(): void {
    this.moduleCache.clear();
  }
}
