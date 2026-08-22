/**
 * TinyLang Debugger Module
 * 
 * Exports the interactive debugger and supporting utilities.
 */

export { Debugger, DebugPauseSignal } from './debugger';
export type { DebuggerOptions } from './debugger';
export {
  formatVariable,
  formatCallStack,
  formatLocals,
  formatWatches,
  getLocalsFromEnv,
} from './inspector';
export { parseCommand, getHelpText } from './commands';
export type { DebugCommand } from './commands';
export type {
  Breakpoint,
  DebugFrame,
  DebugAction,
  DebugState,
  WatchExpression,
  DebugEvent,
} from './types';
