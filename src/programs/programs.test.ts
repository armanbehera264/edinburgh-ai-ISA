import { describe, expect, it } from 'vitest';
import { assemble, cloneState, runForward, runBackward, statesEqual, stepBackward } from '../core/index.js';
import { CIPHER_SOURCE, ROUNDS, encodeMessage, decodeMessage, registerBytes } from './cipher.js';
import { FIB_SOURCE, fibInitial } from './fibonacci.js';

describe('secret-message cipher', () => {
  const { program, errors } = assemble(CIPHER_SOURCE);

  it('assembles to 3 instructions per register per round', () => {
    expect(errors).toEqual([]);
    expect(program.length).toBe(ROUNDS * 8 * 3);
  });

  it('stores the message only in the registers', () => {
    expect(decodeMessage(encodeMessage('MEET ME AT NOON').regs)).toBe('MEET ME AT NOON');
  });

  it('scrambles going forward and restores exactly going backward', () => {
    const start = encodeMessage('MEET ME AT NOON');
    const s = cloneState(start);
    runForward(s, program);
    expect(decodeMessage(s.regs)).not.toBe('MEET ME AT NOON');
    // Step back one instruction at a time, exactly as the slider does.
    while (s.pc > 0) stepBackward(s, program);
    expect(statesEqual(s, start)).toBe(true);
    expect(decodeMessage(s.regs)).toBe('MEET ME AT NOON');
  });

  it('spreads one changed letter across the whole message', () => {
    const a = encodeMessage('MEET ME AT NOON');
    const b = encodeMessage('MEET ME AT NOOM');
    runForward(a, program);
    runForward(b, program);
    const ba = registerBytes(a.regs);
    const bb = registerBytes(b.regs);
    const differing = ba.filter((v, i) => v !== bb[i]).length;
    expect(differing).toBeGreaterThanOrEqual(12);
  });
});

describe('fibonacci', () => {
  it('runs forward to F(23), F(24) and back to 0, 1', () => {
    const { program, errors } = assemble(FIB_SOURCE);
    expect(errors).toEqual([]);
    const s = fibInitial();
    runForward(s, program);
    expect([s.regs[1], s.regs[2]]).toEqual([28657, 46368]);
    runBackward(s, program);
    expect([s.regs[1], s.regs[2]]).toEqual([0, 1]);
  });
});

describe('playground presets', async () => {
  const { PRESETS } = await import('./presets.js');
  const { newState } = await import('../core/index.js');
  for (const p of PRESETS) {
    it(`"${p.name}" assembles and rewinds exactly`, () => {
      const { program, errors } = assemble(p.source);
      expect(errors).toEqual([]);
      const start = newState();
      p.regs.forEach((v, r) => { start.regs[r] = v; });
      const s = cloneState(start);
      runForward(s, program);
      runBackward(s, program);
      expect(statesEqual(s, start)).toBe(true);
    });
  }
  it('multiply-by-10 leaves the answer and clean scratch', () => {
    const p = PRESETS.find((x) => x.id === 'times10')!;
    const s = newState();
    s.regs[1] = 1234;
    runForward(s, assemble(p.source).program);
    expect([s.regs[3], s.regs[4], s.regs[5]]).toEqual([12340, 0, 0]);
  });
});
