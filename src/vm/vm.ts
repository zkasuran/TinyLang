/**
 * TinyLang Stack-based Virtual Machine
 *
 * Executes bytecode compiled from TinyLang AST.
 * Uses an operand stack and call frame stack for function calls.
 * Registers stdlib globals before execution.
 */

import { Chunk } from '../compiler/chunk';
import { OpCode, CompoundOp } from '../compiler/opcodes';
import { CompiledFunction } from '../compiler/compiler';
import {
  RuntimeValue,
  NumberValue,
  StringValue,
  BooleanValue,
  ArrayValue,
  FunctionValue,
  NativeFunctionValue,
  ClassValue,
  InstanceValue,
  Environment,
  RuntimeError,
  createNumber,
  createString,
  createBoolean,
  createNull,
  createArray,
  createObject,
  isTruthy,
  stringify,
  valueEquals,
} from '../types/values';
import { registerStdlib } from '../stdlib';

/**
 * Call frame for function invocation tracking
 */
interface CallFrame {
  /** The function's bytecode chunk */
  chunk: Chunk;
  /** Instruction pointer (current position in bytecode) */
  ip: number;
  /** Base pointer (start of this frame's locals on the stack) */
  basePointer: number;
  /** Upvalues captured by this closure */
  upvalues: UpvalueObj[];
  /** The 'this' binding for method calls */
  thisBinding: RuntimeValue | null;
  /**
   * How many arguments the caller actually passed, before padding to arity.
   * The default-parameter prologue reads this via LOAD_ARGC so that an omitted
   * argument can be told apart from an explicit null.
   */
  argCount: number;
}

/**
 * An installed `catch` handler, recorded by TRY_BEGIN.
 */
interface TryHandler {
  /** Index into `frames` of the frame that installed the handler. */
  frameIndex: number;
  /** Address of the catch block within that frame's chunk. */
  handlerIp: number;
  /** Operand stack height when the handler was installed. */
  stackHeight: number;
}

interface UpvalueObj {
  value: RuntimeValue;
  location: number | null; // stack index, or null if closed
}

/**
 * Closure representation in the VM
 */
export interface VMClosure {
  type: 'vm-closure';
  fn: CompiledFunction;
  upvalues: UpvalueObj[];
}

/**
 * Raised when the step budget is exhausted. Distinct from RuntimeError so that
 * `try`/`catch` inside the runaway code cannot catch and resume it.
 */
export class StepLimitExceeded extends RuntimeError {}

export type OutputHandler = (message: string) => void;

export interface VMOptions {
  output?: OutputHandler;
  maxSteps?: number;
  input?: (prompt: string) => string;
}

export class VM {
  private stack: RuntimeValue[] = [];
  private frames: CallFrame[] = [];
  private handlers: TryHandler[] = [];
  private globals: Map<string, RuntimeValue> = new Map();
  private output: OutputHandler;
  private maxSteps: number;
  private steps: number = 0;
  private outputBuffer: string[] = [];

  constructor(options: VMOptions = {}) {
    this.output = options.output || ((msg: string) => console.log(msg));
    this.maxSteps = options.maxSteps || 10_000_000;

    // Register stdlib into globals
    this.registerStdlibGlobals(options);
  }

  private registerStdlibGlobals(options: VMOptions): void {
    const env = new Environment();
    const captureOutput = (msg: string) => {
      this.outputBuffer.push(msg);
      this.output(msg);
    };
    registerStdlib(env, {
      output: captureOutput,
      input: options.input,
    });

    // Extract all globals from the stdlib environment
    // We'll use a helper to walk the environment
    this.extractGlobalsFromEnv(env);

    // Register the __range builtin for range expressions
    this.globals.set('__range', {
      type: 'native-function',
      name: '__range',
      arity: 3,
      fn: (args: RuntimeValue[]) => {
        const start = args[0] as NumberValue;
        const end = args[1] as NumberValue;
        const inclusive = args[2] as BooleanValue;

        if (start.type !== 'number' || end.type !== 'number') {
          throw new RuntimeError(
            `Range bounds must be numbers. Got ${start.type} and ${end.type}.`,
            this.currentLine()
          );
        }

        // Mirrors the interpreter's evalRangeExpression exactly, including the
        // descending case and the element cap. This only counted upwards
        // before, so `for i in 5..1` silently produced an empty array and the
        // loop body never ran, while the interpreter iterated 5 4 3 2.
        const elements: RuntimeValue[] = [];
        const startVal = Math.floor(start.value);
        const endVal = Math.floor(end.value);
        const limit = inclusive.value ? endVal : endVal - 1;

        const guard = (): void => {
          if (elements.length > 10000) {
            throw new RuntimeError(
              'Range too large! Maximum range size is 10,000 elements. Try a smaller range.',
              this.currentLine()
            );
          }
        };

        if (startVal <= limit) {
          for (let i = startVal; i <= limit; i++) {
            elements.push(createNumber(i));
            guard();
          }
        } else {
          const floor = inclusive.value ? endVal : endVal + 1;
          for (let i = startVal; i >= floor; i--) {
            elements.push(createNumber(i));
            guard();
          }
        }

        return createArray(elements);
      },
    });
  }

  private extractGlobalsFromEnv(env: Environment): void {
    // Extract ALL variables registered in the environment dynamically.
    // This ensures every stdlib function is available in the VM without
    // needing to maintain a hardcoded list that can fall out of sync.
    const allVars = env.getAll();
    for (const [name, value] of allVars) {
      this.globals.set(name, value);
    }
  }

  /**
   * Execute a bytecode chunk and return the result
   */
  run(chunk: Chunk): RuntimeValue {
    this.stack = [];
    this.frames = [];
    this.handlers = [];
    this.steps = 0;
    this.outputBuffer = [];

    // Push the initial frame
    this.frames.push({
      chunk,
      ip: 0,
      basePointer: 0,
      upvalues: [],
      thisBinding: null,
      argCount: 0,
    });

    return this.execute();
  }

  /**
   * Get captured output
   */
  getOutput(): string[] {
    return [...this.outputBuffer];
  }

  private get currentFrame(): CallFrame {
    return this.frames[this.frames.length - 1];
  }

  private readByte(): number {
    return this.currentFrame.chunk.code[this.currentFrame.ip++];
  }

  private read16(): number {
    const frame = this.currentFrame;
    const value = (frame.chunk.code[frame.ip] << 8) | frame.chunk.code[frame.ip + 1];
    frame.ip += 2;
    return value;
  }

  private push(value: RuntimeValue): void {
    this.stack.push(value);
  }

  private pop(): RuntimeValue {
    const value = this.stack.pop();
    if (value === undefined) {
      throw new RuntimeError('Stack underflow');
    }
    return value;
  }

  private peek(distance: number = 0): RuntimeValue {
    return this.stack[this.stack.length - 1 - distance];
  }

  private currentLine(): number {
    const frame = this.currentFrame;
    return frame.chunk.lines[frame.ip - 1] || 1;
  }

  /**
   * Run the dispatch loop.
   *
   * @param stopDepth Frame depth at which to stop and return. 0 means "run to
   *   completion" (top-level). A non-zero value is used by callFromNative() to
   *   run a single nested call and hand control back to the native caller.
   */
  private execute(stopDepth: number = 0): RuntimeValue {
    // The dispatch loop itself is unaware of try/catch. When anything throws,
    // control lands here; if a handler installed by this invocation covers the
    // throw we rewind the machine to it and resume dispatching, otherwise the
    // error keeps propagating (out through a native frame if need be).
    while (true) {
      try {
        return this.dispatch(stopDepth);
      } catch (error) {
        if (!this.unwindToHandler(error, stopDepth)) {
          throw error;
        }
      }
    }
  }

  /**
   * Rewind to the innermost catch handler that this invocation of the dispatch
   * loop is responsible for, pushing the error object for the catch block.
   *
   * Returns false when no such handler exists, in which case the caller must
   * let the error propagate. Handlers belonging to frames below `stopDepth` are
   * deliberately left alone: those frames are owned by an outer dispatch loop,
   * possibly with native code in between, so unwinding to them has to happen as
   * a real JS throw rather than a bytecode jump.
   */
  private unwindToHandler(error: unknown, stopDepth: number): boolean {
    if (error instanceof StepLimitExceeded) {
      // A runaway program must not be catchable, or a `catch` inside the
      // offending loop would swallow the limit and spin forever.
      return false;
    }

    while (this.handlers.length > 0) {
      const handler = this.handlers[this.handlers.length - 1];
      if (handler.frameIndex < stopDepth) {
        return false;
      }
      this.handlers.pop();

      // Defensive: a handler whose frame is already gone cannot be resumed.
      // Setting frames.length past the end would leave a hole and the next
      // dereference would fail with a bare TypeError.
      if (handler.frameIndex >= this.frames.length) {
        continue;
      }

      this.frames.length = handler.frameIndex + 1;
      this.frames[handler.frameIndex].ip = handler.handlerIp;
      this.stack.length = handler.stackHeight;
      this.push(this.makeErrorValue(error));
      return true;
    }
    return false;
  }

  /**
   * Build the object a `catch` clause binds, mirroring the interpreter: a
   * `message` string, plus a `line` for errors that carry one.
   */
  private makeErrorValue(error: unknown): RuntimeValue {
    const properties = new Map<string, RuntimeValue>();
    if (error instanceof RuntimeError) {
      properties.set('message', createString(error.message));
      properties.set('line', error.line ? createNumber(error.line) : createNull());
    } else if (error instanceof Error) {
      properties.set('message', createString(error.message));
    } else {
      properties.set('message', createString(String(error)));
    }
    return createObject(properties);
  }

  private dispatch(stopDepth: number): RuntimeValue {
    while (true) {
      if (this.steps++ > this.maxSteps) {
        throw new StepLimitExceeded(
          'Maximum execution steps exceeded (possible infinite loop)',
          this.currentLine()
        );
      }

      const instruction = this.readByte();

      switch (instruction) {
        case OpCode.CONST: {
          const idx = this.read16();
          const value = this.currentFrame.chunk.constants[idx];
          this.push(value);
          break;
        }

        case OpCode.POP:
          this.pop();
          break;

        case OpCode.DUP:
          this.push(this.peek());
          break;

        case OpCode.ROT: {
          const count = this.read16();
          // Move the deepest of the top `count` values to the top:
          // [a, b, c] -> [b, c, a]
          const from = this.stack.length - count;
          if (from < 0) {
            throw new RuntimeError('Stack underflow');
          }
          const [value] = this.stack.splice(from, 1);
          this.stack.push(value);
          break;
        }

        case OpCode.COMPOUND: {
          const op = this.read16();
          const value = this.pop();
          const current = this.pop();
          this.push(this.applyCompound(current, value, op));
          break;
        }

        case OpCode.DUP2: {
          // Copy the top two values keeping their relative order:
          // [a, b] -> [a, b, a, b]
          const b = this.peek(0);
          const a = this.peek(1);
          this.push(a);
          this.push(b);
          break;
        }

        case OpCode.ADD: {
          const b = this.pop();
          const a = this.pop();
          if (a.type === 'number' && b.type === 'number') {
            this.push(createNumber(a.value + b.value));
          } else if (a.type === 'string' || b.type === 'string') {
            this.push(createString(stringify(a) + stringify(b)));
          } else if (a.type === 'array' && b.type === 'array') {
            this.push(createArray([...a.elements, ...b.elements]));
          } else {
            throw new RuntimeError(
              `Cannot add ${a.type} and ${b.type}. The + operator works with numbers, strings, and arrays.`,
              this.currentLine()
            );
          }
          break;
        }

        case OpCode.SUB: {
          const [a, b] = this.popNumericOperands();
          this.push(createNumber(a - b));
          break;
        }

        case OpCode.MUL: {
          const b = this.pop();
          const a = this.pop();
          if (a.type === 'number' && b.type === 'number') {
            this.push(createNumber(a.value * b.value));
          } else if (a.type === 'string' && b.type === 'number') {
            this.push(createString(a.value.repeat(Math.floor(b.value))));
          } else if (a.type === 'number' && b.type === 'string') {
            this.push(createString(b.value.repeat(Math.floor(a.value))));
          } else {
            throw new RuntimeError(
              `Cannot multiply ${a.type} and ${b.type}`,
              this.currentLine()
            );
          }
          break;
        }

        case OpCode.DIV: {
          const b = this.pop();
          const a = this.pop();
          if (a.type !== 'number' || b.type !== 'number') {
            throw new RuntimeError(
              `Cannot divide ${a.type} by ${b.type}. Division only works with numbers.`,
              this.currentLine()
            );
          }
          if (b.value === 0) {
            throw new RuntimeError(
              `Division by zero! You tried to divide ${a.value} by 0, which is undefined in mathematics.`,
              this.currentLine()
            );
          }
          this.push(createNumber(a.value / b.value));
          break;
        }

        case OpCode.MOD: {
          const [a, b] = this.popNumericOperands();
          this.push(createNumber(a % b));
          break;
        }

        case OpCode.POW: {
          const [a, b] = this.popNumericOperands();
          this.push(createNumber(Math.pow(a, b)));
          break;
        }

        case OpCode.NEGATE: {
          const val = this.pop();
          if (val.type !== 'number') {
            throw new RuntimeError(
              `Cannot negate ${val.type}. The - operator only works with numbers.`,
              this.currentLine()
            );
          }
          this.push(createNumber(-val.value));
          break;
        }

        case OpCode.EQ: {
          const b = this.pop();
          const a = this.pop();
          this.push(createBoolean(valueEquals(a, b)));
          break;
        }

        case OpCode.NEQ: {
          const b = this.pop();
          const a = this.pop();
          this.push(createBoolean(!valueEquals(a, b)));
          break;
        }

        case OpCode.LT:
          this.compareOperands((a, b) => a < b);
          break;

        case OpCode.LTE:
          this.compareOperands((a, b) => a <= b);
          break;

        case OpCode.GT:
          this.compareOperands((a, b) => a > b);
          break;

        case OpCode.GTE:
          this.compareOperands((a, b) => a >= b);
          break;

        case OpCode.NOT: {
          const val = this.pop();
          this.push(createBoolean(!isTruthy(val)));
          break;
        }

        case OpCode.AND: {
          // This shouldn't normally be emitted (logical AND uses short-circuit jumps)
          // but handle it anyway
          const b = this.pop();
          const a = this.pop();
          this.push(isTruthy(a) ? b : a);
          break;
        }

        case OpCode.OR: {
          const b = this.pop();
          const a = this.pop();
          this.push(isTruthy(a) ? a : b);
          break;
        }

        case OpCode.JMP: {
          const target = this.read16();
          this.currentFrame.ip = target;
          break;
        }

        case OpCode.JMP_IF_FALSE: {
          const target = this.read16();
          if (!isTruthy(this.peek())) {
            this.currentFrame.ip = target;
          }
          break;
        }

        case OpCode.JMP_IF_TRUE: {
          const target = this.read16();
          if (isTruthy(this.peek())) {
            this.currentFrame.ip = target;
          }
          break;
        }

        case OpCode.LOOP: {
          const target = this.read16();
          this.currentFrame.ip = target;
          break;
        }

        case OpCode.JMP_IF_NULL: {
          const target = this.read16();
          // Peeks: the null itself becomes the value of an `?.` chain.
          if (this.peek().type === 'null') {
            this.currentFrame.ip = target;
          }
          break;
        }

        case OpCode.LOAD_LOCAL: {
          const slot = this.read16();
          const value = this.stack[this.currentFrame.basePointer + slot];
          this.push(value);
          break;
        }

        case OpCode.STORE_LOCAL: {
          const slot = this.read16();
          this.stack[this.currentFrame.basePointer + slot] = this.peek();
          this.pop(); // Consume the value
          break;
        }

        case OpCode.LOAD_GLOBAL: {
          const nameIdx = this.read16();
          const name = this.currentFrame.chunk.constants[nameIdx] as StringValue;
          const value = this.globals.get(name.value);
          if (value === undefined) {
            throw new RuntimeError(
              `Variable '${name.value}' is not defined`,
              this.currentLine()
            );
          }
          this.push(value);
          break;
        }

        case OpCode.STORE_GLOBAL: {
          const nameIdx = this.read16();
          const name = this.currentFrame.chunk.constants[nameIdx] as StringValue;
          const value = this.pop(); // Consume the value
          this.globals.set(name.value, value);
          break;
        }

        case OpCode.LOAD_UPVALUE: {
          const idx = this.read16();
          const upvalue = this.currentFrame.upvalues[idx];
          if (upvalue) {
            this.push(upvalue.value);
          } else {
            this.push(createNull());
          }
          break;
        }

        case OpCode.STORE_UPVALUE: {
          const idx = this.read16();
          const upvalue = this.currentFrame.upvalues[idx];
          if (upvalue) {
            upvalue.value = this.peek();
          }
          this.pop(); // Consume the value
          break;
        }

        case OpCode.LOAD_ARGC:
          this.push(createNumber(this.currentFrame.argCount));
          break;

        case OpCode.CALL: {
          const argCount = this.read16();
          const callee = this.stack[this.stack.length - 1 - argCount];
          this.callValue(callee, argCount);
          break;
        }

        case OpCode.RETURN: {
          const result = this.pop();
          const frame = this.frames.pop()!;

          // A `return` inside a try block jumps straight out without reaching
          // TRY_END, so drop any handlers the departing frame installed.
          while (
            this.handlers.length > 0 &&
            this.handlers[this.handlers.length - 1].frameIndex >= this.frames.length
          ) {
            this.handlers.pop();
          }

          if (this.frames.length === 0) {
            // Return from top-level - done
            return result;
          }

          // Check if this was a constructor call - return instance instead
          const isConstructor = (frame as CallFrame & { isConstructor?: boolean }).isConstructor;
          const returnValue = isConstructor
            ? (frame as CallFrame & { constructorInstance: RuntimeValue }).constructorInstance
            : result;

          // Discard the frame's locals and the callee from the stack
          // The callee sits at basePointer - 1
          this.stack.length = frame.basePointer - 1;
          this.push(returnValue);

          // A nested call started by callFromNative() has finished; return
          // control to the native function that initiated it.
          if (this.frames.length === stopDepth) {
            return returnValue;
          }
          break;
        }

        case OpCode.CLOSURE: {
          const fnIdx = this.read16();
          const fn = this.currentFrame.chunk.constants[fnIdx] as CompiledFunction;
          const upvalues: UpvalueObj[] = [];

          const fnWithUpvalues = fn as CompiledFunction & { upvalues?: { index: number; isLocal: boolean }[] };
          if (fnWithUpvalues.upvalues) {
            for (const uv of fnWithUpvalues.upvalues) {
              if (uv.isLocal) {
                // Capture from current frame's locals
                const value = this.stack[this.currentFrame.basePointer + uv.index];
                upvalues.push({ value, location: this.currentFrame.basePointer + uv.index });
              } else {
                // Capture from enclosing closure's upvalues
                upvalues.push(this.currentFrame.upvalues[uv.index]);
              }
            }
          }

          const closure: VMClosure = {
            type: 'vm-closure',
            fn,
            upvalues,
          };

          // A function defined inside a method must see the same `this`. The
          // interpreter gets this for free because `this` lives in the method's
          // environment and the nested function closes over it; here the
          // binding has to be captured explicitly, or `this.x` inside a
          // callback passed to map/filter reads null.
          const enclosingThis = this.currentFrame.thisBinding;
          if (enclosingThis) {
            (closure as VMClosure & { boundThis: RuntimeValue }).boundThis =
              enclosingThis;
          }

          this.push(closure as unknown as RuntimeValue);
          break;
        }

        case OpCode.ARRAY: {
          const count = this.read16();
          const elements: RuntimeValue[] = [];
          for (let i = count - 1; i >= 0; i--) {
            elements.unshift(this.pop());
          }
          this.push(createArray(elements));
          break;
        }

        case OpCode.OBJECT: {
          const count = this.read16();
          // Popping yields the pairs in reverse source order, so collect them
          // first and only then insert. A Map preserves insertion order, and
          // stringify()/keys() expose that order, so inserting as popped would
          // make the VM print `{third: 3, ..., first: 1}`.
          const pairs: [string, RuntimeValue][] = new Array(count);
          for (let i = count - 1; i >= 0; i--) {
            const value = this.pop();
            const key = this.pop() as StringValue;
            pairs[i] = [key.value, value];
          }
          const properties = new Map<string, RuntimeValue>();
          for (const [key, value] of pairs) {
            properties.set(key, value);
          }
          this.push(createObject(properties));
          break;
        }

        case OpCode.CHECK_ITERABLE: {
          const iterable = this.peek();
          if (iterable.type !== 'array' && iterable.type !== 'string') {
            throw new RuntimeError(
              `Cannot iterate over ${iterable.type}. For loops work with arrays, strings, and ranges.`,
              this.currentLine()
            );
          }
          break;
        }

        case OpCode.ARRAY_APPEND: {
          const value = this.pop();
          const arr = this.peek() as ArrayValue;
          arr.elements.push(value);
          break;
        }

        case OpCode.ARRAY_SPREAD: {
          const value = this.pop();
          const arr = this.peek() as ArrayValue;
          if (value.type === 'array') {
            arr.elements.push(...value.elements);
          } else if (value.type === 'string') {
            arr.elements.push(...value.value.split('').map(createString));
          } else {
            throw new RuntimeError(
              `Cannot spread ${value.type}. Spread (...) works with arrays and strings.`,
              this.currentLine()
            );
          }
          break;
        }

        case OpCode.DESTRUCT_ELEM: {
          const index = this.read16();
          const subject = this.pop();
          if (subject.type !== 'array') {
            throw new RuntimeError(
              `Cannot destructure ${subject.type} as an array. Right side must be an array.`,
              this.currentLine()
            );
          }
          this.push(
            index < subject.elements.length ? subject.elements[index] : createNull()
          );
          break;
        }

        case OpCode.DESTRUCT_PROP: {
          const keyIdx = this.read16();
          const key = this.currentFrame.chunk.constants[keyIdx] as StringValue;
          const subject = this.pop();
          if (subject.type !== 'object') {
            throw new RuntimeError(
              `Cannot destructure ${subject.type} as an object. Right side must be an object.`,
              this.currentLine()
            );
          }
          this.push(subject.properties.get(key.value) || createNull());
          break;
        }

        case OpCode.INDEX: {
          const index = this.pop();
          const obj = this.pop();
          this.push(this.performIndex(obj, index));
          break;
        }

        case OpCode.INDEX_OPTIONAL: {
          const index = this.pop();
          const obj = this.pop();
          this.push(this.performIndex(obj, index, true));
          break;
        }

        case OpCode.SET_INDEX: {
          const value = this.pop();
          const index = this.pop();
          const obj = this.pop();
          this.performSetIndex(obj, index, value);
          this.push(value);
          break;
        }

        case OpCode.GET_PROP: {
          const propIdx = this.read16();
          const propName = this.currentFrame.chunk.constants[propIdx] as StringValue;
          const obj = this.pop();
          this.push(this.performGetProp(obj, propName.value));
          break;
        }

        case OpCode.GET_METHOD: {
          const propIdx = this.read16();
          const propName = this.currentFrame.chunk.constants[propIdx] as StringValue;
          const obj = this.pop();
          this.push(this.performGetMethod(obj, propName.value));
          break;
        }

        case OpCode.SET_PROP: {
          const propIdx = this.read16();
          const propName = this.currentFrame.chunk.constants[propIdx] as StringValue;
          const value = this.pop();
          const obj = this.pop();
          this.performSetProp(obj, propName.value, value);
          this.push(value);
          break;
        }

        case OpCode.CLASS: {
          const nameIdx = this.read16();
          const name = this.currentFrame.chunk.constants[nameIdx] as StringValue;
          const classVal: ClassValue = {
            type: 'class',
            name: name.value,
            superClass: null,
            methods: new Map(),
            properties: new Map(),
          };
          this.push(classVal);
          break;
        }

        case OpCode.METHOD: {
          const nameIdx = this.read16();
          const methodName = this.currentFrame.chunk.constants[nameIdx] as StringValue;
          const closure = this.pop();
          const classVal = this.pop() as ClassValue;
          // Store the closure as a method
          classVal.methods.set(methodName.value, closure as unknown as FunctionValue);
          this.push(classVal);
          break;
        }

        case OpCode.INHERIT: {
          const subclass = this.pop() as ClassValue;
          const superclass = this.pop() as ClassValue;
          if (superclass.type !== 'class') {
            throw new RuntimeError('Superclass must be a class', this.currentLine());
          }
          subclass.superClass = superclass;
          // Copy methods from superclass
          for (const [name, method] of superclass.methods) {
            if (!subclass.methods.has(name)) {
              subclass.methods.set(name, method);
            }
          }
          break;
        }

        case OpCode.NEW_INSTANCE: {
          const argCount = this.read16();
          const classVal = this.stack[this.stack.length - 1 - argCount] as ClassValue;

          if (classVal.type !== 'class') {
            throw new RuntimeError(`'${stringify(classVal)}' is not a class`, this.currentLine());
          }

          const instance = this.instantiate(classVal);

          // Check for init/constructor method
          const initMethod = classVal.methods.get('init') || classVal.methods.get('constructor');
          if (initMethod) {
            // Replace the class with a dummy placeholder to serve as "callee" slot
            // Stack: [..., classVal, arg1, ..., argN]
            // We want init to run with args, this = instance, then return instance
            this.stack[this.stack.length - 1 - argCount] = instance;
            // callMethod uses this.stack.length - argCount as basePointer
            // so args start at basePointer, and instance is at basePointer - 1
            if ((initMethod as unknown as VMClosure).type === 'vm-closure') {
              const closure = initMethod as unknown as VMClosure;
              this.reconcileArity(closure.fn.arity, argCount);
              const frame: CallFrame = {
                chunk: closure.fn.chunk,
                ip: 0,
                basePointer: this.stack.length - closure.fn.arity,
                upvalues: closure.upvalues,
                thisBinding: instance,
                argCount,
              };
              // Mark this frame so RETURN knows to return 'this' instead of the return value
              (frame as CallFrame & { isConstructor: boolean }).isConstructor = true;
              (frame as CallFrame & { constructorInstance: RuntimeValue }).constructorInstance = instance;
              this.frames.push(frame);
            } else if ((initMethod as unknown as NativeFunctionValue).type === 'native-function') {
              // Native init
              const args: RuntimeValue[] = [];
              for (let i = 0; i < argCount; i++) {
                args.unshift(this.pop());
              }
              this.pop(); // Remove instance from callee slot
              (initMethod as unknown as NativeFunctionValue).fn(args, new Environment());
              this.push(instance);
            }
          } else {
            // No init: remove args and class from stack, push instance
            for (let i = 0; i < argCount; i++) {
              this.pop();
            }
            this.stack[this.stack.length - 1] = instance;
          }
          break;
        }

        case OpCode.GET_THIS: {
          const thisVal = this.currentFrame.thisBinding;
          if (thisVal) {
            this.push(thisVal);
          } else {
            this.push(createNull());
          }
          break;
        }

        case OpCode.PRINT: {
          const count = this.read16();
          const values: string[] = [];
          for (let i = 0; i < count; i++) {
            values.unshift(stringify(this.pop()));
          }
          const message = values.join(' ');
          this.outputBuffer.push(message);
          this.output(message);
          break;
        }

        case OpCode.TRY_BEGIN: {
          const handlerIp = this.read16();
          this.handlers.push({
            frameIndex: this.frames.length - 1,
            handlerIp,
            stackHeight: this.stack.length,
          });
          break;
        }

        case OpCode.TRY_END:
          this.handlers.pop();
          break;

        case OpCode.THROW: {
          const value = this.pop();
          throw new RuntimeError(this.throwMessage(value), this.currentLine());
        }

        case OpCode.HALT: {
          // Return the top of stack if anything is there, otherwise null
          return this.stack.length > 0 ? this.stack[this.stack.length - 1] : createNull();
        }

        default:
          throw new RuntimeError(
            `Unknown opcode: 0x${instruction.toString(16)}`,
            this.currentLine()
          );
      }
    }
  }

  /**
   * Message for a thrown value, matching the interpreter's evalThrowStatement.
   */
  private throwMessage(value: RuntimeValue): string {
    if (value.type === 'string') {
      return value.value;
    }
    if (value.type === 'object' && value.properties.has('message')) {
      const msg = value.properties.get('message')!;
      return msg.type === 'string' ? msg.value : stringify(msg);
    }
    return stringify(value);
  }

  /**
   * Apply a compound-assignment operator, mirroring the interpreter's
   * evalCompoundAssignment. Deliberately stricter than the equivalent binary
   * operator: `s += "!"` concatenates for `+` but is an error for `+=`.
   */
  private applyCompound(
    current: RuntimeValue,
    value: RuntimeValue,
    op: number
  ): RuntimeValue {
    if (current.type !== 'number' || value.type !== 'number') {
      throw new RuntimeError(
        'Compound assignment operators only work with numbers',
        this.currentLine()
      );
    }
    switch (op) {
      case CompoundOp.ADD:
        return createNumber(current.value + value.value);
      case CompoundOp.SUB:
        return createNumber(current.value - value.value);
      case CompoundOp.MUL:
        return createNumber(current.value * value.value);
      case CompoundOp.DIV:
        if (value.value === 0) {
          throw new RuntimeError('Division by zero!', this.currentLine());
        }
        return createNumber(current.value / value.value);
      default:
        throw new RuntimeError(
          `Unknown assignment operator: ${op}`,
          this.currentLine()
        );
    }
  }

  /** Operands of an arithmetic opcode, validated the way the interpreter does. */
  private popNumericOperands(): [number, number] {
    const b = this.pop();
    const a = this.pop();
    if (a.type !== 'number' || b.type !== 'number') {
      throw new RuntimeError(
        `Cannot perform arithmetic on ${a.type} and ${b.type}. Arithmetic operators only work with numbers.`,
        this.currentLine()
      );
    }
    return [a.value, b.value];
  }

  /**
   * Comparison, matching the interpreter: numbers compare numerically, strings
   * by locale, and anything else is an error rather than a silent NaN.
   */
  private compareOperands(op: (a: number, b: number) => boolean): void {
    const b = this.pop();
    const a = this.pop();
    if (a.type === 'number' && b.type === 'number') {
      this.push(createBoolean(op(a.value, b.value)));
      return;
    }
    if (a.type === 'string' && b.type === 'string') {
      this.push(createBoolean(op(a.value.localeCompare(b.value), 0)));
      return;
    }
    throw new RuntimeError(
      `Cannot compare ${a.type} and ${b.type}. Comparison works with numbers and strings.`,
      this.currentLine()
    );
  }

  private callValue(callee: RuntimeValue, argCount: number): void {
    if ((callee as unknown as VMClosure).type === 'vm-closure') {
      this.callClosure(callee as unknown as VMClosure, argCount);
    } else if (callee.type === 'native-function') {
      this.callNative(callee, argCount);
    } else if (callee.type === 'function') {
      // Tree-walk style function - shouldn't happen in VM but handle gracefully
      throw new RuntimeError('Cannot call tree-walk function in VM', this.currentLine());
    } else if (callee.type === 'class') {
      // Class call = instantiation (handled by NEW_INSTANCE usually)
      // But if called directly (e.g., as a function), treat as constructor
      this.callClass(callee, argCount);
    } else {
      throw new RuntimeError(
        `'${stringify(callee)}' is not callable`,
        this.currentLine()
      );
    }
  }

  /**
   * Reconcile the arguments on the stack with the callee's arity so the frame's
   * locals occupy exactly the slots the compiler assigned them.
   *
   * Missing arguments are padded with null (the default-parameter prologue then
   * overwrites them where a default exists). Surplus arguments are discarded:
   * leaving them would push basePointer below where the compiler expects it and
   * shift every local index in the callee.
   */
  private reconcileArity(arity: number, argCount: number): void {
    for (let i = argCount; i > arity; i--) {
      this.pop();
    }
    for (let i = argCount; i < arity; i++) {
      this.push(createNull());
    }
  }

  private callClosure(closure: VMClosure, argCount: number): void {
    const fn = closure.fn;

    this.reconcileArity(fn.arity, argCount);

    // Check if this closure has a bound 'this'
    const boundThis = (closure as VMClosure & { boundThis?: RuntimeValue }).boundThis || null;

    const frame: CallFrame = {
      chunk: fn.chunk,
      ip: 0,
      basePointer: this.stack.length - fn.arity,
      upvalues: closure.upvalues,
      thisBinding: boundThis,
      // The count as written at the call site, so LOAD_ARGC can tell an omitted
      // argument from an explicit null.
      argCount,
    };
    this.frames.push(frame);
  }

  /**
   * Invoke a callable from inside native code, e.g. the callback passed to
   * array methods like map/filter/reduce/forEach.
   *
   * Native functions are called directly. VM closures require re-entering the
   * dispatch loop: we lay out the callee and arguments on the stack exactly as
   * a CALL instruction would, push the frame, then run until that frame
   * returns. This is what makes higher-order array methods work in the VM.
   */
  public callFromNative(callee: RuntimeValue, args: RuntimeValue[]): RuntimeValue {
    if (callee.type === 'native-function') {
      return callee.fn(args, new Environment());
    }

    if ((callee as unknown as VMClosure).type === 'vm-closure') {
      const closure = callee as unknown as VMClosure;
      const depthBefore = this.frames.length;

      // Stack layout expected by callClosure: callee, then args
      this.push(callee);
      for (const arg of args) {
        this.push(arg);
      }
      this.callClosure(closure, args.length);
      this.execute(depthBefore);
      return this.pop();
    }

    throw new RuntimeError(
      `'${stringify(callee)}' is not callable`,
      this.currentLine()
    );
  }

  /**
   * Invoke a native (stdlib) function.
   *
   * `checkArity` mirrors where the interpreter performs the check: its
   * `callFunction` rejects a wrong argument count for a native function value,
   * but `tryBuiltinMethod` - the `arr.push(...)` / `s.split(...)` path - runs
   * before that and does not. Checking unconditionally here would make the VM
   * stricter than the reference on method calls.
   */
  private callNative(
    fn: NativeFunctionValue,
    argCount: number,
    checkArity: boolean = true
  ): void {
    const args: RuntimeValue[] = [];
    for (let i = 0; i < argCount; i++) {
      args.unshift(this.pop());
    }
    this.pop(); // Pop the function itself

    // arity -1 means variadic. The VM previously ignored arity entirely, so
    // `abs(-3, 99)` succeeded here while the interpreter rejected it.
    if (checkArity && fn.arity >= 0 && args.length !== fn.arity) {
      throw new RuntimeError(
        `'${fn.name}' expects ${fn.arity} argument(s), but got ${args.length}`,
        this.currentLine()
      );
    }

    const env = new Environment();
    const result = fn.fn(args, env);
    this.push(result);
  }

  /**
   * Create an instance seeded with the class's declared property defaults, then
   * any the superclass declares that the subclass does not override. INHERIT
   * copies methods but not properties, so the chain is walked here, matching the
   * interpreter's evalNewExpression.
   */
  private instantiate(classVal: ClassValue): InstanceValue {
    const properties = new Map(classVal.properties);
    if (classVal.superClass) {
      for (const [key, value] of classVal.superClass.properties) {
        if (!properties.has(key)) {
          properties.set(key, value);
        }
      }
    }
    return {
      type: 'instance',
      className: classVal.name,
      classRef: classVal,
      properties,
    };
  }

  private callClass(classVal: ClassValue, argCount: number): void {
    const instance = this.instantiate(classVal);

    const initMethod = classVal.methods.get('init') || classVal.methods.get('constructor');
    if (initMethod) {
      // Replace class on stack with instance
      this.stack[this.stack.length - 1 - argCount] = instance;
      this.callMethod(instance, initMethod, argCount);
    } else {
      for (let i = 0; i < argCount; i++) {
        this.pop();
      }
      this.stack[this.stack.length - 1] = instance;
    }
  }

  private callMethod(
    instance: RuntimeValue,
    method: RuntimeValue,
    argCount: number
  ): void {
    if ((method as unknown as VMClosure).type === 'vm-closure') {
      const closure = method as unknown as VMClosure;
      this.reconcileArity(closure.fn.arity, argCount);
      const frame: CallFrame = {
        chunk: closure.fn.chunk,
        ip: 0,
        basePointer: this.stack.length - closure.fn.arity,
        upvalues: closure.upvalues,
        thisBinding: instance,
        argCount,
      };
      this.frames.push(frame);
    } else if (method.type === 'native-function') {
      // Builtin methods are the interpreter's tryBuiltinMethod path, which does
      // not arity-check. See callNative.
      this.callNative(method, argCount, false);
    }
  }

  /**
   * Index into an array, string or object.
   *
   * An out-of-range index is an error, matching the interpreter, which reports
   * it rather than yielding null. Returning null here instead meant a
   * `try`/`catch` around a bad index saw nothing to catch and the program
   * carried on with a bogus value.
   *
   * @param optional Set for `?.[]`, where the interpreter does yield null
   *   out of range instead of throwing.
   */
  private performIndex(
    obj: RuntimeValue,
    index: RuntimeValue,
    optional = false
  ): RuntimeValue {
    if (obj.type === 'array') {
      if (index.type !== 'number') {
        throw new RuntimeError(
          `Array index must be a number, got ${index.type}`,
          this.currentLine()
        );
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.elements.length) {
        if (optional) return createNull();
        throw new RuntimeError(
          `Array index ${idx} is out of bounds. Array has ${obj.elements.length} elements (valid indices: 0 to ${obj.elements.length - 1}).`,
          this.currentLine()
        );
      }
      return obj.elements[idx];
    }
    if (obj.type === 'object') {
      if (index.type !== 'string') {
        throw new RuntimeError(
          `Object keys must be strings, got ${index.type}`,
          this.currentLine()
        );
      }
      return obj.properties.get(index.value) || createNull();
    }
    if (obj.type === 'string') {
      if (index.type !== 'number') {
        throw new RuntimeError(
          `String index must be a number, got ${index.type}`,
          this.currentLine()
        );
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.value.length) {
        if (optional) return createNull();
        throw new RuntimeError(
          `String index ${idx} is out of bounds. String has ${obj.value.length} characters.`,
          this.currentLine()
        );
      }
      return createString(obj.value[idx]);
    }
    if (optional) {
      throw new RuntimeError(`Cannot index into ${obj.type}`, this.currentLine());
    }
    throw new RuntimeError(
      `Cannot index into ${obj.type}. Indexing works with arrays, strings, and objects.`,
      this.currentLine()
    );
  }

  /**
   * Indexed assignment.
   *
   * Only arrays with a numeric index are assignable, matching the interpreter's
   * evalAssignmentExpression. Notably `o["k"] = v` is rejected even though
   * `o["k"]` reads fine; the VM used to allow it, which made the two engines
   * disagree on a program the reference implementation refuses to run.
   */
  private performSetIndex(obj: RuntimeValue, index: RuntimeValue, value: RuntimeValue): void {
    if (obj.type !== 'array' || index.type !== 'number') {
      throw new RuntimeError(
        `Cannot assign to index of ${obj.type}`,
        this.currentLine()
      );
    }
    obj.elements[index.value] = value;
  }

  private performGetProp(obj: RuntimeValue, prop: string): RuntimeValue {
    if (obj.type === 'instance') {
      // Check instance properties first
      if (obj.properties.has(prop)) {
        return obj.properties.get(prop)!;
      }
      // Then check class methods
      const method = obj.classRef.methods.get(prop);
      if (method) {
        // Bind method to instance
        if ((method as unknown as VMClosure).type === 'vm-closure') {
          const closure = method as unknown as VMClosure;
          const boundClosure: VMClosure = {
            type: 'vm-closure',
            fn: closure.fn,
            upvalues: closure.upvalues,
          };
          // We'll set thisBinding when calling
          (boundClosure as VMClosure & { boundThis: RuntimeValue }).boundThis = obj;
          return boundClosure as unknown as RuntimeValue;
        }
        return method as unknown as RuntimeValue;
      }
      return createNull();
    }
    if (obj.type === 'object') {
      return obj.properties.get(prop) || createNull();
    }
    if (obj.type === 'array') {
      if (prop === 'length') {
        return createNumber(obj.elements.length);
      }
      // `length` is the only readable property. Builtin methods are reachable
      // only by calling them, via GET_METHOD, exactly as in the interpreter:
      // `a.push` is an error there, not a function value.
      throw new RuntimeError(
        `Cannot access property '${prop}' on array`,
        this.currentLine()
      );
    }
    if (obj.type === 'string') {
      if (prop === 'length') {
        return createNumber(obj.value.length);
      }
      throw new RuntimeError(
        `Cannot access property '${prop}' on string`,
        this.currentLine()
      );
    }
    if (obj.type === 'class') {
      // Static access
      if (obj.properties.has(prop)) {
        return obj.properties.get(prop)!;
      }
      if (obj.methods.has(prop)) {
        return obj.methods.get(prop) as unknown as RuntimeValue;
      }
    }
    // Numbers, booleans, null and functions have no properties. Answering null
    // here let a typo read as a legitimate null instead of being reported.
    throw new RuntimeError(
      `Cannot access property '${prop}' on ${obj.type}`,
      this.currentLine()
    );
  }

  /**
   * Resolve `prop` on `receiver` for use as the callee of a method call.
   *
   * Mirrors the interpreter's evalCallExpression: builtin methods on arrays,
   * strings and objects win over anything else, then instance methods, then
   * static methods, then callable object properties. Notably this is not the
   * same as reading the property: `arr.length` is a number while `arr.length()`
   * invokes a builtin, and an instance's function-valued *property* is not
   * callable as a method.
   */
  private performGetMethod(receiver: RuntimeValue, prop: string): RuntimeValue {
    if (receiver.type === 'array') {
      const method = this.getArrayMethod(receiver, prop);
      if (method) return method;
      throw new RuntimeError(
        `Cannot call method '${prop}' on array`,
        this.currentLine()
      );
    }

    if (receiver.type === 'string') {
      const method = this.getStringMethod(receiver, prop);
      if (method) return method;
      throw new RuntimeError(
        `Cannot call method '${prop}' on string`,
        this.currentLine()
      );
    }

    if (receiver.type === 'object') {
      const builtin = this.getObjectMethod(receiver, prop);
      if (builtin) return builtin;
      const value = receiver.properties.get(prop);
      if (
        !value ||
        (value.type !== 'function' && value.type !== 'native-function')
      ) {
        // A VM closure is a valid callable even though it is not one of the
        // interpreter's function types.
        if (value && (value as unknown as VMClosure).type === 'vm-closure') {
          return value;
        }
        throw new RuntimeError(
          `'${prop}' is not a callable method on this object`,
          this.currentLine()
        );
      }
      return value;
    }

    if (receiver.type === 'instance') {
      const method = receiver.classRef.methods.get(prop);
      if (!method) {
        throw new RuntimeError(
          `'${receiver.className}' has no method '${prop}'`,
          this.currentLine()
        );
      }
      if ((method as unknown as VMClosure).type === 'vm-closure') {
        const closure = method as unknown as VMClosure;
        const bound: VMClosure = {
          type: 'vm-closure',
          fn: closure.fn,
          upvalues: closure.upvalues,
        };
        (bound as VMClosure & { boundThis: RuntimeValue }).boundThis = receiver;
        return bound as unknown as RuntimeValue;
      }
      return method as unknown as RuntimeValue;
    }

    if (receiver.type === 'class') {
      const method = receiver.methods.get(prop);
      if (!method) {
        throw new RuntimeError(
          `Class '${receiver.name}' has no static method '${prop}'`,
          this.currentLine()
        );
      }
      return method as unknown as RuntimeValue;
    }

    throw new RuntimeError(
      `Cannot call method '${prop}' on ${receiver.type}`,
      this.currentLine()
    );
  }

  private performSetProp(obj: RuntimeValue, prop: string, value: RuntimeValue): void {
    if (obj.type === 'instance') {
      obj.properties.set(prop, value);
    } else if (obj.type === 'object') {
      obj.properties.set(prop, value);
    } else if (obj.type === 'class') {
      obj.properties.set(prop, value);
    } else {
      throw new RuntimeError(`Cannot set property on ${obj.type}`, this.currentLine());
    }
  }

  /** Builtin array methods, or null if there is no such method. */
  private getArrayMethod(arr: ArrayValue, method: string): RuntimeValue | null {
    const self = arr;
    switch (method) {
      case 'push':
        return {
          type: 'native-function',
          name: 'push',
          arity: -1,
          fn: (args: RuntimeValue[]) => {
            // Variadic, matching the interpreter's array push.
            self.elements.push(...args);
            return createNumber(self.elements.length);
          },
        };
      case 'pop':
        return {
          type: 'native-function',
          name: 'pop',
          arity: 0,
          fn: () => self.elements.pop() || createNull(),
        };
      case 'shift':
        return {
          type: 'native-function',
          name: 'shift',
          arity: 0,
          fn: () => self.elements.shift() || createNull(),
        };
      case 'unshift':
        return {
          type: 'native-function',
          name: 'unshift',
          arity: -1,
          fn: (args: RuntimeValue[]) => {
            // Variadic, matching the interpreter's array unshift.
            self.elements.unshift(...args);
            return createNumber(self.elements.length);
          },
        };
      case 'length':
        return {
          type: 'native-function',
          name: 'length',
          arity: 0,
          fn: () => createNumber(self.elements.length),
        };
      case 'map':
        return {
          type: 'native-function',
          name: 'map',
          arity: 1,
          fn: (args: RuntimeValue[]) => {
            const cb = args[0];
            const out = self.elements.map((el, i) =>
              this.callFromNative(cb, [el, createNumber(i)])
            );
            return createArray(out);
          },
        };
      case 'filter':
        return {
          type: 'native-function',
          name: 'filter',
          arity: 1,
          fn: (args: RuntimeValue[]) => {
            const cb = args[0];
            const out = self.elements.filter((el, i) =>
              isTruthy(this.callFromNative(cb, [el, createNumber(i)]))
            );
            return createArray(out);
          },
        };
      case 'reduce':
        return {
          type: 'native-function',
          name: 'reduce',
          arity: -1,
          fn: (args: RuntimeValue[]) => {
            const cb = args[0];
            // With no seed, the first element seeds the accumulator
            let acc = args.length > 1 ? args[1] : self.elements[0] || createNull();
            const start = args.length > 1 ? 0 : 1;
            for (let i = start; i < self.elements.length; i++) {
              acc = this.callFromNative(cb, [acc, self.elements[i], createNumber(i)]);
            }
            return acc;
          },
        };
      case 'forEach':
        return {
          type: 'native-function',
          name: 'forEach',
          arity: 1,
          fn: (args: RuntimeValue[]) => {
            const cb = args[0];
            self.elements.forEach((el, i) => {
              this.callFromNative(cb, [el, createNumber(i)]);
            });
            return createNull();
          },
        };
      case 'sort':
        return {
          type: 'native-function',
          name: 'sort',
          arity: 0,
          fn: () =>
            createArray(
              [...self.elements].sort((a, b) =>
                a.type === 'number' && b.type === 'number'
                  ? a.value - b.value
                  : stringify(a).localeCompare(stringify(b))
              )
            ),
        };
      case 'reverse':
        return {
          type: 'native-function',
          name: 'reverse',
          arity: 0,
          fn: () => createArray([...self.elements].reverse()),
        };
      case 'slice':
        return {
          type: 'native-function',
          name: 'slice',
          arity: -1,
          fn: (args: RuntimeValue[]) => {
            const start = args[0]?.type === 'number' ? args[0].value : 0;
            const end =
              args[1]?.type === 'number' ? args[1].value : self.elements.length;
            return createArray(self.elements.slice(start, end));
          },
        };
      case 'indexOf':
        return {
          type: 'native-function',
          name: 'indexOf',
          arity: 1,
          fn: (args: RuntimeValue[]) =>
            createNumber(self.elements.findIndex((el) => valueEquals(el, args[0]))),
        };
      case 'includes':
        return {
          type: 'native-function',
          name: 'includes',
          arity: 1,
          fn: (args: RuntimeValue[]) =>
            createBoolean(self.elements.some((el) => valueEquals(el, args[0]))),
        };
      case 'join':
        return {
          type: 'native-function',
          name: 'join',
          arity: -1,
          fn: (args: RuntimeValue[]) => {
            const sep = args[0]?.type === 'string' ? args[0].value : ',';
            return createString(self.elements.map(stringify).join(sep));
          },
        };
      default:
        return null;
    }
  }

  /**
   * Builtin string methods, or null if there is no such method.
   *
   * Kept at parity with the interpreter's tryBuiltinMethod; the VM previously
   * offered only split/trim/upper/lower and silently returned null for the rest,
   * so `"a,b".contains("a")` produced a "not callable" failure under the VM but
   * worked under the interpreter.
   */
  private getStringMethod(_str: StringValue, method: string): RuntimeValue | null {
    const self = _str;
    const native = (
      name: string,
      arity: number,
      fn: (args: RuntimeValue[]) => RuntimeValue
    ): NativeFunctionValue => ({ type: 'native-function', name, arity, fn });

    switch (method) {
      case 'split':
        return native('split', -1, (args) => {
          const sep = args[0]?.type === 'string' ? args[0].value : '';
          return createArray(self.value.split(sep).map(createString));
        });
      case 'trim':
        return native('trim', 0, () => createString(self.value.trim()));
      case 'upper':
        return native('upper', 0, () => createString(self.value.toUpperCase()));
      case 'lower':
        return native('lower', 0, () => createString(self.value.toLowerCase()));
      case 'contains':
        return native('contains', -1, (args) => {
          if (args.length === 0 || args[0].type !== 'string') {
            return createBoolean(false);
          }
          return createBoolean(self.value.includes(args[0].value));
        });
      case 'replace':
        return native('replace', -1, (args) => {
          if (args.length < 2) {
            throw new RuntimeError(
              'replace() needs 2 arguments: pattern and replacement',
              this.currentLine()
            );
          }
          return createString(
            self.value.replace(stringify(args[0]), stringify(args[1]))
          );
        });
      case 'startsWith':
        return native('startsWith', -1, (args) => {
          if (args.length === 0 || args[0].type !== 'string') {
            return createBoolean(false);
          }
          return createBoolean(self.value.startsWith(args[0].value));
        });
      case 'endsWith':
        return native('endsWith', -1, (args) => {
          if (args.length === 0 || args[0].type !== 'string') {
            return createBoolean(false);
          }
          return createBoolean(self.value.endsWith(args[0].value));
        });
      case 'charAt':
        return native('charAt', -1, (args) => {
          if (args.length === 0 || args[0].type !== 'number') {
            return createString('');
          }
          return createString(self.value[Math.floor(args[0].value)] || '');
        });
      case 'indexOf':
        return native('indexOf', -1, (args) => {
          if (args.length === 0 || args[0].type !== 'string') {
            return createNumber(-1);
          }
          return createNumber(self.value.indexOf(args[0].value));
        });
      case 'slice':
        return native('slice', -1, (args) => {
          const start = args[0]?.type === 'number' ? args[0].value : 0;
          const end =
            args[1]?.type === 'number' ? args[1].value : self.value.length;
          return createString(self.value.slice(start, end));
        });
      case 'repeat':
        return native('repeat', -1, (args) => {
          if (args.length === 0 || args[0].type !== 'number') {
            return createString(self.value);
          }
          return createString(self.value.repeat(Math.floor(args[0].value)));
        });
      default:
        return null;
    }
  }

  /** Builtin object methods, or null if there is no such method. */
  private getObjectMethod(
    obj: RuntimeValue & { type: 'object' },
    method: string
  ): RuntimeValue | null {
    switch (method) {
      case 'keys':
        return {
          type: 'native-function',
          name: 'keys',
          arity: 0,
          fn: () =>
            createArray(Array.from(obj.properties.keys()).map(createString)),
        };
      case 'values':
        return {
          type: 'native-function',
          name: 'values',
          arity: 0,
          fn: () => createArray(Array.from(obj.properties.values())),
        };
      case 'has':
        return {
          type: 'native-function',
          name: 'has',
          arity: -1,
          fn: (args: RuntimeValue[]) => {
            if (args.length === 0 || args[0].type !== 'string') {
              return createBoolean(false);
            }
            return createBoolean(obj.properties.has(args[0].value));
          },
        };
      default:
        return null;
    }
  }
}
