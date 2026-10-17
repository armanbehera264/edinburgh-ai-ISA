import { describe, expect, it } from 'vitest';
import {
  assemble, newState, cloneState, statesEqual, stepForward, stepBackward,
  runForward, runBackward, validateInstr, type InstrBody,
} from './index.js';
import {
  newConventional, conventionalForward, conventionalBackward, logBytes,
} from './conventional.js';

let seed = 12345;
const rand = (n: number) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const R = () => rand(8) as InstrBody extends { rd: infer T } ? T : never;
const W = () => rand(65536);

function randomInstr(): InstrBody {
  const ops = ['ADD', 'SUB', 'ADDI', 'SUBI', 'XOR', 'XORI', 'NOT', 'NEG', 'ROL', 'ROR', 'SWAP', 'EXCH', 'CADD', 'CSUB', 'CSWAP'] as const;
  for (;;) {
    const op = ops[rand(ops.length)];
    let i: InstrBody;
    switch (op) {
      case 'ADD': case 'SUB': case 'XOR': i = { op, rd: R(), rs: R() }; break;
      case 'ADDI': case 'SUBI': case 'XORI': i = { op, rd: R(), imm: W() }; break;
      case 'NOT': case 'NEG': i = { op, rd: R() }; break;
      case 'ROL': case 'ROR': i = { op, rd: R(), amount: rand(16) }; break;
      case 'SWAP': i = { op, ra: R(), rb: R() }; break;
      case 'EXCH': i = { op, rd: R(), ra: R() }; break;
      case 'CADD': case 'CSUB': i = { op, rd: R(), rs: R(), rc: R() }; break;
      case 'CSWAP': i = { op, ra: R(), rb: R(), rc: R() }; break;
    }
    if (!validateInstr(i)) return i;
  }
}

function randomState() {
  const s = newState();
  for (let r = 0; r < 8; r++) s.regs[r] = W();
  for (let k = 0; k < 32; k++) s.mem[W()] = W();
  return s;
}

describe('reversible machine', () => {
  it('unstep(step(s)) === s for every legal instruction, using no stored history', () => {
    for (let t = 0; t < 5000; t++) {
      const program = [randomInstr()];
      const s = randomState();
      const before = cloneState(s);
      stepForward(s, program);
      stepBackward(s, program);
      expect(statesEqual(s, before)).toBe(true);
    }
  });

  it('whole random programs run backwards to the exact start', () => {
    for (let t = 0; t < 500; t++) {
      const program = Array.from({ length: 1 + rand(80) }, randomInstr);
      const start = randomState();
      const s = cloneState(start);
      runForward(s, program);
      runBackward(s, program);
      expect(statesEqual(s, start)).toBe(true);
    }
  });

  it('rejects instructions that would erase information', () => {
    for (const bad of ['ADD r1, r1', 'XOR r1, r1', 'MOV r1, r2', 'EXCH r3, [r3]', 'CSWAP r1, r2, r1']) {
      expect(assemble(bad).errors.length, bad).toBeGreaterThan(0);
    }
  });

  it('supports XORI as its own inverse', () => {
    const { program, errors } = assemble('XORI r1, 0x5a3c');
    expect(errors).toEqual([]);
    const s = newState();
    s.regs[1] = 0x1234;
    stepForward(s, program);
    expect(s.regs[1]).toBe(0x1234 ^ 0x5a3c);
    stepBackward(s, program);
    expect(s.regs[1]).toBe(0x1234);
  });
});

describe('conventional comparison machine', () => {
  const { program } = assemble('REPEAT 4 {\n ADDI r1, 3\n SWAP r1, r2\n}');

  it('wipes 16 bits per overwritten register and cannot rewind without a log', () => {
    const c = newConventional(newState(), false);
    for (let i = 0; i < program.length; i++) conventionalForward(c, program);
    expect(c.bitsErased).toBe(4 * (16 + 32));
    expect(conventionalBackward(c)).toBe(false);
    expect(logBytes(c)).toBe(0);
  });

  it('can rewind only by storing every overwritten value', () => {
    const start = newState();
    start.regs[2] = 99;
    const c = newConventional(start, true);
    for (let i = 0; i < program.length; i++) conventionalForward(c, program);
    expect(logBytes(c)).toBe(4 * 6);
    while (conventionalBackward(c));
    expect(statesEqual(c.machine, start)).toBe(true);
  });
});
