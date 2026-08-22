/**
 * TinyLang REPL (Read-Eval-Print Loop)
 * 
 * An interactive mode where users can type TinyLang expressions
 * and see results immediately. Supports multi-line input, special
 * commands, and colorized output.
 */

import * as readline from 'readline';
import { TinyLang } from '../tinylang';
import { stringify as _stringify } from '../types/values';

const VERSION = '1.0.0';

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

const WELCOME_BANNER = `
${colorize('╭──────────────────────────────────────────╮', 'cyan')}
${colorize('│', 'cyan')}  ${colorize('TinyLang', 'bold')} v${VERSION} — Interactive REPL      ${colorize('│', 'cyan')}
${colorize('│', 'cyan')}  Type ${colorize('.help', 'yellow')} for commands, ${colorize('.exit', 'yellow')} to quit   ${colorize('│', 'cyan')}
${colorize('╰──────────────────────────────────────────╯', 'cyan')}
`;

const HELP_TEXT = `
${colorize('Available Commands:', 'bold')}
  ${colorize('.help', 'yellow')}      Show this help message
  ${colorize('.clear', 'yellow')}     Clear all variables and reset state
  ${colorize('.exit', 'yellow')}      Exit the REPL
  ${colorize('.examples', 'yellow')}  Show example code snippets
  ${colorize('.env', 'yellow')}       Show defined variables

${colorize('Tips:', 'bold')}
  • Expressions are auto-evaluated and their results displayed
  • Multi-line input: open a { and press Enter to continue
  • Use ${colorize('print("hello")', 'green')} for output
  • Press Ctrl+C to cancel current input, Ctrl+D to exit
`;

const EXAMPLES_TEXT = `
${colorize('Try these examples:', 'bold')}

  ${colorize('// Variables', 'gray')}
  let name = "World"
  print("Hello, " + name + "!")

  ${colorize('// Functions', 'gray')}
  fn factorial(n) {
    if n <= 1 { return 1 }
    return n * factorial(n - 1)
  }
  factorial(5)

  ${colorize('// Arrays', 'gray')}
  let nums = [1, 2, 3, 4, 5]
  nums.map((x) => x * 2)
  nums.filter((x) => x > 3)

  ${colorize('// Loops', 'gray')}
  for i in 1..6 {
    print(i * i)
  }
`;

export class Repl {
  private tinylang: TinyLang;
  private rl: readline.Interface | null = null;
  private buffer: string = '';
  private openBraces: number = 0;
  private openParens: number = 0;
  private openBrackets: number = 0;

  constructor() {
    this.tinylang = new TinyLang({
      output: (msg) => console.log(colorize(msg, 'reset')),
    });
  }

  /**
   * Start the interactive REPL
   */
  start(): void {
    console.log(WELCOME_BANNER);

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      terminal: true,
    });

    this.rl.prompt();

    this.rl.on('line', (line: string) => {
      this.handleLine(line);
      this.rl!.setPrompt(this.getPrompt());
      this.rl!.prompt();
    });

    this.rl.on('close', () => {
      console.log(colorize('\nGoodbye! Happy coding! 🎉', 'cyan'));
      process.exit(0);
    });

    this.rl.on('SIGINT', () => {
      if (this.buffer) {
        // Cancel multi-line input
        this.buffer = '';
        this.openBraces = 0;
        this.openParens = 0;
        this.openBrackets = 0;
        console.log(colorize('\n(input cancelled)', 'gray'));
        this.rl!.setPrompt(this.getPrompt());
        this.rl!.prompt();
      } else {
        console.log(colorize('\n(Use .exit or Ctrl+D to quit)', 'gray'));
        this.rl!.prompt();
      }
    });
  }

  private getPrompt(): string {
    if (this.buffer) {
      return colorize('...> ', 'gray');
    }
    return colorize('tiny> ', 'cyan');
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();

    // Handle dot commands (only when not in multi-line mode)
    if (!this.buffer && trimmed.startsWith('.')) {
      this.handleCommand(trimmed);
      return;
    }

    // Accumulate input
    this.buffer += (this.buffer ? '\n' : '') + line;

    // Count delimiters to detect multi-line
    for (const ch of line) {
      if (ch === '{') this.openBraces++;
      if (ch === '}') this.openBraces--;
      if (ch === '(') this.openParens++;
      if (ch === ')') this.openParens--;
      if (ch === '[') this.openBrackets++;
      if (ch === ']') this.openBrackets--;
    }

    // If all delimiters are balanced, execute
    if (this.openBraces <= 0 && this.openParens <= 0 && this.openBrackets <= 0) {
      this.execute(this.buffer);
      this.buffer = '';
      this.openBraces = 0;
      this.openParens = 0;
      this.openBrackets = 0;
    }
  }

  private execute(source: string): void {
    const trimmed = source.trim();
    if (!trimmed) return;

    const result = this.tinylang.run(trimmed);

    if (result.success) {
      // Print the result if it's not null and there was no print statement
      if (result.result && result.result !== 'null' && result.output.length === 0) {
        console.log(colorize(`→ ${result.result}`, 'green'));
      }
    } else if (result.error) {
      console.log(colorize(`❌ ${result.error.message}`, 'red'));
      if (result.error.hint) {
        console.log(colorize(`💡 Hint: ${result.error.hint}`, 'yellow'));
      }
    }
  }

  private handleCommand(command: string): void {
    switch (command) {
      case '.help':
        console.log(HELP_TEXT);
        break;
      case '.clear':
        this.tinylang.reset();
        console.log(colorize('Environment cleared. All variables have been removed.', 'green'));
        break;
      case '.exit':
        console.log(colorize('Goodbye! Happy coding! 🎉', 'cyan'));
        process.exit(0);
        break;
      case '.examples':
        console.log(EXAMPLES_TEXT);
        break;
      case '.env':
        console.log(colorize('(Environment inspection not yet implemented)', 'gray'));
        break;
      default:
        console.log(colorize(`Unknown command: ${command}. Type .help for available commands.`, 'yellow'));
    }
  }
}
