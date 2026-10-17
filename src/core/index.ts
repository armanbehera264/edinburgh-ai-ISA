// Reversible core: public API.
export type { Word } from './word.js';
export { MAX_WORD, toWord, add, sub, neg, bitNot, rol, ror, isWord } from './word.js';
export type { State } from './state.js';
export { REG_COUNT, newState, cloneState, statesEqual } from './state.js';
export type { Reg, Op, Instr, InstrBody } from './instr.js';
export { INVERSE_OP, isInversePair, regName, rdOf, srcRegsOf, toString } from './instr.js';
export type { ValidationError } from './validate.js';
export { validateInstr, validateProgram } from './validate.js';
export {
  stepForward, stepBackward, applyOp, runForward, runBackward,
  makeInverseProgram, ExecutionError,
} from './eval.js';
export type { AsmResult, AsmOptions } from './assemble.js';
export { assemble } from './assemble.js';
export type { ConventionalState } from './conventional.js';
export {
  newConventional, conventionalForward, conventionalBackward,
  writesOf, logBytes, BITS_PER_WRITE, LANDAUER_J_PER_BIT,
} from './conventional.js';
