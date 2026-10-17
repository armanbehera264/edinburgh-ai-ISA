import { describe, expect, it } from 'vitest';
import {
  assemble, newHybridState, cloneHybridState, runForwardHybrid, runBackwardHybrid, statesEqual,
} from './index.js';

describe("Armaan's hybrid mode", () => {
  it('is rejected by the strict assembler', () => {
    expect(assemble('MOV r2, r1').errors.length).toBeGreaterThan(0);
    expect(assemble('MOV r2, r1', { mode: 'hybrid' }).errors).toEqual([]);
  });

  it('rewinds lossy instructions exactly, but only by keeping a log', () => {
    const src = [
      'ADDI  r1, 12', 'MOV   r2, r1', 'SHL   r2, 1', 'STORE [r0], r2',
      'LOAD  r3, [r0]', 'AND   r3, r1', 'SHR   r3, 2',
    ].join('\n');
    const { program, errors } = assemble(src, { mode: 'hybrid' });
    expect(errors).toEqual([]);
    const start = newHybridState();
    start.regs[2] = 999;
    const s = cloneHybridState(start);
    runForwardHybrid(s, program);
    expect(s.logBytesUsed).toBeGreaterThan(0);
    runBackwardHybrid(s, program);
    expect(statesEqual(s, start)).toBe(true);
    expect(s.logBytesUsed).toBe(0);
  });

  it('runs real loops with JNZ and rewinds them', () => {
    const { program, errors } = assemble('ADDI r1, 5\nloop:\n  ADDI r2, 3\n  SUBI r1, 1\n  JNZ r1, loop', { mode: 'hybrid' });
    expect(errors).toEqual([]);
    const s = newHybridState();
    runForwardHybrid(s, program);
    expect(s.regs[2]).toBe(15);
    runBackwardHybrid(s, program);
    expect([s.regs[1], s.regs[2], s.pc]).toEqual([0, 0, 0]);
  });

  it('keeps strict instructions free: no log bytes', () => {
    const { program } = assemble('ADD r1, r2\nXORI r1, 0x5a3c\nROL r1, 3', { mode: 'hybrid' });
    const s = newHybridState();
    runForwardHybrid(s, program);
    expect(s.logBytesUsed).toBe(0);
  });
});
