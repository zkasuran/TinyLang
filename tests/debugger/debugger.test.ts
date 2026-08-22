import { describe, it, expect } from 'vitest';
import { Debugger } from '../../src/debugger/debugger';
import { parseCommand, getHelpText } from '../../src/debugger/commands';
import { formatVariable, formatCallStack, formatLocals, formatWatches } from '../../src/debugger/inspector';
import { createNumber, createString, createBoolean, createNull, Environment } from '../../src/types/values';

describe('Debugger', () => {
  describe('Breakpoints', () => {
    it('should set breakpoint and pause at that line', () => {
      const source = `let x = 1
let y = 2
let z = x + y
print(z)`;

      const dbg = new Debugger(source);
      dbg.addBreakpoint(3);
      dbg.start();

      // Start always pauses at first statement
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(1);

      // Continue to breakpoint at line 3
      dbg.continue();
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(3);
    });

    it('should continue to next breakpoint', () => {
      const source = `let x = 1
let y = 2
let z = 3
let w = 4`;

      const dbg = new Debugger(source);
      dbg.addBreakpoint(2);
      dbg.addBreakpoint(4);
      dbg.start();

      // Pauses at first statement by default (step_into)
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(1);

      // Continue to next breakpoint
      dbg.continue();
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(2);

      // Continue to next breakpoint
      dbg.continue();
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(4);
    });

    it('should remove breakpoint', () => {
      const source = `let x = 1
let y = 2
let z = 3`;

      const dbg = new Debugger(source);
      const bp = dbg.addBreakpoint(2);
      dbg.addBreakpoint(3);
      dbg.removeBreakpoint(bp.id);

      const bps = dbg.listBreakpoints();
      expect(bps.length).toBe(1);
      expect(bps[0].line).toBe(3);
    });

    it('should list breakpoints', () => {
      const source = `let x = 1`;
      const dbg = new Debugger(source);
      dbg.addBreakpoint(1);
      dbg.addBreakpoint(5);
      dbg.addBreakpoint(10, 'x > 5');

      const bps = dbg.listBreakpoints();
      expect(bps.length).toBe(3);
      expect(bps[0].line).toBe(1);
      expect(bps[1].line).toBe(5);
      expect(bps[2].line).toBe(10);
      expect(bps[2].condition).toBe('x > 5');
    });

    it('should track breakpoint hit count', () => {
      const source = `let x = 1
let y = 2
let z = 3`;

      const dbg = new Debugger(source);
      const bp = dbg.addBreakpoint(2);
      dbg.start();

      // first pause at line 1
      expect(dbg.getCurrentLine()).toBe(1);
      dbg.continue();

      // Now hits breakpoint at line 2
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(2);
      expect(bp.hitCount).toBe(1);
    });

    it('should handle conditional breakpoints', () => {
      const source = `let x = 0
x = 1
x = 2
x = 3
x = 5`;

      const dbg = new Debugger(source);
      // Condition: pause when x > 2
      dbg.addBreakpoint(5, 'x > 2');
      dbg.start();

      // first pauses at line 1 (step_into on start)
      expect(dbg.getCurrentLine()).toBe(1);

      // Continue - should skip bp at line 5 where x=0,1,2 and hit when x=3
      dbg.continue();
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(5);
    });

    it('should not pause at conditional breakpoint when condition is false', () => {
      const source = `let x = 0
let y = 1`;

      const dbg = new Debugger(source);
      // Condition that is always false
      dbg.addBreakpoint(2, 'false');
      dbg.start();

      // Pauses at first statement
      expect(dbg.getCurrentLine()).toBe(1);

      // Continue - breakpoint condition is false, so execution completes
      dbg.continue();
      expect(dbg.getState()).toBe('stopped');
    });

    it('should handle multiple breakpoints at different lines', () => {
      const source = `let a = 1
let b = 2
let c = 3
let d = 4
let e = 5`;

      const dbg = new Debugger(source);
      dbg.addBreakpoint(2);
      dbg.addBreakpoint(4);
      dbg.start();

      // Pauses at first statement (line 1)
      expect(dbg.getCurrentLine()).toBe(1);

      dbg.continue();
      expect(dbg.getCurrentLine()).toBe(2);

      dbg.continue();
      expect(dbg.getCurrentLine()).toBe(4);

      dbg.continue();
      expect(dbg.getState()).toBe('stopped');
    });
  });

  describe('Step Over', () => {
    it('should advance to next statement', () => {
      const source = `let x = 1
let y = 2
let z = 3`;

      const dbg = new Debugger(source);
      dbg.start();

      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(1);

      dbg.step();
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(2);

      dbg.step();
      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(3);

      dbg.step();
      expect(dbg.getState()).toBe('stopped');
    });

    it('should step over function calls', () => {
      const source = `fn add(a, b) {
  let result = a + b
  return result
}
let x = add(1, 2)
let y = 10`;

      const dbg = new Debugger(source);
      dbg.start();

      // Pauses at fn declaration (line 1)
      expect(dbg.getCurrentLine()).toBe(1);

      // Step over fn declaration
      dbg.step();
      // Now at let x = add(1, 2) (line 5)
      expect(dbg.getCurrentLine()).toBe(5);

      // Step over - should skip into the function
      dbg.step();
      // Now at let y = 10 (line 6)
      expect(dbg.getCurrentLine()).toBe(6);
    });
  });

  describe('Step Into', () => {
    it('should enter function calls', () => {
      const source = `fn greet(name) {
  let msg = "hi " + name
  return msg
}
let result = greet("world")`;

      const dbg = new Debugger(source);
      dbg.start();

      // At fn declaration (line 1)
      expect(dbg.getCurrentLine()).toBe(1);

      // Step to get to the call
      dbg.step();
      // At let result = greet("world") (line 5)
      expect(dbg.getCurrentLine()).toBe(5);

      // Step into - should enter the function
      dbg.stepInto();
      // Now inside greet, at let msg = ... (line 2)
      expect(dbg.getCurrentLine()).toBe(2);
    });
  });

  describe('Step Out', () => {
    it('should exit current function', () => {
      const source = `fn compute(x) {
  let a = x + 1
  let b = a + 2
  return b
}
let result = compute(5)
let done = true`;

      const dbg = new Debugger(source);
      dbg.start();

      // At fn declaration (line 1)
      expect(dbg.getCurrentLine()).toBe(1);

      // Step to the call
      dbg.step();
      expect(dbg.getCurrentLine()).toBe(6);

      // Step into the function
      dbg.stepInto();
      expect(dbg.getCurrentLine()).toBe(2);

      // Step out - should return from function
      dbg.stepOut();
      // Should be at the next statement after the call (line 7)
      expect(dbg.getCurrentLine()).toBe(7);
    });
  });

  describe('Variable Inspection', () => {
    it('should show correct values at breakpoint', () => {
      const source = `let x = 42
let y = "hello"
let z = true`;

      const dbg = new Debugger(source);
      dbg.addBreakpoint(3);
      dbg.start();

      // Step past line 1 pause
      dbg.continue();

      expect(dbg.getState()).toBe('paused');
      expect(dbg.getCurrentLine()).toBe(3);

      const locals = dbg.getLocals();
      expect(locals.get('x')).toEqual({ type: 'number', value: 42 });
      expect(locals.get('y')).toEqual({ type: 'string', value: 'hello' });
    });

    it('should evaluate expressions in current context', () => {
      const source = `let x = 10
let y = 20
let z = x + y`;

      const dbg = new Debugger(source);
      dbg.addBreakpoint(3);
      dbg.start();
      dbg.continue();

      expect(dbg.getState()).toBe('paused');
      expect(dbg.evaluateExpression('x + y')).toBe('30');
      expect(dbg.evaluateExpression('x * 2')).toBe('20');
    });

    it('should show variables inside functions', () => {
      const source = `fn calc(a, b) {
  let sum = a + b
  return sum
}
let result = calc(3, 4)`;

      const dbg = new Debugger(source);
      dbg.start();

      // At fn declaration
      dbg.step();
      // At let result = calc(3, 4)
      expect(dbg.getCurrentLine()).toBe(5);

      // Step into the function
      dbg.stepInto();
      // At let sum = a + b (line 2)
      expect(dbg.getCurrentLine()).toBe(2);

      const locals = dbg.getLocals();
      expect(locals.get('a')).toEqual({ type: 'number', value: 3 });
      expect(locals.get('b')).toEqual({ type: 'number', value: 4 });
    });
  });

  describe('Watch Expressions', () => {
    it('should evaluate watch expressions in current context', () => {
      const source = `let x = 5
let y = 10
let z = x + y`;

      const dbg = new Debugger(source);
      dbg.addWatch('x');
      dbg.addWatch('x + y');

      dbg.addBreakpoint(3);
      dbg.start();
      dbg.continue();

      expect(dbg.getState()).toBe('paused');

      const watches = dbg.getWatches();
      expect(watches.length).toBe(2);
      expect(watches[0].expression).toBe('x');
      expect(watches[0].lastValue).toBe('5');
      expect(watches[1].expression).toBe('x + y');
      expect(watches[1].lastValue).toBe('15');
    });

    it('should add and remove watch expressions', () => {
      const source = `let x = 1`;
      const dbg = new Debugger(source);

      const w1 = dbg.addWatch('x');
      const w2 = dbg.addWatch('y');

      expect(dbg.getWatches().length).toBe(2);

      dbg.removeWatch(w1.id);
      expect(dbg.getWatches().length).toBe(1);
      expect(dbg.getWatches()[0].expression).toBe('y');

      dbg.removeWatch(w2.id);
      expect(dbg.getWatches().length).toBe(0);
    });
  });

  describe('Call Stack', () => {
    it('should show correct function chain', () => {
      const source = `fn inner() {
  let x = 1
  return x
}
fn outer() {
  let r = inner()
  return r
}
let result = outer()`;

      const dbg = new Debugger(source);
      dbg.start();

      // Step past fn declarations
      dbg.step(); // past fn inner
      dbg.step(); // past fn outer, at let result = outer()

      // Step into outer
      dbg.stepInto();
      expect(dbg.getCurrentLine()).toBe(6);

      let stack = dbg.getCallStack();
      expect(stack.length).toBe(2);
      expect(stack[0].functionName).toBe('<main>');
      expect(stack[1].functionName).toBe('outer');

      // Step into inner
      dbg.stepInto();
      expect(dbg.getCurrentLine()).toBe(2);

      stack = dbg.getCallStack();
      expect(stack.length).toBe(3);
      expect(stack[0].functionName).toBe('<main>');
      expect(stack[1].functionName).toBe('outer');
      expect(stack[2].functionName).toBe('inner');
    });

    it('should show main at the base of the call stack', () => {
      const source = `let x = 1`;

      const dbg = new Debugger(source);
      dbg.start();

      const stack = dbg.getCallStack();
      expect(stack.length).toBe(1);
      expect(stack[0].functionName).toBe('<main>');
    });
  });

  describe('State Management', () => {
    it('should start in stopped state', () => {
      const source = `let x = 1`;
      const dbg = new Debugger(source);
      expect(dbg.getState()).toBe('stopped');
    });

    it('should transition to paused on start', () => {
      const source = `let x = 1`;
      const dbg = new Debugger(source);
      dbg.start();
      expect(dbg.getState()).toBe('paused');
    });

    it('should transition to stopped when execution completes', () => {
      const source = `let x = 1`;
      const dbg = new Debugger(source);
      dbg.start();
      dbg.continue();
      expect(dbg.getState()).toBe('stopped');
    });

    it('should stop when stop() is called', () => {
      const source = `let x = 1
let y = 2
let z = 3`;

      const dbg = new Debugger(source);
      dbg.start();
      expect(dbg.getState()).toBe('paused');
      dbg.stop();
      expect(dbg.getState()).toBe('stopped');
    });
  });

  describe('Output handling', () => {
    it('should capture output during debugging', () => {
      const output: string[] = [];
      const source = `print("hello")
print("world")`;

      const dbg = new Debugger(source, { output: (msg) => output.push(msg) });
      dbg.start();

      // At print("hello")
      dbg.step();
      expect(output).toContain('hello');

      dbg.step();
      expect(output).toContain('world');
    });
  });
});

describe('Debug Commands', () => {
  it('should parse break command', () => {
    const cmd = parseCommand('break 10');
    expect(cmd.command).toBe('break');
    expect(cmd.args).toEqual(['10']);
  });

  it('should parse break with alias', () => {
    const cmd = parseCommand('b 5');
    expect(cmd.command).toBe('break');
    expect(cmd.args).toEqual(['5']);
  });

  it('should parse conditional break', () => {
    const cmd = parseCommand('break 10 if x > 5');
    expect(cmd.command).toBe('break');
    expect(cmd.args).toEqual(['10', 'if', 'x', '>', '5']);
  });

  it('should parse step commands', () => {
    expect(parseCommand('step').command).toBe('step');
    expect(parseCommand('s').command).toBe('step');
    expect(parseCommand('into').command).toBe('into');
    expect(parseCommand('i').command).toBe('into');
    expect(parseCommand('out').command).toBe('out');
    expect(parseCommand('o').command).toBe('out');
  });

  it('should parse continue command', () => {
    expect(parseCommand('continue').command).toBe('continue');
    expect(parseCommand('c').command).toBe('continue');
  });

  it('should parse print command', () => {
    const cmd = parseCommand('print x + y');
    expect(cmd.command).toBe('print');
    expect(cmd.args).toEqual(['x', '+', 'y']);
  });

  it('should parse watch command', () => {
    const cmd = parseCommand('watch x');
    expect(cmd.command).toBe('watch');
    expect(cmd.args).toEqual(['x']);
  });

  it('should parse unwatch command', () => {
    const cmd = parseCommand('unwatch 1');
    expect(cmd.command).toBe('unwatch');
    expect(cmd.args).toEqual(['1']);
  });

  it('should parse delete command', () => {
    expect(parseCommand('delete 1').command).toBe('delete');
    expect(parseCommand('d 1').command).toBe('delete');
  });

  it('should parse locals and stack commands', () => {
    expect(parseCommand('locals').command).toBe('locals');
    expect(parseCommand('stack').command).toBe('stack');
  });

  it('should parse help and quit', () => {
    expect(parseCommand('help').command).toBe('help');
    expect(parseCommand('h').command).toBe('help');
    expect(parseCommand('quit').command).toBe('quit');
    expect(parseCommand('q').command).toBe('quit');
  });

  it('should handle empty input', () => {
    const cmd = parseCommand('');
    expect(cmd.command).toBe('');
    expect(cmd.args).toEqual([]);
  });

  it('should return help text', () => {
    const help = getHelpText();
    expect(help).toContain('break');
    expect(help).toContain('step');
    expect(help).toContain('continue');
  });
});

describe('Inspector', () => {
  it('should format variables correctly', () => {
    expect(formatVariable('x', createNumber(42))).toBe('x: number = 42');
    expect(formatVariable('name', createString('hello'))).toBe('name: string = hello');
    expect(formatVariable('flag', createBoolean(true))).toBe('flag: boolean = true');
    expect(formatVariable('n', createNull())).toBe('n: null = null');
  });

  it('should format call stack', () => {
    const env = new Environment();
    const frames = [
      { functionName: '<main>', line: 1, column: 1, env },
      { functionName: 'foo', line: 5, column: 3, env },
      { functionName: 'bar', line: 10, column: 5, env },
    ];

    const formatted = formatCallStack(frames);
    expect(formatted).toContain('<main>');
    expect(formatted).toContain('foo');
    expect(formatted).toContain('bar');
  });

  it('should format empty call stack', () => {
    const formatted = formatCallStack([]);
    expect(formatted).toContain('empty');
  });

  it('should format locals', () => {
    const env = new Environment();
    env.define('x', createNumber(42));
    env.define('name', createString('test'));

    const formatted = formatLocals(env);
    expect(formatted).toContain('x');
    expect(formatted).toContain('42');
    expect(formatted).toContain('name');
    expect(formatted).toContain('test');
  });

  it('should format watches', () => {
    const watches = [
      { id: 1, expression: 'x + 1', lastValue: '6' },
      { id: 2, expression: 'y', lastValue: 'hello' },
    ];

    const formatted = formatWatches(watches);
    expect(formatted).toContain('x + 1');
    expect(formatted).toContain('6');
    expect(formatted).toContain('y');
    expect(formatted).toContain('hello');
  });

  it('should format empty watches', () => {
    const formatted = formatWatches([]);
    expect(formatted).toContain('no watch');
  });
});
