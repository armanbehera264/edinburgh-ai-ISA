import { applyForward, applyOp, ExecutionError, ERR_AT_END, ERR_AT_START } from './eval.js';
import { Instr, LoggedInstr, Reg, StrictInstr, isStrictInstr, toString } from './instr.js';
import { State, newState } from './state.js';

/** The default is intentionally finite: a program cannot silently consume host memory. */
export const DEFAULT_LOG_BYTE_LIMIT = 64 * 1024;

export type UndoRecord =
  | { tag: 'MOV' | 'LOAD' | 'AND'; pcBefore: number; pcAfter: number; rd: Reg; oldValue: number }
  | { tag: 'STORE'; pcBefore: number; pcAfter: number; address: number; oldValue: number }
  | { tag: 'SHR' | 'SHL'; pcBefore: number; pcAfter: number; rd: Reg; amount: number; lostBits: number }
  | { tag: 'JNZ'; pcBefore: number; pcAfter: number; taken: boolean };

/** State for an execution that may use both strict and logged instructions. */
export interface HybridState extends State {
  undoLog: UndoRecord[];
  logBytesUsed: number;
  logByteLimit: number;
}

export function newHybridState(logByteLimit = DEFAULT_LOG_BYTE_LIMIT): HybridState {
  const base = newState();
  return { ...base, undoLog: [], logBytesUsed: 0, logByteLimit };
}

export function cloneHybridState(state: HybridState): HybridState {
  return {
    regs: new Uint16Array(state.regs),
    mem: new Uint16Array(state.mem),
    pc: state.pc,
    undoLog: state.undoLog.map((record) => ({ ...record })),
    logBytesUsed: state.logBytesUsed,
    logByteLimit: state.logByteLimit,
  };
}

/** Fixed serialized size used for preflight and the timeline display. */
export function undoRecordBytes(record: UndoRecord): number {
  switch (record.tag) {
    // tag + payload length + pcBefore + pcAfter forms a six-byte header.
    // These are canonical accounting sizes; the in-memory object is deliberately
    // kept readable rather than pretending to be a byte-packed device format.
    case 'MOV': case 'LOAD': case 'AND': return 8;
    case 'STORE': return 10;
    case 'SHR': case 'SHL': return 9;
    case 'JNZ': return 7;
  }
}

function appendRecord(state: HybridState, record: UndoRecord, instruction: string): void {
  const bytes = undoRecordBytes(record);
  if (state.logBytesUsed + bytes > state.logByteLimit) {
    throw new ExecutionError(state.pc, instruction, `undo log full (${state.logBytesUsed}/${state.logByteLimit} bytes)`);
  }
  state.undoLog.push(record);
  state.logBytesUsed += bytes;
}

/** Run one instruction forward. Strict instructions write no undo record; logged
 * instructions append their preimage before they overwrite anything. */
export function stepForwardHybrid(state: HybridState, program: readonly Instr[]): void {
  if (state.pc < 0 || state.pc >= program.length) {
    throw new ExecutionError(state.pc, '(none)', ERR_AT_END);
  }
  const pcBefore = state.pc;
  const instr = program[pcBefore];
  if (isStrictInstr(instr)) {
    applyForward(state, instr);
    state.pc = pcBefore + 1;
    return;
  }
  applyLoggedForward(state, instr as LoggedInstr, program.length, pcBefore);
}

function applyLoggedForward(state: HybridState, instr: LoggedInstr, programLength: number, pcBefore: number): void {
  const sequentialPc = pcBefore + 1;
  switch (instr.op) {
    case 'MOV': {
      const record: UndoRecord = { tag: 'MOV', pcBefore, pcAfter: sequentialPc, rd: instr.rd, oldValue: state.regs[instr.rd] };
      appendRecord(state, record, toString(instr));
      state.regs[instr.rd] = state.regs[instr.rs];
      state.pc = sequentialPc;
      return;
    }
    case 'LOAD': {
      const address = state.regs[instr.ra];
      const record: UndoRecord = { tag: 'LOAD', pcBefore, pcAfter: sequentialPc, rd: instr.rd, oldValue: state.regs[instr.rd] };
      appendRecord(state, record, toString(instr));
      state.regs[instr.rd] = state.mem[address];
      state.pc = sequentialPc;
      return;
    }
    case 'STORE': {
      const address = state.regs[instr.ra];
      const record: UndoRecord = { tag: 'STORE', pcBefore, pcAfter: sequentialPc, address, oldValue: state.mem[address] };
      appendRecord(state, record, toString(instr));
      state.mem[address] = state.regs[instr.rs];
      state.pc = sequentialPc;
      return;
    }
    case 'SHR': {
      const oldValue = state.regs[instr.rd];
      const lostBits = instr.amount === 0 ? 0 : oldValue & ((1 << instr.amount) - 1);
      const record: UndoRecord = { tag: 'SHR', pcBefore, pcAfter: sequentialPc, rd: instr.rd, amount: instr.amount, lostBits };
      appendRecord(state, record, toString(instr));
      state.regs[instr.rd] = oldValue >>> instr.amount;
      state.pc = sequentialPc;
      return;
    }
    case 'SHL': {
      const oldValue = state.regs[instr.rd];
      const lostBits = instr.amount === 0 ? 0 : oldValue >>> (16 - instr.amount);
      const record: UndoRecord = { tag: 'SHL', pcBefore, pcAfter: sequentialPc, rd: instr.rd, amount: instr.amount, lostBits };
      appendRecord(state, record, toString(instr));
      state.regs[instr.rd] = (oldValue << instr.amount) & 0xffff;
      state.pc = sequentialPc;
      return;
    }
    case 'AND': {
      const record: UndoRecord = { tag: 'AND', pcBefore, pcAfter: sequentialPc, rd: instr.rd, oldValue: state.regs[instr.rd] };
      appendRecord(state, record, toString(instr));
      state.regs[instr.rd] = state.regs[instr.rd] & state.regs[instr.rs];
      state.pc = sequentialPc;
      return;
    }
    case 'JNZ': {
      const taken = state.regs[instr.rc] !== 0;
      const pcAfter = taken ? instr.target : sequentialPc;
      if (pcAfter < 0 || pcAfter > programLength) {
        throw new ExecutionError(pcBefore, toString(instr), `branch target ${pcAfter} is outside program bounds`);
      }
      const record: UndoRecord = { tag: 'JNZ', pcBefore, pcAfter, taken };
      appendRecord(state, record, toString(instr));
      state.pc = pcAfter;
      return;
    }
  }
}

/** Undo the most recently executed instruction. A matching top log record takes
 * precedence; otherwise the previous instruction must be strict and is inverted. */
export function stepBackwardHybrid(state: HybridState, program: readonly Instr[]): void {
  const record = state.undoLog[state.undoLog.length - 1];
  if (record && record.pcAfter === state.pc) {
    undoLogged(state, record);
    state.undoLog.pop();
    state.logBytesUsed -= undoRecordBytes(record);
    state.pc = record.pcBefore;
    return;
  }
  if (state.pc <= 0) throw new ExecutionError(state.pc, '(none)', ERR_AT_START);
  const pcBefore = state.pc - 1;
  const instr = program[pcBefore];
  if (!instr || !isStrictInstr(instr)) {
    throw new ExecutionError(pcBefore, instr ? toString(instr) : '(none)', 'missing matching undo-log record');
  }
  state.pc = pcBefore;
  // The strict evaluator knows the exact inverse table and has no need to log.
  const inverse = { ...instr, op: inverseOp(instr) } as StrictInstr;
  applyOp(state, inverse);
}

function inverseOp(instr: StrictInstr): StrictInstr['op'] {
  switch (instr.op) {
    case 'ADD': return 'SUB'; case 'SUB': return 'ADD';
    case 'ADDI': return 'SUBI'; case 'SUBI': return 'ADDI';
    case 'XOR': return 'XOR'; case 'NOT': return 'NOT'; case 'NEG': return 'NEG';
    case 'ROL': return 'ROR'; case 'ROR': return 'ROL'; case 'SWAP': return 'SWAP';
    case 'EXCH': return 'EXCH'; case 'CADD': return 'CSUB'; case 'CSUB': return 'CADD'; case 'CSWAP': return 'CSWAP';
  }
}

function undoLogged(state: HybridState, record: UndoRecord): void {
  switch (record.tag) {
    case 'MOV': case 'LOAD': case 'AND':
      state.regs[record.rd] = record.oldValue;
      return;
    case 'STORE':
      state.mem[record.address] = record.oldValue;
      return;
    case 'SHR':
      state.regs[record.rd] = record.amount === 0
        ? state.regs[record.rd]
        : ((state.regs[record.rd] << record.amount) | record.lostBits) & 0xffff;
      return;
    case 'SHL':
      state.regs[record.rd] = record.amount === 0
        ? state.regs[record.rd]
        : ((state.regs[record.rd] >>> record.amount) | (record.lostBits << (16 - record.amount))) & 0xffff;
      return;
    case 'JNZ':
      return;
  }
}

export function runForwardHybrid(state: HybridState, program: readonly Instr[], maxSteps = 100_000): HybridState {
  let steps = 0;
  while (state.pc >= 0 && state.pc < program.length) {
    if (steps >= maxSteps) throw new ExecutionError(state.pc, '(run)', `execution limit of ${maxSteps} steps reached`);
    stepForwardHybrid(state, program);
    steps += 1;
  }
  return state;
}

export function runBackwardHybrid(state: HybridState, program: readonly Instr[], maxSteps = 100_000): HybridState {
  let steps = 0;
  while (state.pc > 0 || state.undoLog.length > 0) {
    if (steps >= maxSteps) throw new ExecutionError(state.pc, '(reverse run)', `execution limit of ${maxSteps} steps reached`);
    stepBackwardHybrid(state, program);
    steps += 1;
  }
  return state;
}
