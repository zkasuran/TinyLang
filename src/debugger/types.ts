/**
 * TinyLang Debugger Types
 * 
 * Defines the core types used by the interactive debugger.
 */

import { Environment } from '../types/values';

export interface Breakpoint {
  id: number;
  line: number;
  condition?: string;
  hitCount: number;
  enabled: boolean;
}

export interface DebugFrame {
  functionName: string;
  line: number;
  column: number;
  env: Environment;
}

export type DebugAction = 'continue' | 'step_over' | 'step_into' | 'step_out';

export type DebugState = 'running' | 'paused' | 'stopped';

export interface WatchExpression {
  id: number;
  expression: string;
  lastValue?: string;
}

export interface DebugEvent {
  type: 'paused' | 'resumed' | 'stopped' | 'breakpoint_hit' | 'step_complete';
  line?: number;
  column?: number;
  reason?: string;
}
