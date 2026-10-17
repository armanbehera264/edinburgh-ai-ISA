import { newState, type State } from '../core/index.js';

export const FIB_STEPS = 23;

export const FIB_SOURCE = [
  '# Fibonacci: r1, r2 hold a consecutive pair, starting at 0, 1.',
  '# No temporary register, nothing overwritten.',
  `REPEAT ${FIB_STEPS} {`,
  '  ADD  r1, r2',
  '  SWAP r1, r2',
  '}',
].join('\n');

export function fibInitial(): State {
  const s = newState();
  s.regs[1] = 0;
  s.regs[2] = 1;
  return s;
}
