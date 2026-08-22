#!/usr/bin/env node

/**
 * TinyLang CLI
 * 
 * Command-line interface for running, checking, and interacting
 * with TinyLang programs.
 * 
 * Usage:
 *   tinylang run <file.tiny>     Execute a TinyLang file
 *   tinylang repl                Start interactive mode
 *   tinylang check <file.tiny>   Check syntax without executing
 *   tinylang version             Show version information
 */

import * as fs from 'fs';
import * as path from 'path';
import { TinyLang } from '../tinylang';
import { Repl } from '../repl';

const VERSION = '1.0.0';

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
};

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function showHelp(): void {
  console.log(`
${colorize('TinyLang', 'bold')} v${VERSION} — A minimal educational programming language

${colorize('USAGE:', 'yellow')}
  tinylang <command> [options]

${colorize('COMMANDS:', 'yellow')}
  ${colorize('run', 'cyan')} <file.tiny>      Execute a TinyLang source file
  ${colorize('repl', 'cyan')}                  Start the interactive REPL
  ${colorize('check', 'cyan')} <file.tiny>    Check syntax without executing
  ${colorize('version', 'cyan')}               Show version information
  ${colorize('help', 'cyan')}                  Show this help message

${colorize('EXAMPLES:', 'yellow')}
  tinylang run hello.tiny
  tinylang repl
  tinylang check program.tiny

${colorize('FILE EXTENSION:', 'yellow')}
  TinyLang files use the ${colorize('.tiny', 'green')} extension

${colorize('LEARN MORE:', 'yellow')}
  https://github.com/tinylang/tinylang
`);
}

function showVersion(): void {
  console.log(`TinyLang v${VERSION}`);
  console.log(`  Runtime: Node.js ${process.version}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
}

function runFile(filePath: string): void {
  // Resolve the file path
  const resolvedPath = path.resolve(filePath);

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    console.error(colorize(`❌ Error: File not found: ${filePath}`, 'red'));
    console.error(colorize(`💡 Hint: Make sure the file path is correct and the file has a .tiny extension`, 'yellow'));
    process.exit(1);
  }

  // Read the file
  let source: string;
  try {
    source = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    console.error(colorize(`❌ Error: Cannot read file: ${filePath}`, 'red'));
    console.error(colorize(`💡 Hint: Check file permissions`, 'yellow'));
    process.exit(1);
  }

  // Execute
  const tinylang = new TinyLang({
    output: (msg) => console.log(msg),
  });

  const result = tinylang.run(source);

  if (!result.success && result.error) {
    console.error('');
    console.error(colorize(`❌ ${result.error.type} in ${path.basename(filePath)}:`, 'red'));
    console.error(`   ${result.error.message}`);

    if (result.error.line) {
      const lines = source.split('\n');
      const errorLine = lines[result.error.line - 1];
      if (errorLine) {
        console.error('');
        console.error(colorize(`  ${result.error.line} | `, 'gray') + errorLine);
        if (result.error.column) {
          console.error(colorize(`    | `, 'gray') + ' '.repeat(result.error.column - 1) + colorize('^', 'red'));
        }
      }
    }

    if (result.error.hint) {
      console.error('');
      console.error(colorize(`💡 Hint: ${result.error.hint}`, 'yellow'));
    }
    console.error('');
    process.exit(1);
  }
}

function checkFile(filePath: string): void {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(colorize(`❌ Error: File not found: ${filePath}`, 'red'));
    process.exit(1);
  }

  let source: string;
  try {
    source = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    console.error(colorize(`❌ Error: Cannot read file: ${filePath}`, 'red'));
    process.exit(1);
  }

  const tinylang = new TinyLang();
  const result = tinylang.check(source);

  if (result.success) {
    console.log(colorize(`✅ ${path.basename(filePath)}: No errors found!`, 'green'));
  } else if (result.error) {
    console.error(colorize(`❌ ${result.error.message}`, 'red'));
    if (result.error.hint) {
      console.error(colorize(`💡 Hint: ${result.error.hint}`, 'yellow'));
    }
    process.exit(1);
  }
}

function startRepl(): void {
  const repl = new Repl();
  repl.start();
}

// ============ Main Entry Point ============

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No arguments: start REPL
    startRepl();
    return;
  }

  const command = args[0];

  switch (command) {
    case 'run':
      if (!args[1]) {
        console.error(colorize('❌ Error: Please provide a file to run', 'red'));
        console.error(colorize('💡 Usage: tinylang run <file.tiny>', 'yellow'));
        process.exit(1);
      }
      runFile(args[1]);
      break;

    case 'repl':
      startRepl();
      break;

    case 'check':
      if (!args[1]) {
        console.error(colorize('❌ Error: Please provide a file to check', 'red'));
        console.error(colorize('💡 Usage: tinylang check <file.tiny>', 'yellow'));
        process.exit(1);
      }
      checkFile(args[1]);
      break;

    case 'version':
    case '--version':
    case '-v':
      showVersion();
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      // If argument looks like a file path, try to run it
      if (command.endsWith('.tiny') || fs.existsSync(command)) {
        runFile(command);
      } else {
        console.error(colorize(`❌ Unknown command: ${command}`, 'red'));
        console.error(colorize('💡 Run "tinylang help" to see available commands', 'yellow'));
        process.exit(1);
      }
  }
}

main();
