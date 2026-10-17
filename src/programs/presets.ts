import { FIB_SOURCE } from './fibonacci.js';

export interface Preset {
  id: string;
  name: string;
  /** Starting values for r0–r7. */
  regs: number[];
  source: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'swap',
    name: 'Swap without a spare register',
    regs: [0, 12, 34, 0, 0, 0, 0, 0],
    source: [
      '# A normal computer swaps two values via a temporary,',
      '# overwriting it. Three XORs do it with nothing lost.',
      'XOR r1, r2',
      'XOR r2, r1',
      'XOR r1, r2',
    ].join('\n'),
  },
  {
    id: 'times10',
    name: 'Multiply by 10, then clean up',
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
    id: 'fib',
    name: 'Fibonacci up and back down',
    regs: [0, 0, 1, 0, 0, 0, 0, 0],
    source: FIB_SOURCE,
  },
  {
    id: 'mixer',
    name: 'Hash mixer (looks random, isn’t lost)',
    regs: [1, 2, 3, 4, 0, 0, 0, 0],
    source: [
      '# Stir four numbers until they look like noise.',
      'REPEAT 6 {',
      '  ADD  r0, r1',
      '  ROL  r1, 7',
      '  XOR  r1, r0',
      '  ADD  r2, r3',
      '  ROL  r3, 9',
      '  XOR  r3, r2',
      '  SWAP r0, r2',
      '}',
    ].join('\n'),
  },
  {
    id: 'blank',
    name: 'Blank: write your own',
    regs: [0, 5, 7, 0, 0, 0, 0, 0],
    source: [
      '# Allowed: ADD SUB ADDI SUBI XOR XORI NOT NEG ROL ROR SWAP',
      '#          CADD CSUB CSWAP  and  REPEAT n { ... }',
      '# Not allowed: anything that destroys information.',
      'ADD r1, r2',
    ].join('\n'),
  },
];
