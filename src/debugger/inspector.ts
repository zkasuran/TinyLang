/**
 * TinyLang Debugger Inspector
 * 
 * Utility functions for formatting debug information such as
 * variables, call stacks, and watch expressions.
 */

import { Environment, RuntimeValue, stringify } from '../types/values';
import { DebugFrame, WatchExpression } from './types';

/**
 * Get the type name of a runtime value for display
 */
function getTypeName(value: RuntimeValue): string {
  switch (value.type) {
    case 'number': return 'number';
    case 'string': return 'string';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    case 'array': return 'array';
    case 'object': return 'object';
    case 'function': return 'function';
    case 'native-function': return 'native-function';
    case 'class': return 'class';
    case 'instance': return `instance(${value.className})`;
    default: return 'unknown';
  }
}

/**
 * Format a single variable for display
 */
export function formatVariable(name: string, value: RuntimeValue): string {
  const typeName = getTypeName(value);
  const valueStr = stringify(value);
  return `${name}: ${typeName} = ${valueStr}`;
}

/**
 * Format call stack frames for display
 */
export function formatCallStack(frames: DebugFrame[]): string {
  if (frames.length === 0) {
    return '  (empty call stack)';
  }

  const lines: string[] = [];
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    const marker = i === frames.length - 1 ? '>' : ' ';
    lines.push(`${marker} #${frames.length - 1 - i} ${frame.functionName} at line ${frame.line}:${frame.column}`);
  }
  return lines.join('\n');
}

/**
 * Get all variables from an environment (current scope only)
 */
export function getLocalsFromEnv(env: Environment): Map<string, RuntimeValue> {
  const locals = new Map<string, RuntimeValue>();
  // Access the internal variables map via a helper
  // The Environment class exposes lookup/has but not direct iteration
  // We use a workaround by accessing the private field
  const envAny = env as unknown as { variables: Map<string, RuntimeValue> };
  if (envAny.variables) {
    for (const [name, value] of envAny.variables) {
      locals.set(name, value);
    }
  }
  return locals;
}

/**
 * Format all local variables for display
 */
export function formatLocals(env: Environment): string {
  const locals = getLocalsFromEnv(env);
  if (locals.size === 0) {
    return '  (no local variables)';
  }

  const lines: string[] = [];
  for (const [name, value] of locals) {
    lines.push(`  ${formatVariable(name, value)}`);
  }
  return lines.join('\n');
}

/**
 * Format watch expressions for display
 */
export function formatWatches(watches: WatchExpression[]): string {
  if (watches.length === 0) {
    return '  (no watch expressions)';
  }

  const lines: string[] = [];
  for (const watch of watches) {
    const valueStr = watch.lastValue !== undefined ? watch.lastValue : '<not evaluated>';
    lines.push(`  [${watch.id}] ${watch.expression} = ${valueStr}`);
  }
  return lines.join('\n');
}
