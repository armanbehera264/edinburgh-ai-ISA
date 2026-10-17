import { applyForward, applyOp, ExecutionError, ERR_AT_END, ERR_AT_START } from './eval.js';
import { isStrictInstr, toString } from './instr.js';
import { newState } from './state.js';
/** The default is intentionally finite: a program cannot silently consume host memory. */
export const DEFAULT_LOG_BYTE_LIMIT = 64 * 1024;
export function newHybridState(logByteLimit = DEFAULT_LOG_BYTE_LIMIT) {
    const base = newState();
    return { ...base, undoLog: [], logBytesUsed: 0, logByteLimit };
}
export function cloneHybridState(state) {
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
export function undoRecordBytes(record) {
    switch (record.tag) {
        // tag + payload length + pcBefore + pcAfter forms a six-byte header.
        // These are canonical accounting sizes; the in-memory object is deliberately
        // kept readable rather than pretending to be a byte-packed device format.
        case 'MOV':
        case 'LOAD':
        case 'AND': return 8;
        case 'STORE': return 10;
        case 'SHR':
        case 'SHL': return 9;
        case 'JNZ': return 7;
    }
}
function appendRecord(state, record, instruction) {
    const bytes = undoRecordBytes(record);
    if (state.logBytesUsed + bytes > state.logByteLimit) {
        throw new ExecutionError(state.pc, instruction, `undo log full (${state.logBytesUsed}/${state.logByteLimit} bytes)`);
    }
    state.undoLog.push(record);
    state.logBytesUsed += bytes;
}
/** Run one instruction forward. Strict instructions write no undo record; logged
 * instructions append their preimage before they overwrite anything. */
export function stepForwardHybrid(state, program) {
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
    applyLoggedForward(state, instr, program.length, pcBefore);
}
function applyLoggedForward(state, instr, programLength, pcBefore) {
    const sequentialPc = pcBefore + 1;
    switch (instr.op) {
        case 'MOV': {
            const record = { tag: 'MOV', pcBefore, pcAfter: sequentialPc, rd: instr.rd, oldValue: state.regs[instr.rd] };
            appendRecord(state, record, toString(instr));
            state.regs[instr.rd] = state.regs[instr.rs];
            state.pc = sequentialPc;
            return;
        }
        case 'LOAD': {
            const address = state.regs[instr.ra];
            const record = { tag: 'LOAD', pcBefore, pcAfter: sequentialPc, rd: instr.rd, oldValue: state.regs[instr.rd] };
            appendRecord(state, record, toString(instr));
            state.regs[instr.rd] = state.mem[address];
            state.pc = sequentialPc;
            return;
        }
        case 'STORE': {
            const address = state.regs[instr.ra];
            const record = { tag: 'STORE', pcBefore, pcAfter: sequentialPc, address, oldValue: state.mem[address] };
            appendRecord(state, record, toString(instr));
            state.mem[address] = state.regs[instr.rs];
            state.pc = sequentialPc;
            return;
        }
        case 'SHR': {
            const oldValue = state.regs[instr.rd];
            const lostBits = instr.amount === 0 ? 0 : oldValue & ((1 << instr.amount) - 1);
            const record = { tag: 'SHR', pcBefore, pcAfter: sequentialPc, rd: instr.rd, amount: instr.amount, lostBits };
            appendRecord(state, record, toString(instr));
            state.regs[instr.rd] = oldValue >>> instr.amount;
            state.pc = sequentialPc;
            return;
        }
        case 'SHL': {
            const oldValue = state.regs[instr.rd];
            const lostBits = instr.amount === 0 ? 0 : oldValue >>> (16 - instr.amount);
            const record = { tag: 'SHL', pcBefore, pcAfter: sequentialPc, rd: instr.rd, amount: instr.amount, lostBits };
            appendRecord(state, record, toString(instr));
            state.regs[instr.rd] = (oldValue << instr.amount) & 0xffff;
            state.pc = sequentialPc;
            return;
        }
        case 'AND': {
            const record = { tag: 'AND', pcBefore, pcAfter: sequentialPc, rd: instr.rd, oldValue: state.regs[instr.rd] };
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
            const record = { tag: 'JNZ', pcBefore, pcAfter, taken };
            appendRecord(state, record, toString(instr));
            state.pc = pcAfter;
            return;
        }
    }
}
/** Undo the most recently executed instruction. A matching top log record takes
 * precedence; otherwise the previous instruction must be strict and is inverted. */
export function stepBackwardHybrid(state, program) {
    const record = state.undoLog[state.undoLog.length - 1];
    if (record && record.pcAfter === state.pc) {
        undoLogged(state, record);
        state.undoLog.pop();
        state.logBytesUsed -= undoRecordBytes(record);
        state.pc = record.pcBefore;
        return;
    }
    if (state.pc <= 0)
        throw new ExecutionError(state.pc, '(none)', ERR_AT_START);
    const pcBefore = state.pc - 1;
    const instr = program[pcBefore];
    if (!instr || !isStrictInstr(instr)) {
        throw new ExecutionError(pcBefore, instr ? toString(instr) : '(none)', 'missing matching undo-log record');
    }
    state.pc = pcBefore;
    // The strict evaluator knows the exact inverse table and has no need to log.
    const inverse = { ...instr, op: inverseOp(instr) };
    applyOp(state, inverse);
}
function inverseOp(instr) {
    switch (instr.op) {
        case 'ADD': return 'SUB';
        case 'SUB': return 'ADD';
        case 'ADDI': return 'SUBI';
        case 'SUBI': return 'ADDI';
        case 'XOR': return 'XOR';
        case 'NOT': return 'NOT';
        case 'NEG': return 'NEG';
        case 'ROL': return 'ROR';
        case 'ROR': return 'ROL';
        case 'SWAP': return 'SWAP';
        case 'EXCH': return 'EXCH';
        case 'CADD': return 'CSUB';
        case 'CSUB': return 'CADD';
        case 'CSWAP': return 'CSWAP';
    }
}
function undoLogged(state, record) {
    switch (record.tag) {
        case 'MOV':
        case 'LOAD':
        case 'AND':
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
export function runForwardHybrid(state, program, maxSteps = 100000) {
    let steps = 0;
    while (state.pc >= 0 && state.pc < program.length) {
        if (steps >= maxSteps)
            throw new ExecutionError(state.pc, '(run)', `execution limit of ${maxSteps} steps reached`);
        stepForwardHybrid(state, program);
        steps += 1;
    }
    return state;
}
export function runBackwardHybrid(state, program, maxSteps = 100000) {
    let steps = 0;
    while (state.pc > 0 || state.undoLog.length > 0) {
        if (steps >= maxSteps)
            throw new ExecutionError(state.pc, '(reverse run)', `execution limit of ${maxSteps} steps reached`);
        stepBackwardHybrid(state, program);
        steps += 1;
    }
    return state;
}
//# sourceMappingURL=hybrid.js.map