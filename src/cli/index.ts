#!/usr/bin/env node

/**
 * TinyLang CLI
 *
 * Professional command-line interface for running, compiling, debugging,
 * formatting, linting, testing, and managing TinyLang programs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TinyLang } from '../tinylang';
import { Repl } from '../repl';
import { Compiler, Chunk, disassemble, optimize, WasmCompiler } from '../compiler';
import { VM } from '../vm';
import { Debugger, getHelpText } from '../debugger';
import { Formatter } from '../formatter';
import { Linter } from '../linter';
import { TestRunner, formatTestResults } from '../testing';
import { ModuleLoader } from '../modules/loader';
import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { red, green, yellow, blue, cyan, gray, bold, dim } from './colors';

const VERSION = '1.0.0';

// ============ CLI Infrastructure ============

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const eqIdx = key.indexOf('=');
      if (eqIdx !== -1) {
        flags[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        // Check if this is a boolean flag or takes a value
        if (['output', 'iterations'].includes(key)) {
          flags[key] = args[++i];
        } else {
          flags[key] = true;
        }
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg[1];
      const longMap: Record<string, string> = {
        'o': 'output',
        'w': 'write',
        'd': 'disassemble',
        'n': 'iterations',
        'v': 'version',
        'h': 'help',
      };
      const longKey = longMap[key] || key;
      if (['o', 'n'].includes(key) && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[longKey] = args[++i];
      } else {
        flags[longKey] = true;
      }
    } else if (!command) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function showError(message: string, hint?: string): void {
  console.error(red(`Error: ${message}`));
  if (hint) {
    console.error(yellow(`Hint: ${hint}`));
  }
}

function readFileChecked(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    showError(`File not found: ${filePath}`, 'Make sure the file path is correct');
    process.exit(1);
  }
  try {
    return fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    showError(`Cannot read file: ${filePath}`, 'Check file permissions');
    process.exit(1);
  }
}

function showSourceError(
  source: string,
  filePath: string,
  error: { type: string; message: string; line?: number; column?: number; hint?: string }
): void {
  console.error('');
  console.error(red(`${error.type} in ${path.basename(filePath)}:`));
  console.error(`   ${error.message}`);

  if (error.line) {
    const lines = source.split('\n');
    const errorLine = lines[error.line - 1];
    if (errorLine) {
      console.error('');
      console.error(gray(`  ${error.line} | `) + errorLine);
      if (error.column) {
        console.error(gray(`    | `) + ' '.repeat(error.column - 1) + red('^'));
      }
    }
  }

  if (error.hint) {
    console.error('');
    console.error(yellow(`Hint: ${error.hint}`));
  }
  console.error('');
}

// ============ Command Handlers ============

function cmdRun(filePath: string): void {
  const source = readFileChecked(filePath);
  const resolvedPath = path.resolve(filePath);

  const tinylang = new TinyLang({
    output: (msg) => console.log(msg),
  });

  // Set up module system
  const loader = new ModuleLoader();
  tinylang.setModuleContext(loader, resolvedPath);

  const result = tinylang.run(source);

  if (!result.success && result.error) {
    showSourceError(source, filePath, result.error);
    process.exit(1);
  }
}

function cmdCompile(filePath: string, flags: Record<string, string | boolean>): void {
  const source = readFileChecked(filePath);
  const outputPath = typeof flags['output'] === 'string'
    ? flags['output']
    : filePath.replace(/\.tiny$/, '.tinyc');

  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    const compiler = new Compiler();
    let chunk = compiler.compile(program);

    let optimizedCount = 0;
    if (!flags['no-optimize']) {
      try {
        const originalLength = chunk.code.length;
        chunk = optimize(chunk);
        optimizedCount = Math.max(0, originalLength - chunk.code.length);
      } catch {
        // Optimizer failed - use unoptimized chunk
        optimizedCount = 0;
      }
    }

    if (flags['disassemble']) {
      console.log(disassemble(chunk));
      console.log('');
    }

    const buffer = chunk.serialize();
    fs.writeFileSync(outputPath, buffer);

    console.log(green(`Compiled: ${chunk.code.length} instructions, ${chunk.constants.length} constants, optimized ${optimizedCount} bytes`));
    console.log(dim(`Output: ${outputPath} (${buffer.length} bytes)`));
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

function cmdExec(filePath: string): void {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    showError(`File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const buffer = fs.readFileSync(resolvedPath);
    const chunk = Chunk.deserialize(buffer);

    const vm = new VM({
      output: (msg: string) => console.log(msg),
    });
    vm.run(chunk);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('magic bytes') || msg.includes('Invalid .tinyc')) {
      showError(`Invalid bytecode file: ${filePath}`, 'Make sure this is a compiled .tinyc file');
    } else {
      showError(msg);
    }
    process.exit(1);
  }
}

function cmdDebug(filePath: string): void {
  const source = readFileChecked(filePath);

  const debugInstance = new Debugger(source, {
    output: (msg) => console.log(msg),
  });

  console.log(bold('TinyLang Debugger'));
  console.log(dim(`File: ${filePath}`));
  console.log('');
  console.log(getHelpText());
  console.log('');

  // Start the debugger
  debugInstance.start();

  // Show initial position
  const currentLine = debugInstance.getCurrentLine();
  showDebugPosition(source, currentLine);

  // Simple synchronous readline loop
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: cyan('debug> '),
  });

  rl.prompt();
  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'quit' || trimmed === 'q') {
      debugInstance.stop();
      rl.close();
      return;
    }

    const { parseCommand } = require('../debugger');
    const cmd = parseCommand(trimmed);

    switch (cmd.type) {
      case 'step':
        debugInstance.step();
        break;
      case 'step_into':
        debugInstance.stepInto();
        break;
      case 'step_out':
        debugInstance.stepOut();
        break;
      case 'continue':
        debugInstance.continue();
        break;
      case 'break':
        if (cmd.line !== undefined) {
          debugInstance.addBreakpoint(cmd.line, cmd.condition);
          console.log(green(`Breakpoint set at line ${cmd.line}`));
        }
        break;
      case 'locals': {
        const locals = debugInstance.getLocals();
        for (const [name, value] of locals) {
          const { stringify: str } = require('../types/values');
          console.log(`  ${name} = ${str(value)}`);
        }
        break;
      }
      case 'eval':
        if (cmd.expression) {
          console.log(debugInstance.evaluateExpression(cmd.expression));
        }
        break;
      case 'help':
        console.log(getHelpText());
        break;
      default:
        console.log(yellow(`Unknown debug command: ${trimmed}`));
        break;
    }

    if (debugInstance.getState() === 'paused') {
      showDebugPosition(source, debugInstance.getCurrentLine());
    } else if (debugInstance.getState() === 'stopped') {
      console.log(dim('Program finished.'));
      rl.close();
      return;
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

function showDebugPosition(source: string, line: number): void {
  const lines = source.split('\n');
  const start = Math.max(0, line - 3);
  const end = Math.min(lines.length, line + 2);

  console.log('');
  for (let i = start; i < end; i++) {
    const lineNum = String(i + 1).padStart(4);
    const marker = (i + 1 === line) ? cyan('->') : '  ';
    const lineColor = (i + 1 === line) ? bold : dim;
    console.log(`${marker} ${gray(lineNum)} ${lineColor(lines[i])}`);
  }
  console.log('');
}

function cmdFmt(files: string[], flags: Record<string, string | boolean>): void {
  if (files.length === 0) {
    showError('No files specified', 'Usage: tinylang fmt <file.tiny> [files...]');
    process.exit(1);
  }

  const formatter = new Formatter();
  let hasChanges = false;

  for (const filePath of files) {
    const source = readFileChecked(filePath);

    try {
      const formatted = formatter.format(source);

      if (flags['check']) {
        if (formatted !== source) {
          console.log(yellow(`Would reformat: ${filePath}`));
          hasChanges = true;
        }
      } else if (flags['write']) {
        if (formatted !== source) {
          fs.writeFileSync(path.resolve(filePath), formatted);
          console.log(green(`Formatted: ${filePath}`));
        } else {
          console.log(dim(`Unchanged: ${filePath}`));
        }
      } else {
        // Print to stdout
        process.stdout.write(formatted);
      }
    } catch (e) {
      showError(`Failed to format ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }

  if (flags['check'] && hasChanges) {
    process.exit(1);
  }
}

function cmdLint(files: string[], flags: Record<string, string | boolean>): void {
  if (files.length === 0) {
    showError('No files specified', 'Usage: tinylang lint <file.tiny> [files...]');
    process.exit(1);
  }

  const linter = new Linter();
  let hasErrors = false;

  for (const filePath of files) {
    const source = readFileChecked(filePath);

    try {
      if (flags['fix']) {
        const { diagnostics, fixedSource } = linter.lintAndFix(source);
        if (fixedSource !== source) {
          fs.writeFileSync(path.resolve(filePath), fixedSource);
          console.log(green(`Fixed: ${filePath}`));
        }
        // Show remaining diagnostics
        printDiagnostics(filePath, diagnostics);
        if (diagnostics.some(d => d.severity === 'error')) {
          hasErrors = true;
        }
      } else {
        const diagnostics = linter.lint(source);
        printDiagnostics(filePath, diagnostics);
        if (diagnostics.some(d => d.severity === 'error')) {
          hasErrors = true;
        }
      }
    } catch (e) {
      showError(`Failed to lint ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

function printDiagnostics(filePath: string, diagnostics: Array<{ rule: string; severity: string; message: string; line: number; column: number }>): void {
  for (const diag of diagnostics) {
    const severityColor = diag.severity === 'error' ? red
      : diag.severity === 'warning' ? yellow
      : blue;
    const severity = severityColor(diag.severity);
    const rule = dim(`[${diag.rule}]`);
    console.log(`${severity} ${rule} ${filePath}:${diag.line}:${diag.column}: ${diag.message}`);
  }
}

function cmdTest(files: string[], flags: Record<string, string | boolean>): void {
  // Show help if requested
  if (flags['help']) {
    console.log(`${bold('tinylang test')} - Run TinyLang test files`);
    console.log('');
    console.log('Usage: tinylang test [file.test.tiny] [files...]');
    console.log('  If no files specified, finds all *.test.tiny files recursively.');
    return;
  }

  let testFiles: string[];
  if (files.length > 0) {
    testFiles = files;
  } else {
    // Find all *.test.tiny files recursively
    testFiles = findTestFiles(process.cwd());
    if (testFiles.length === 0) {
      console.log(yellow('No test files found (*.test.tiny)'));
      return;
    }
  }

  const runner = new TestRunner();
  let totalPassed = 0;
  let totalFailed = 0;

  for (const filePath of testFiles) {
    const source = readFileChecked(filePath);
    console.log(bold(`\n${path.basename(filePath)}`));

    try {
      const results = runner.runTests(source);
      console.log(formatTestResults(results));

      totalPassed += results.filter(r => r.passed).length;
      totalFailed += results.filter(r => !r.passed).length;
    } catch (e) {
      console.error(red(`  Error running tests in ${filePath}: ${e instanceof Error ? e.message : String(e)}`));
      totalFailed++;
    }
  }

  console.log('');
  if (totalFailed > 0) {
    console.log(red(bold(`Tests: ${totalPassed} passed, ${totalFailed} failed`)));
    process.exit(1);
  } else {
    console.log(green(bold(`Tests: ${totalPassed} passed`)));
  }
}

function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findTestFiles(fullPath));
      } else if (entry.name.endsWith('.test.tiny')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore unreadable directories
  }
  return results;
}

function cmdDoc(filePath: string, flags: Record<string, string | boolean>): void {
  const source = readFileChecked(filePath);

  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    const lines = source.split('\n');
    const mdLines: string[] = [];

    mdLines.push(`# ${path.basename(filePath)}`);
    mdLines.push('');

    for (const stmt of program.body) {
      if (stmt.type === 'FunctionDeclaration') {
        // Look for doc comments above
        const docComment = getDocComment(lines, stmt.position.line);
        const params = stmt.params.map(p => p.defaultValue ? `${p.name} = ...` : p.name).join(', ');
        mdLines.push(`## \`fn ${stmt.name}(${params})\``);
        mdLines.push('');
        if (docComment) {
          mdLines.push(docComment);
          mdLines.push('');
        }
      } else if (stmt.type === 'ClassDeclaration') {
        const docComment = getDocComment(lines, stmt.position.line);
        const ext = stmt.superClass ? ` extends ${stmt.superClass}` : '';
        mdLines.push(`## \`class ${stmt.name}${ext}\``);
        mdLines.push('');
        if (docComment) {
          mdLines.push(docComment);
          mdLines.push('');
        }

        // Document methods
        for (const method of stmt.methods) {
          const methodDoc = getDocComment(lines, method.position.line);
          const methodParams = method.params.map(p => p.name).join(', ');
          mdLines.push(`### \`${stmt.name}.${method.name}(${methodParams})\``);
          mdLines.push('');
          if (methodDoc) {
            mdLines.push(methodDoc);
            mdLines.push('');
          }
        }
      }
    }

    const output = mdLines.join('\n');

    if (typeof flags['output'] === 'string') {
      fs.writeFileSync(flags['output'], output);
      console.log(green(`Documentation written to: ${flags['output']}`));
    } else {
      console.log(output);
    }
  } catch (e) {
    showError(`Failed to generate documentation: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

function getDocComment(lines: string[], declLine: number): string | null {
  const comments: string[] = [];
  for (let i = declLine - 2; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('///') || trimmed.startsWith('//-')) {
      comments.unshift(trimmed.slice(3).trim());
    } else if (trimmed.startsWith('//')) {
      comments.unshift(trimmed.slice(2).trim());
    } else {
      break;
    }
  }
  return comments.length > 0 ? comments.join('\n') : null;
}

function cmdInit(name: string | undefined): void {
  const dirName = name || '.';
  const targetDir = path.resolve(dirName);

  if (name && name !== '.') {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  // Create main.tiny
  const mainTiny = `// Main entry point
print("Hello from TinyLang!")

// Import a function from lib
// import {greet} from "./lib"
// greet("World")
`;
  fs.writeFileSync(path.join(targetDir, 'main.tiny'), mainTiny);

  // Create lib.tiny
  const libTiny = `// Library functions

fn greet(name) {
  print("Hello, " + name + "!")
}

fn add(a, b) {
  return a + b
}
`;
  fs.writeFileSync(path.join(targetDir, 'lib.tiny'), libTiny);

  // Create main.test.tiny
  const testTiny = `// Tests for the project
fn add(a, b) {
  return a + b
}

test "addition works" {
  expect(add(2, 3)).toBe(5)
}

test "string concatenation" {
  let result = "hello" + " " + "world"
  expect(result).toBe("hello world")
}
`;
  fs.writeFileSync(path.join(targetDir, 'main.test.tiny'), testTiny);

  // Create .tinylang.json
  const config = {
    formatter: {
      indentSize: 2,
      maxLineWidth: 80,
      insertFinalNewline: true,
    },
    linter: {
      rules: {
        'prefer-const': 'warning',
        'no-unused-variables': 'warning',
        'no-empty-blocks': 'warning',
        'unreachable-code': 'error',
        'no-shadow': 'info',
      },
    },
  };
  fs.writeFileSync(path.join(targetDir, '.tinylang.json'), JSON.stringify(config, null, 2) + '\n');

  // Create README.md
  const readme = `# ${name || 'tinylang-project'}

A TinyLang project.

## Getting Started

\`\`\`bash
# Run the main file
tinylang run main.tiny

# Run tests
tinylang test

# Format code
tinylang fmt --write main.tiny

# Check for issues
tinylang lint main.tiny
\`\`\`
`;
  fs.writeFileSync(path.join(targetDir, 'README.md'), readme);

  console.log(green(bold('Project initialized!')));
  console.log('');
  console.log('  Created files:');
  console.log(cyan('    main.tiny') + '        - Entry point');
  console.log(cyan('    lib.tiny') + '         - Library module');
  console.log(cyan('    main.test.tiny') + '   - Test file');
  console.log(cyan('    .tinylang.json') + '   - Configuration');
  console.log(cyan('    README.md') + '        - Documentation');
  console.log('');
  console.log('  Next steps:');
  if (name && name !== '.') {
    console.log(dim(`    cd ${name}`));
  }
  console.log(dim('    tinylang run main.tiny'));
}

function cmdBench(filePath: string, flags: Record<string, string | boolean>): void {
  const source = readFileChecked(filePath);
  const iterations = typeof flags['iterations'] === 'string'
    ? parseInt(flags['iterations'], 10)
    : 100;

  if (isNaN(iterations) || iterations < 1) {
    showError('Invalid iteration count', 'Use --iterations/-n with a positive number');
    process.exit(1);
  }

  console.log(bold(`Benchmarking: ${path.basename(filePath)}`));
  console.log(dim(`Iterations: ${iterations}`));
  console.log('');

  // Run interpreter benchmark
  const interpreterTimes = benchmarkInterpreter(source, iterations);
  printBenchResults('Interpreter', interpreterTimes);

  if (flags['compare']) {
    console.log('');
    const compilerTimes = benchmarkCompiler(source, iterations);
    printBenchResults('Compiler+VM', compilerTimes);

    // Comparison
    const interpAvg = average(interpreterTimes);
    const compilerAvg = average(compilerTimes);
    console.log('');
    const speedup = interpAvg / compilerAvg;
    if (speedup > 1) {
      console.log(green(`VM is ${speedup.toFixed(2)}x faster than interpreter`));
    } else {
      console.log(yellow(`Interpreter is ${(1 / speedup).toFixed(2)}x faster than VM`));
    }
  }
}

function benchmarkInterpreter(source: string, iterations: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const tinylang = new TinyLang({ output: () => {} });
    const start = performance.now();
    tinylang.run(source);
    times.push(performance.now() - start);
  }
  return times;
}

function benchmarkCompiler(source: string, iterations: number): number[] {
  const times: number[] = [];
  // Compile once
  const tinylang = new TinyLang({ output: () => {} });
  const chunk = tinylang.compile(source);

  for (let i = 0; i < iterations; i++) {
    const vm = new VM({ output: () => {} });
    const start = performance.now();
    vm.run(chunk);
    times.push(performance.now() - start);
  }
  return times;
}

function printBenchResults(label: string, times: number[]): void {
  const sorted = [...times].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = average(times);
  const med = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  console.log(bold(`  ${label}:`));
  console.log(`    min:    ${formatDuration(min)}`);
  console.log(`    max:    ${formatDuration(max)}`);
  console.log(`    avg:    ${formatDuration(avg)}`);
  console.log(`    median: ${formatDuration(med)}`);
  console.log(`    p95:    ${formatDuration(p95)}`);
  console.log(`    p99:    ${formatDuration(p99)}`);

  // Simple ASCII histogram
  console.log('');
  console.log(dim('    Distribution:'));
  printHistogram(times);
}

function printHistogram(times: number[]): void {
  const bucketCount = 10;
  const sorted = [...times].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min || 1;
  const bucketSize = range / bucketCount;

  const buckets = new Array(bucketCount).fill(0);
  for (const t of times) {
    const idx = Math.min(Math.floor((t - min) / bucketSize), bucketCount - 1);
    buckets[idx]++;
  }

  const maxCount = Math.max(...buckets);
  const barWidth = 30;

  for (let i = 0; i < bucketCount; i++) {
    const barLen = Math.round((buckets[i] / maxCount) * barWidth);
    const bar = '\u2588'.repeat(barLen);
    const label = formatDuration(min + i * bucketSize).padStart(8);
    console.log(dim(`    ${label} |`) + cyan(bar) + dim(` ${buckets[i]}`));
  }
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function cmdCheck(filePath: string): void {
  const source = readFileChecked(filePath);
  const tinylang = new TinyLang();
  const result = tinylang.check(source);

  if (result.success) {
    console.log(green(`${path.basename(filePath)}: No errors found!`));
  } else if (result.error) {
    showSourceError(source, filePath, result.error);
    process.exit(1);
  }
}

function cmdAst(filePath: string): void {
  const source = readFileChecked(filePath);

  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    console.log(bold(`AST for ${path.basename(filePath)}`));
    console.log('');
    printAstNode(program, '', true);
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

function printAstNode(node: unknown, prefix: string, isLast: boolean): void {
  if (!node || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  const connector = isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
  const type = record['type'] as string || '';

  // Format node type with key information
  let label = cyan(type);
  if (record['name']) label += ` ${yellow(String(record['name']))}`;
  if (record['operator']) label += ` ${bold(String(record['operator']))}`;
  if (record['value'] !== undefined && typeof record['value'] !== 'object') {
    label += ` ${green(JSON.stringify(record['value']))}`;
  }
  if (record['constant']) label += ` ${dim('(const)')}`;

  console.log(`${prefix}${connector}${label}`);

  const childPrefix = prefix + (isLast ? '   ' : '\u2502  ');

  // Get child nodes to print
  const childKeys = Object.keys(record).filter(k =>
    !['type', 'position', 'name', 'operator', 'value', 'constant', 'length'].includes(k)
  );

  const children: Array<{ key: string; value: unknown }> = [];
  for (const key of childKeys) {
    const val = record[key];
    if (val === null || val === undefined) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === 'object') {
      children.push({ key, value: val });
    }
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childIsLast = i === children.length - 1;

    if (Array.isArray(child.value)) {
      const arr = child.value as unknown[];
      console.log(`${childPrefix}${childIsLast ? '\u2514\u2500 ' : '\u251C\u2500 '}${dim(child.key + ':')}`);
      const arrPrefix = childPrefix + (childIsLast ? '   ' : '\u2502  ');
      for (let j = 0; j < arr.length; j++) {
        printAstNode(arr[j], arrPrefix, j === arr.length - 1);
      }
    } else if (typeof child.value === 'object' && (child.value as Record<string, unknown>)['type']) {
      console.log(`${childPrefix}${childIsLast ? '\u2514\u2500 ' : '\u251C\u2500 '}${dim(child.key + ':')}`);
      const objPrefix = childPrefix + (childIsLast ? '   ' : '\u2502  ');
      printAstNode(child.value, objPrefix, true);
    }
  }
}

function cmdProfile(filePath: string): void {
  const source = readFileChecked(filePath);
  const resolvedPath = path.resolve(filePath);

  let outputLines = 0;

  const startTime = performance.now();
  const startMem = process.memoryUsage().heapUsed;

  const tinylang = new TinyLang({
    output: () => { outputLines++; },
  });

  // Set up module system
  const loader = new ModuleLoader();
  tinylang.setModuleContext(loader, resolvedPath);

  // Use profiling wrapper
  const origRun = tinylang.run.bind(tinylang);
  const result = origRun(source);

  const endTime = performance.now();
  const endMem = process.memoryUsage().heapUsed;
  const duration = endTime - startTime;

  console.log(bold(`Profile: ${path.basename(filePath)}`));
  console.log('');

  if (!result.success && result.error) {
    console.log(red(`Error: ${result.error.message}`));
    console.log('');
  }

  // Timing
  console.log(cyan('Timing:'));
  console.log(`  Total execution: ${formatDuration(duration)}`);
  console.log(`  Output lines:    ${outputLines}`);
  console.log('');

  // Memory
  const memDiff = endMem - startMem;
  console.log(cyan('Memory:'));
  console.log(`  Heap before:  ${formatBytes(startMem)}`);
  console.log(`  Heap after:   ${formatBytes(endMem)}`);
  console.log(`  Difference:   ${memDiff >= 0 ? '+' : ''}${formatBytes(Math.abs(memDiff))}`);
  console.log('');

  // Parse stats
  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    let fnCount = 0;
    let classCount = 0;
    let stmtCount = 0;

    function countNodes(stmts: Array<{ type: string; methods?: Array<unknown>; body?: Array<unknown> }>): void {
      for (const stmt of stmts) {
        stmtCount++;
        if (stmt.type === 'FunctionDeclaration') fnCount++;
        if (stmt.type === 'ClassDeclaration') {
          classCount++;
          if (stmt.methods) fnCount += (stmt.methods as Array<unknown>).length;
        }
      }
    }
    countNodes(program.body as Array<{ type: string; methods?: Array<unknown>; body?: Array<unknown> }>);

    console.log(cyan('Code Statistics:'));
    console.log(`  Source lines:  ${source.split('\n').length}`);
    console.log(`  Tokens:        ${tokens.length}`);
    console.log(`  Statements:    ${stmtCount}`);
    console.log(`  Functions:     ${fnCount}`);
    console.log(`  Classes:       ${classCount}`);
  } catch {
    // If parsing fails, skip code stats
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cmdWasm(filePath: string, flags: Record<string, string | boolean>): void {
  const source = readFileChecked(filePath);
  const outputPath = typeof flags['output'] === 'string'
    ? flags['output']
    : filePath.replace(/\.tiny$/, '.wat');

  try {
    const compiler = new WasmCompiler();
    const result = compiler.compile(source);

    if (result.errors.length > 0) {
      console.log(yellow('Warnings:'));
      for (const err of result.errors) {
        console.log(yellow(`  - ${err}`));
      }
      console.log('');
    }

    fs.writeFileSync(outputPath, result.wat);
    const bytes = Buffer.byteLength(result.wat, 'utf-8');
    console.log(green(`Compiled to WebAssembly: ${outputPath} (${bytes} bytes)`));
    if (result.exports.length > 0) {
      console.log(dim(`Exports: ${result.exports.join(', ')}`));
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

function cmdVersion(): void {
  console.log(`TinyLang v${VERSION}`);
  console.log(`  Runtime: Node.js ${process.version}`);
  console.log(`  Platform: ${process.platform} ${process.arch}`);
}

function cmdHelp(): void {
  console.log(`
${bold('TinyLang')} v${VERSION} - A minimal educational programming language

${yellow('USAGE:')}
  tinylang <command> [options]

${yellow('COMMANDS:')}
  ${cyan('run')} <file.tiny>        Execute a TinyLang source file
  ${cyan('compile')} <file.tiny>    Compile to bytecode (.tinyc)
  ${cyan('exec')} <file.tinyc>      Execute compiled bytecode
  ${cyan('debug')} <file.tiny>      Start interactive debugger
  ${cyan('fmt')} <file.tiny> ...    Format source code
  ${cyan('lint')} <file.tiny> ...   Static analysis
  ${cyan('test')} [files...]        Run test files
  ${cyan('doc')} <file.tiny>        Generate documentation
  ${cyan('init')} [name]            Scaffold a new project
  ${cyan('bench')} <file.tiny>      Benchmark execution
  ${cyan('repl')}                   Start interactive REPL
  ${cyan('check')} <file.tiny>      Check syntax without executing
  ${cyan('ast')} <file.tiny>        Pretty-print the AST as a tree
  ${cyan('profile')} <file.tiny>    Profile execution (timing, memory, stats)
  ${cyan('wasm')} <file.tiny>       Compile to WebAssembly Text Format (.wat)
  ${cyan('version')}                Show version information
  ${cyan('help')}                   Show this help message

${yellow('OPTIONS:')}
  ${dim('compile:')}  --output/-o <path>  Output file path
             --no-optimize        Skip optimization
             --disassemble/-d     Print disassembly
  ${dim('fmt:')}      --check              Check mode (exit 1 if changes needed)
             --write/-w           Write changes to file
  ${dim('lint:')}     --fix                Auto-fix issues
  ${dim('bench:')}    --iterations/-n <N>  Number of iterations (default: 100)
             --compare            Compare interpreter vs VM
  ${dim('doc:')}      --output/-o <path>   Write to file instead of stdout
  ${dim('wasm:')}     --output/-o <path>   Output .wat file path

${yellow('EXAMPLES:')}
  tinylang run hello.tiny
  tinylang compile app.tiny -o app.tinyc
  tinylang fmt --write src/*.tiny
  tinylang lint --fix main.tiny
  tinylang test
  tinylang bench fib.tiny -n 1000 --compare

${yellow('FILE EXTENSIONS:')}
  ${green('.tiny')}  - TinyLang source file
  ${green('.tinyc')} - Compiled bytecode file
`);
}

function startRepl(): void {
  const repl = new Repl();
  repl.start();
}

// ============ Main Entry Point ============

function main(): void {
  const { command, positional, flags } = parseArgs(process.argv);

  // Handle --help and --version flags without command
  if (flags['help']) {
    cmdHelp();
    return;
  }
  if (flags['version']) {
    cmdVersion();
    return;
  }

  if (!command) {
    startRepl();
    return;
  }

  switch (command) {
    case 'run':
      if (!positional[0]) {
        showError('Please provide a file to run', 'Usage: tinylang run <file.tiny>');
        process.exit(1);
      }
      cmdRun(positional[0]);
      break;

    case 'compile':
      if (!positional[0]) {
        showError('Please provide a file to compile', 'Usage: tinylang compile <file.tiny>');
        process.exit(1);
      }
      cmdCompile(positional[0], flags);
      break;

    case 'exec':
      if (!positional[0]) {
        showError('Please provide a bytecode file', 'Usage: tinylang exec <file.tinyc>');
        process.exit(1);
      }
      cmdExec(positional[0]);
      break;

    case 'debug':
      if (!positional[0]) {
        showError('Please provide a file to debug', 'Usage: tinylang debug <file.tiny>');
        process.exit(1);
      }
      cmdDebug(positional[0]);
      break;

    case 'fmt':
    case 'format':
      cmdFmt(positional.length > 0 ? positional : [], flags);
      break;

    case 'lint':
      cmdLint(positional.length > 0 ? positional : [], flags);
      break;

    case 'test':
      cmdTest(positional, flags);
      break;

    case 'doc':
      if (!positional[0]) {
        showError('Please provide a file', 'Usage: tinylang doc <file.tiny>');
        process.exit(1);
      }
      cmdDoc(positional[0], flags);
      break;

    case 'init':
      cmdInit(positional[0]);
      break;

    case 'bench':
    case 'benchmark':
      if (!positional[0]) {
        showError('Please provide a file to benchmark', 'Usage: tinylang bench <file.tiny>');
        process.exit(1);
      }
      cmdBench(positional[0], flags);
      break;

    case 'repl':
      startRepl();
      break;

    case 'check':
      if (!positional[0]) {
        showError('Please provide a file to check', 'Usage: tinylang check <file.tiny>');
        process.exit(1);
      }
      cmdCheck(positional[0]);
      break;

    case 'ast':
      if (!positional[0]) {
        showError('Please provide a file', 'Usage: tinylang ast <file.tiny>');
        process.exit(1);
      }
      cmdAst(positional[0]);
      break;

    case 'profile':
      if (!positional[0]) {
        showError('Please provide a file to profile', 'Usage: tinylang profile <file.tiny>');
        process.exit(1);
      }
      cmdProfile(positional[0]);
      break;

    case 'wasm':
      if (!positional[0]) {
        showError('Please provide a file to compile', 'Usage: tinylang wasm <file.tiny>');
        process.exit(1);
      }
      cmdWasm(positional[0], flags);
      break;

    case 'version':
    case '--version':
    case '-v':
      cmdVersion();
      break;

    case 'help':
    case '--help':
    case '-h':
      cmdHelp();
      break;

    default:
      // If argument looks like a .tiny file, run it
      if (command.endsWith('.tiny')) {
        cmdRun(command);
      } else if (command.endsWith('.tinyc')) {
        cmdExec(command);
      } else {
        showError(
          `Unknown command: ${command}`,
          'Run "tinylang help" to see available commands'
        );
        process.exit(1);
      }
  }
}

main();
