import { Word, toWord } from './word.js';

/** Number of general-purpose registers. */
export const REG_COUNT = 8;

/** Architectural machine state at an instruction boundary. */
export interface State {
  /** 8 general-purpose registers, each a 16-bit word. */
  regs: Uint16Array;
  /** 65,536 addressable 16-bit words of memory. */
  mem: Uint16Array;
  /** Next forward instruction index; 0..program.length inclusive. */
  pc: number;
}

/** Create a fresh zero state. */
export function newState(): State {
  return {
    regs: new Uint16Array(REG_COUNT),
    mem: new Uint16Array(1 << 16),
    pc: 0,
  };
}

/** Deep-clone a state (including the full memory array). */
export function cloneState(s: State): State {
  return {
    regs: new Uint16Array(s.regs),
    mem: new Uint16Array(s.mem),
    pc: s.pc,
  };
}

/** Canonicalize a state in place: reduce every register and memory word
 * modulo 2^16 and clamp pc to [0, program length] is not done here because
 * pc bounds are program-dependent. */
export function canonicalize(s: State): void {
  for (let i = 0; i < REG_COUNT; i++) {
    s.regs[i] = toWord(s.regs[i]);
  }
  for (let i = 0; i < s.mem.length; i++) {
    s.mem[i] = toWord(s.mem[i]);
  }
}

/** Compare two states for byte-for-byte equality (registers, memory, pc). */
export function statesEqual(a: State, b: State): boolean {
  if (a.pc !== b.pc) return false;
  for (let i = 0; i < REG_COUNT; i++) {
    if (a.regs[i] !== b.regs[i]) return false;
  }
  if (a.mem.length !== b.mem.length) return false;
  for (let i = 0; i < a.mem.length; i++) {
    if (a.mem[i] !== b.mem[i]) return false;
  }
  return true;
}
