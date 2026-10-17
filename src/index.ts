// Flip-16 core library public API.
export {
  Word, MAX_WORD, toWord, add, sub, neg, bitNot, rol, ror, isWord,
} from './core/word.js';
export {
  REG_COUNT, State, newState, cloneState, canonicalize, statesEqual,
} from './core/state.js';
export {
  Reg, Op, Instr, InstrBody, INVERSE_OP, isInversePair, regName,
  rdOf, srcRegsOf, immOf, rotateAmountOf, toString,
  InstrADD, InstrSUB, InstrADDI, InstrSUBI, InstrXOR, InstrNOT, InstrNEG,
  InstrROL, InstrROR, InstrSWAP, InstrEXCH, InstrCADD, InstrCSUB, InstrCSWAP,
} from './core/instr.js';
export {
  ValidationError, validateInstr, validateProgram, validateDefensive,
} from './core/validate.js';
export {
  stepForward, stepBackward, applyForward, applyOp,
  runForward, runBackward, makeInverseProgram, executeForward,
  executeBackward, ExecutionError, ERR_AT_END, ERR_AT_START,
} from './core/eval.js';
export { assemble, AsmResult, AsmOptions } from './core/assemble.js';
export {
  BaselineState, newBaselineState, cloneBaseline, stepForwardBaseline,
  runForwardBaseline, stepBackwardBaseline, LogEntry,
} from './core/baseline.js';
