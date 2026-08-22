/**
 * TinyLang Compiler Module
 *
 * Exports the bytecode compiler, chunk, opcodes, disassembler, and optimizer.
 */

export { Compiler, CompilerError, CompiledFunction } from './compiler';
export { Chunk } from './chunk';
export { OpCode, opcodeName } from './opcodes';
export { disassemble } from './disassembler';
export { optimize } from './optimizer';
export {
  WasmCompiler,
  WasmCompileResult,
  WasmSkippedFunction,
  WasmReport,
  WasmReportLine,
  WasmReportLevel,
  summarizeWasmResult,
} from './wasm-compiler';
