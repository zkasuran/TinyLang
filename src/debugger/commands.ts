/**
 * TinyLang Debugger Command Parser
 * 
 * Parses debug REPL commands into structured objects.
 */

export interface DebugCommand {
  command: string;
  args: string[];
}

/**
 * Parse a debug command string into a structured command object.
 * Supports command aliases (b -> break, s -> step, etc.)
 */
export function parseCommand(input: string): DebugCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { command: '', args: [] };
  }

  const parts = trimmed.split(/\s+/);
  const rawCommand = parts[0];
  const args = parts.slice(1);

  // Normalize command aliases
  const command = normalizeCommand(rawCommand);

  return { command, args };
}

/**
 * Normalize command aliases to canonical form
 */
function normalizeCommand(raw: string): string {
  switch (raw) {
    case 'b':
    case 'break':
      return 'break';
    case 'd':
    case 'delete':
      return 'delete';
    case 'l':
    case 'list':
      return 'list';
    case 's':
    case 'step':
      return 'step';
    case 'i':
    case 'into':
      return 'into';
    case 'o':
    case 'out':
      return 'out';
    case 'c':
    case 'continue':
      return 'continue';
    case 'p':
    case 'print':
      return 'print';
    case 'w':
    case 'watch':
      return 'watch';
    case 'unwatch':
      return 'unwatch';
    case 'locals':
      return 'locals';
    case 'stack':
      return 'stack';
    case 'h':
    case 'help':
      return 'help';
    case 'q':
    case 'quit':
      return 'quit';
    default:
      return raw;
  }
}

/**
 * Get help text for all debugger commands
 */
export function getHelpText(): string {
  return [
    'Debugger Commands:',
    '  break/b <line> [if <expr>]  - Set breakpoint at line (optionally with condition)',
    '  delete/d <id>               - Remove breakpoint by ID',
    '  list/l                      - List all breakpoints',
    '  step/s                      - Step over (next statement)',
    '  into/i                      - Step into function call',
    '  out/o                       - Step out of current function',
    '  continue/c                  - Resume execution',
    '  print/p <expr>              - Evaluate and print expression',
    '  watch/w <expr>              - Add watch expression',
    '  unwatch <id>                - Remove watch expression',
    '  locals                      - Show local variables',
    '  stack                       - Show call stack',
    '  help/h                      - Show this help',
    '  quit/q                      - Stop debugging',
  ].join('\n');
}
