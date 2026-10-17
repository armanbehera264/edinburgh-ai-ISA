/** A conventional ("normal") computer running the same program, for comparison.
 *
 * It computes exactly the same values as the reversible machine, but the way
 * ordinary hardware does it: each instruction overwrites its destination, so the
 * old 16-bit value is physically wiped. That is where Landauer's bound applies.
 *
 * An ordinary CPU has no reverse mode. The only way to rewind it is to keep a
 * history log of every value it overwrote (record-and-replay, like `rr`).
 * `logging` toggles that log so the UI can show what it costs.
 */

import type { Word } from './word.js';
import type { InstrBody } from './instr.js';
import { State, cloneState } from './state.js';
import { applyOp } from './eval.js';

export const BITS_PER_WRITE = 16;
/** Landauer's limit at 300 K: k·T·ln 2 joules per erased bit. */
export const LANDAUER_J_PER_BIT = 1.380649e-23 * 300 * Math.LN2;

type Slot = { kind: 'reg'; index: number } | { kind: 'mem'; index: number };

interface LogEntry { slot: Slot; old: Word }

export interface ConventionalState {
  machine: State;
  /** Bits physically wiped by overwrites so far. */
  bitsErased: number;
  /** Present only when the machine is keeping a history log. */
  log: LogEntry[][] | null;
}

export function newConventional(initial: State, logging: boolean): ConventionalState {
  return { machine: cloneState(initial), bitsErased: 0, log: logging ? [] : null };
}

/** Storage locations an instruction overwrites on an ordinary CPU, given the current state. */
export function writesOf(s: State, i: InstrBody): Slot[] {
  switch (i.op) {
    case 'SWAP':
      return [{ kind: 'reg', index: i.ra }, { kind: 'reg', index: i.rb }];
    case 'CSWAP':
      return s.regs[i.rc] !== 0 ? [{ kind: 'reg', index: i.ra }, { kind: 'reg', index: i.rb }] : [];
    case 'CADD': case 'CSUB':
      return s.regs[i.rc] !== 0 ? [{ kind: 'reg', index: i.rd }] : [];
    case 'EXCH':
      return [{ kind: 'reg', index: i.rd }, { kind: 'mem', index: s.regs[i.ra] }];
    default:
      return [{ kind: 'reg', index: i.rd }];
  }
}

const read = (s: State, slot: Slot): Word => (slot.kind === 'reg' ? s.regs[slot.index] : s.mem[slot.index]);

export function conventionalForward(c: ConventionalState, program: readonly InstrBody[]): void {
  const m = c.machine;
  if (m.pc >= program.length) return;
  const instr = program[m.pc];
  const slots = writesOf(m, instr);
  if (c.log) c.log.push(slots.map((slot) => ({ slot, old: read(m, slot) })));
  applyOp(m, instr);
  c.bitsErased += slots.length * BITS_PER_WRITE;
  m.pc += 1;
}

/** Rewind one step. Only possible when the machine kept a history log. */
export function conventionalBackward(c: ConventionalState): boolean {
  const m = c.machine;
  if (!c.log || m.pc === 0) return false;
  const entries = c.log.pop();
  if (!entries) return false;
  for (let k = entries.length - 1; k >= 0; k--) {
    const { slot, old } = entries[k];
    if (slot.kind === 'reg') m.regs[slot.index] = old;
    else m.mem[slot.index] = old;
  }
  m.pc -= 1;
  return true;
}

/** Bytes held in the history log right now. */
export function logBytes(c: ConventionalState): number {
  if (!c.log) return 0;
  let n = 0;
  for (const e of c.log) n += e.length * 2;
  return n;
}
