/**
 * TinyLang Stack-based Virtual Machine
 *
 * Executes bytecode compiled from TinyLang AST.
 * Uses an operand stack and call frame stack for function calls.
 * Registers stdlib globals before execution.
 */

import { Chunk } from '../compiler/chunk';
import { OpCode } from '../compiler/opcodes';
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

export type OutputHandler = (message: string) => void;

export interface VMOptions {
  output?: OutputHandler;
  maxSteps?: number;
  input?: (prompt: string) => string;
}

export class VM {
  private stack: RuntimeValue[] = [];
  private frames: CallFrame[] = [];
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
        const elements: RuntimeValue[] = [];
        const limit = inclusive.value ? end.value : end.value;
        for (let i = start.value; inclusive.value ? i <= limit : i < limit; i++) {
          elements.push(createNumber(i));
        }
        return createArray(elements);
      },
    });
  }

  private extractGlobalsFromEnv(env: Environment): void {
    // Access the environment's variables via lookup of known stdlib names
    const knownNames = [
      'print', 'println', 'input', 'type', 'len', 'toString', 'toNumber',
      'isNumber', 'isString', 'isBool', 'isNull', 'isArray', 'isObject',
      'isFunction', 'push', 'pop', 'shift', 'unshift', 'slice', 'concat',
      'join', 'reverse', 'sort', 'map', 'filter', 'reduce', 'find',
      'includes', 'indexOf', 'forEach', 'split', 'trim', 'upper', 'lower',
      'replace', 'startsWith', 'endsWith', 'contains', 'repeat', 'charAt',
      'substring', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'min', 'max',
      'random', 'sin', 'cos', 'tan', 'log', 'pow',
      'PI', 'E', 'INFINITY',
      'time', 'sleep', 'range', 'assert',
    ];

    for (const name of knownNames) {
      if (env.has(name)) {
        try {
          this.globals.set(name, env.lookup(name));
        } catch {
          // Skip if not found
        }
      }
    }
  }

  /**
   * Execute a bytecode chunk and return the result
   */
  run(chunk: Chunk): RuntimeValue {
    this.stack = [];
    this.frames = [];
    this.steps = 0;
    this.outputBuffer = [];

    // Push the initial frame
    this.frames.push({
      chunk,
      ip: 0,
      basePointer: 0,
      upvalues: [],
      thisBinding: null,
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

  private execute(): RuntimeValue {
    while (true) {
      if (this.steps++ > this.maxSteps) {
        throw new RuntimeError(
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
              `Cannot add ${a.type} and ${b.type}`,
              this.currentLine()
            );
          }
          break;
        }

        case OpCode.SUB: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          this.push(createNumber(a.value - b.value));
          break;
        }

        case OpCode.MUL: {
          const b = this.pop();
          const a = this.pop();
          if (a.type === 'number' && b.type === 'number') {
            this.push(createNumber(a.value * b.value));
          } else if (a.type === 'string' && b.type === 'number') {
            this.push(createString(a.value.repeat(b.value)));
          } else {
            throw new RuntimeError(
              `Cannot multiply ${a.type} and ${b.type}`,
              this.currentLine()
            );
          }
          break;
        }

        case OpCode.DIV: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          if (b.value === 0) {
            throw new RuntimeError('Division by zero', this.currentLine());
          }
          this.push(createNumber(a.value / b.value));
          break;
        }

        case OpCode.MOD: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          this.push(createNumber(a.value % b.value));
          break;
        }

        case OpCode.POW: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          this.push(createNumber(Math.pow(a.value, b.value)));
          break;
        }

        case OpCode.NEGATE: {
          const val = this.pop() as NumberValue;
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

        case OpCode.LT: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          this.push(createBoolean(a.value < b.value));
          break;
        }

        case OpCode.LTE: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          this.push(createBoolean(a.value <= b.value));
          break;
        }

        case OpCode.GT: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          this.push(createBoolean(a.value > b.value));
          break;
        }

        case OpCode.GTE: {
          const b = this.pop() as NumberValue;
          const a = this.pop() as NumberValue;
          this.push(createBoolean(a.value >= b.value));
          break;
        }

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

        case OpCode.CALL: {
          const argCount = this.read16();
          const callee = this.stack[this.stack.length - 1 - argCount];
          this.callValue(callee, argCount);
          break;
        }

        case OpCode.RETURN: {
          const result = this.pop();
          const frame = this.frames.pop()!;

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
          const properties = new Map<string, RuntimeValue>();
          for (let i = 0; i < count; i++) {
            const value = this.pop();
            const key = this.pop() as StringValue;
            properties.set(key.value, value);
          }
          this.push(createObject(properties));
          break;
        }

        case OpCode.INDEX: {
          const index = this.pop();
          const obj = this.pop();
          this.push(this.performIndex(obj, index));
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

          const instance: InstanceValue = {
            type: 'instance',
            className: classVal.name,
            classRef: classVal,
            properties: new Map(classVal.properties),
          };

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
              const frame: CallFrame = {
                chunk: closure.fn.chunk,
                ip: 0,
                basePointer: this.stack.length - argCount,
                upvalues: closure.upvalues,
                thisBinding: instance,
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

  private callClosure(closure: VMClosure, argCount: number): void {
    const fn = closure.fn;

    // Handle default parameters
    // For now, pad missing args with null
    while (argCount < fn.arity) {
      this.push(createNull());
      argCount++;
    }

    // Check if this closure has a bound 'this'
    const boundThis = (closure as VMClosure & { boundThis?: RuntimeValue }).boundThis || null;

    const frame: CallFrame = {
      chunk: fn.chunk,
      ip: 0,
      basePointer: this.stack.length - argCount,
      upvalues: closure.upvalues,
      thisBinding: boundThis,
    };
    this.frames.push(frame);
  }

  private callNative(fn: NativeFunctionValue, argCount: number): void {
    const args: RuntimeValue[] = [];
    for (let i = 0; i < argCount; i++) {
      args.unshift(this.pop());
    }
    this.pop(); // Pop the function itself

    const env = new Environment();
    const result = fn.fn(args, env);
    this.push(result);
  }

  private callClass(classVal: ClassValue, argCount: number): void {
    const instance: InstanceValue = {
      type: 'instance',
      className: classVal.name,
      classRef: classVal,
      properties: new Map(classVal.properties),
    };

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
      const frame: CallFrame = {
        chunk: closure.fn.chunk,
        ip: 0,
        basePointer: this.stack.length - argCount,
        upvalues: closure.upvalues,
        thisBinding: instance,
      };
      this.frames.push(frame);
    } else if (method.type === 'native-function') {
      this.callNative(method, argCount);
    }
  }

  private performIndex(obj: RuntimeValue, index: RuntimeValue): RuntimeValue {
    if (obj.type === 'array') {
      if (index.type !== 'number') {
        throw new RuntimeError('Array index must be a number', this.currentLine());
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.elements.length) {
        return createNull();
      }
      return obj.elements[idx];
    }
    if (obj.type === 'object') {
      if (index.type !== 'string') {
        throw new RuntimeError('Object key must be a string', this.currentLine());
      }
      return obj.properties.get(index.value) || createNull();
    }
    if (obj.type === 'string') {
      if (index.type !== 'number') {
        throw new RuntimeError('String index must be a number', this.currentLine());
      }
      const idx = Math.floor(index.value);
      if (idx < 0 || idx >= obj.value.length) {
        return createNull();
      }
      return createString(obj.value[idx]);
    }
    throw new RuntimeError(`Cannot index into ${obj.type}`, this.currentLine());
  }

  private performSetIndex(obj: RuntimeValue, index: RuntimeValue, value: RuntimeValue): void {
    if (obj.type === 'array') {
      if (index.type !== 'number') {
        throw new RuntimeError('Array index must be a number', this.currentLine());
      }
      obj.elements[Math.floor(index.value)] = value;
    } else if (obj.type === 'object') {
      if (index.type !== 'string') {
        throw new RuntimeError('Object key must be a string', this.currentLine());
      }
      obj.properties.set(index.value, value);
    } else {
      throw new RuntimeError(`Cannot set index on ${obj.type}`, this.currentLine());
    }
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
      // Array methods
      return this.getArrayMethod(obj, prop);
    }
    if (obj.type === 'string') {
      if (prop === 'length') {
        return createNumber(obj.value.length);
      }
      return this.getStringMethod(obj, prop);
    }
    if (obj.type === 'class') {
      // Static access
      if (obj.properties.has(prop)) {
        return obj.properties.get(prop)!;
      }
      if (obj.methods.has(prop)) {
        return obj.methods.get(prop) as unknown as RuntimeValue;
      }
      return createNull();
    }
    return createNull();
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

  private getArrayMethod(arr: ArrayValue, method: string): RuntimeValue {
    const self = arr;
    switch (method) {
      case 'push':
        return {
          type: 'native-function',
          name: 'push',
          arity: 1,
          fn: (args: RuntimeValue[]) => {
            self.elements.push(args[0]);
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
      case 'map':
        return {
          type: 'native-function',
          name: 'map',
          arity: 1,
          fn: (_args: RuntimeValue[]) => createArray([...self.elements]),
        };
      case 'filter':
        return {
          type: 'native-function',
          name: 'filter',
          arity: 1,
          fn: (_args: RuntimeValue[]) => createArray([...self.elements]),
        };
      default:
        return createNull();
    }
  }

  private getStringMethod(_str: StringValue, method: string): RuntimeValue {
    const self = _str;
    switch (method) {
      case 'split':
        return {
          type: 'native-function',
          name: 'split',
          arity: 1,
          fn: (args: RuntimeValue[]) => {
            const sep = args[0] as StringValue;
            return createArray(self.value.split(sep.value).map(createString));
          },
        };
      case 'trim':
        return {
          type: 'native-function',
          name: 'trim',
          arity: 0,
          fn: () => createString(self.value.trim()),
        };
      case 'upper':
        return {
          type: 'native-function',
          name: 'upper',
          arity: 0,
          fn: () => createString(self.value.toUpperCase()),
        };
      case 'lower':
        return {
          type: 'native-function',
          name: 'lower',
          arity: 0,
          fn: () => createString(self.value.toLowerCase()),
        };
      default:
        return createNull();
    }
  }
}
