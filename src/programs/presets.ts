import type { AssemblyMode } from '../core/index.js';
import { FIB_SOURCE } from './fibonacci.js';

export interface Preset {
  id: string;
  name: string;
  mode: AssemblyMode;
  /** One or two sentences: what it computes, from which inputs, and what rewinding it costs. */
  description: string;
  /** Starting values for r0–r7. */
  regs: number[];
  source: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'swap-ordinary',
    name: 'Swap two numbers using a temporary (ordinary)',
    mode: 'hybrid',
    description: 'Swaps r1 = 12 and r2 = 34 the way every normal computer does: copying through r3 with four MOVs. Each MOV overwrites a value, so rewinding needs 32 bytes of undo log.',
    regs: [0, 12, 34, 0, 0, 0, 0, 0],
    source: [
      '# How every normal computer swaps two values:',
      '# copy through a temporary, overwriting as it goes.',
      'MOV r3, r1     # temp = a   (r3 was overwritten)',
      'MOV r1, r2     # a = b      (old a overwritten)',
      'MOV r2, r3     # b = temp   (old b overwritten)',
      'MOV r3, r0     # clear temp (old temp overwritten)',
    ].join('\n'),
  },
  {
    id: 'swap',
    name: 'Swap two numbers with XOR (reversible)',
    mode: 'strict',
    description: 'Same swap of r1 = 12 and r2 = 34, done with three XORs. Each XOR is its own opposite, so nothing is overwritten and rewinding needs 0 bytes.',
    regs: [0, 12, 34, 0, 0, 0, 0, 0],
    source: [
      '# Same result, nothing destroyed:',
      '# three XORs, each its own opposite.',
      'XOR r1, r2',
      'XOR r2, r1',
      'XOR r1, r2',
    ].join('\n'),
  },
  {
    id: 'loop',
    name: 'Add 3, five times, with a loop (ordinary)',
    mode: 'hybrid',
    description: 'A real loop: r1 counts down from 5 while r2 grows by 3 each pass, ending at r2 = 15. The JNZ jump forgets where it came from, so each jump is logged (7 bytes each).',
    regs: [0, 5, 0, 0, 0, 0, 0, 0],
    source: [
      '# A real loop: r2 += 3, five times.',
      '# The jump forgets where it came from,',
      '# so each one is saved to the log.',
      'loop:',
      '  ADDI r2, 3',
      '  SUBI r1, 1',
      '  JNZ  r1, loop',
    ].join('\n'),
  },
  {
    id: 'times10',
    name: 'Multiply by 10 and clean up (reversible)',
    mode: 'strict',
    description: 'Computes r3 = 10 × r1 (1234 → 12340) using scratch registers r4 and r5, then un-computes them back to 0. Nothing is left behind and nothing is logged.',
    regs: [0, 1234, 0, 0, 0, 0, 0, 0],
    source: [
      "# Bennett's trick: borrow scratch space, use it, give it back.",
      '# r1 = x, the answer goes to r3. r4 and r5 must end at 0.',
      'ADD  r4, r1         # r4 = x',
      'ADD  r4, r1         # r4 = 2x',
      'REPEAT 4 {',
      '  ADD r5, r4        # r5 = 8x',
      '}',
      'ADD  r3, r5         # z = 8x',
      'ADD  r3, r4         # z = 10x',
      '# now uncompute the scratch, in reverse order',
      'REPEAT 4 {',
      '  SUB r5, r4',
      '}',
      'SUB  r4, r1',
      'SUB  r4, r1',
    ].join('\n'),
  },
  {
    id: 'mixed',
    name: 'Copy, shift, store, load, AND (ordinary)',
    mode: 'hybrid',
    description: 'Mixes reversible steps (ADDI) with ordinary ones: MOV, SHL, STORE, LOAD, AND and SHR. Each ordinary step logs only what it destroyed; a shift saves just the bits it pushed out.',
    regs: [0, 0, 0, 0, 0, 0, 0, 0],
    source: [
      '# Reversible steps are free; ordinary ones pay into the log.',
      'ADDI  r1, 12',
      'MOV   r2, r1',
      'SHL   r2, 1',
      'STORE [r0], r2',
      'LOAD  r3, [r0]',
      'AND   r3, r1',
      'SHR   r3, 2',
    ].join('\n'),
  },
  {
    id: 'fib',
    name: 'Fibonacci from 0, 1 to 46,368 and back (reversible)',
    mode: 'strict',
    description: 'Steps r1, r2 through the Fibonacci sequence 23 times using only ADD and SWAP. Run it backwards and it un-counts all the way to 0, 1 without storing a single number.',
    regs: [0, 0, 1, 0, 0, 0, 0, 0],
    source: FIB_SOURCE,
  },
];
