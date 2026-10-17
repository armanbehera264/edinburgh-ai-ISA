// Reversible core: public API.
export type { Word } from './word.js';
export { MAX_WORD, toWord, add, sub, neg, bitNot, rol, ror, isWord } from './word.js';
export type { State } from './state.js';
export { REG_COUNT, newState, cloneState, statesEqual } from './state.js';
export type { Reg, Op, StrictOp, LoggedOp, Instr, InstrBody, StrictInstr, LoggedInstr, AssemblyMode } from './instr.js';
export { INVERSE_OP, isInversePair, isStrictInstr, isStrictOp, isLoggedOp, regName, rdOf, srcRegsOf, toString } from './instr.js';
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
export type { HybridState, UndoRecord } from './hybrid.js';
export {
  DEFAULT_LOG_BYTE_LIMIT, newHybridState, cloneHybridState, undoRecordBytes,
  stepForwardHybrid, stepBackwardHybrid, runForwardHybrid, runBackwardHybrid,
} from './hybrid.js';
