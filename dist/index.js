// Flip-16 core library public API.
export { MAX_WORD, toWord, add, sub, neg, bitNot, rol, ror, isWord, } from './core/word.js';
export { REG_COUNT, newState, cloneState, canonicalize, statesEqual, } from './core/state.js';
export { INVERSE_OP, isInversePair, isStrictOp, isLoggedOp, isStrictInstr, regName, rdOf, srcRegsOf, immOf, rotateAmountOf, toString, } from './core/instr.js';
export { validateInstr, validateProgram, validateDefensive, } from './core/validate.js';
export { stepForward, stepBackward, applyForward, applyOp, runForward, runBackward, makeInverseProgram, executeForward, executeBackward, ExecutionError, ERR_AT_END, ERR_AT_START, } from './core/eval.js';
export { assemble } from './core/assemble.js';
export { DEFAULT_LOG_BYTE_LIMIT, newHybridState, cloneHybridState, undoRecordBytes, stepForwardHybrid, stepBackwardHybrid, runForwardHybrid, runBackwardHybrid, } from './core/hybrid.js';
export { newBaselineState, cloneBaseline, stepForwardBaseline, runForwardBaseline, stepBackwardBaseline, } from './core/baseline.js';
//# sourceMappingURL=index.js.map