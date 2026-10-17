import { add, sub, neg, bitNot, rol, ror } from './word.js';
import { INVERSE_OP, } from './instr.js';
export class ExecutionError extends Error {
    constructor(pc, instruction, message) {
        super(`pc=${pc} ${instruction}: ${message}`);
        this.name = 'ExecutionError';
        this.pc = pc;
        this.instruction = instruction;
    }
}
/** The program counter boundary check messages. */
export const ERR_AT_END = 'stepForward at pc === N';
export const ERR_AT_START = 'stepBackward at pc === 0';
/** Apply a single forward instruction in place and advance pc by one.
 * Throws ExecutionError if pc === N (no instruction to run). */
export function stepForward(state, program) {
    if (state.pc >= program.length) {
        throw new ExecutionError(state.pc, '(none)', ERR_AT_END);
    }
    const instr = program[state.pc];
    applyForward(state, instr);
    state.pc += 1;
}
/** Apply a single inverse instruction in place and decrement pc by one.
 * Throws ExecutionError if pc === 0 (nothing to undo). */
export function stepBackward(state, program) {
    if (state.pc <= 0) {
        throw new ExecutionError(state.pc, '(none)', ERR_AT_START);
    }
    state.pc -= 1;
    const instr = program[state.pc];
    const inverseOp = INVERSE_OP[instr.op];
    applyOp(state, { ...instr, op: inverseOp });
}
/** Apply one forward instruction in place without touching pc. */
export function applyForward(state, instr) {
    applyOp(state, instr);
}
/** Apply one instruction (already possibly inverted) in place. */
export function applyOp(state, instr) {
    switch (instr.op) {
        case 'ADD':
            state.regs[instr.rd] = add(state.regs[instr.rd], state.regs[instr.rs]);
            break;
        case 'SUB':
            state.regs[instr.rd] = sub(state.regs[instr.rd], state.regs[instr.rs]);
            break;
        case 'ADDI':
            state.regs[instr.rd] = add(state.regs[instr.rd], instr.imm);
            break;
        case 'SUBI':
            state.regs[instr.rd] = sub(state.regs[instr.rd], instr.imm);
            break;
        case 'XOR':
            state.regs[instr.rd] = state.regs[instr.rd] ^ state.regs[instr.rs];
            break;
        case 'NOT':
            state.regs[instr.rd] = bitNot(state.regs[instr.rd]);
            break;
        case 'NEG':
            state.regs[instr.rd] = neg(state.regs[instr.rd]);
            break;
        case 'ROL':
            state.regs[instr.rd] = rol(state.regs[instr.rd], instr.amount);
            break;
        case 'ROR':
            state.regs[instr.rd] = ror(state.regs[instr.rd], instr.amount);
            break;
        case 'SWAP': {
            const a = state.regs[instr.ra];
            const b = state.regs[instr.rb];
            state.regs[instr.ra] = b;
            state.regs[instr.rb] = a;
            break;
        }
        case 'EXCH': {
            const addr = state.regs[instr.ra];
            const tmp = state.regs[instr.rd];
            state.regs[instr.rd] = state.mem[addr];
            state.mem[addr] = tmp;
            break;
        }
        case 'CADD':
            if (state.regs[instr.rc] !== 0) {
                state.regs[instr.rd] = add(state.regs[instr.rd], state.regs[instr.rs]);
            }
            break;
        case 'CSUB':
            if (state.regs[instr.rc] !== 0) {
                state.regs[instr.rd] = sub(state.regs[instr.rd], state.regs[instr.rs]);
            }
            break;
        case 'CSWAP':
            if (state.regs[instr.rc] !== 0) {
                const a = state.regs[instr.ra];
                const b = state.regs[instr.rb];
                state.regs[instr.ra] = b;
                state.regs[instr.rb] = a;
            }
            break;
        default:
            throw new Error(`Unknown opcode: ${String(instr.op)}`);
    }
}
/** Run the whole program forward from pc = 0 until pc === N.
 * Returns the final state. Throws on the first error. */
export function runForward(state, program) {
    while (state.pc < program.length) {
        stepForward(state, program);
    }
    return state;
}
/** Run the whole program backward from pc = N until pc = 0.
 * Returns the final state. Throws on the first error. */
export function runBackward(state, program) {
    while (state.pc > 0) {
        stepBackward(state, program);
    }
    return state;
}
/** Build the inverse program: reverse(order) + invert each opcode.
 * Running this forward from the final state of P yields P's initial state. */
export function makeInverseProgram(program) {
    return [...program]
        .reverse()
        .map((i) => ({ ...i, op: INVERSE_OP[i.op] }));
}
/** Execute the whole program forward, returning a new state (input not mutated). */
export function executeForward(state, program) {
    const s = cloneStateDeep(state);
    runForward(s, program);
    return s;
}
/** Execute the whole program backward, returning a new state (input not mutated). */
export function executeBackward(state, program) {
    const s = cloneStateDeep(state);
    runBackward(s, program);
    return s;
}
function cloneStateDeep(s) {
    return {
        regs: new Uint16Array(s.regs),
        mem: new Uint16Array(s.mem),
        pc: s.pc,
    };
}
//# sourceMappingURL=eval.js.map