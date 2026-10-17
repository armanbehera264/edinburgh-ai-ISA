/** Conventional (destructive) CPU baseline for comparison.
 *
 * Executes analogous destructive assignments and appends old destination
 * values to an undo log. This is Option A from the spec: a reversible
 * debugger that records overwritten values. Used only as a visual
 * comparison against Flip-16's inherently reversible core.
 */
import { toWord, add, sub, bitNot, rol, ror } from './word.js';
export function newBaselineState() {
    return {
        regs: new Uint16Array(8),
        mem: new Uint16Array(1 << 16),
        pc: 0,
        log: [],
        logBytes: 0,
    };
}
export function cloneBaseline(s) {
    return {
        regs: new Uint16Array(s.regs),
        mem: new Uint16Array(s.mem),
        pc: s.pc,
        log: [...s.log],
        logBytes: s.logBytes,
    };
}
function recordLog(s, pc, op, destination, oldValue) {
    s.log.push({ pc, op, destination, oldValue });
    s.logBytes += 2; // each entry retains a 16-bit word = 2 bytes
}
export function stepForwardBaseline(s, program) {
    if (s.pc >= program.length)
        throw new Error(`baseline stepForward at pc === N`);
    const instr = program[s.pc];
    applyForwardBaseline(s, instr, s.pc);
    s.pc += 1;
}
function applyForwardBaseline(s, instr, pc) {
    switch (instr.op) {
        case 'ADD': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'ADD', `r${instr.rd}`, old);
            s.regs[instr.rd] = add(old, s.regs[instr.rs]);
            break;
        }
        case 'SUB': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'SUB', `r${instr.rd}`, old);
            s.regs[instr.rd] = sub(old, s.regs[instr.rs]);
            break;
        }
        case 'ADDI': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'ADDI', `r${instr.rd}`, old);
            s.regs[instr.rd] = add(old, instr.imm);
            break;
        }
        case 'SUBI': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'SUBI', `r${instr.rd}`, old);
            s.regs[instr.rd] = sub(old, instr.imm);
            break;
        }
        case 'XOR': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'XOR', `r${instr.rd}`, old);
            s.regs[instr.rd] = old ^ s.regs[instr.rs];
            break;
        }
        case 'NOT': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'NOT', `r${instr.rd}`, old);
            s.regs[instr.rd] = bitNot(old);
            break;
        }
        case 'NEG': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'NEG', `r${instr.rd}`, old);
            s.regs[instr.rd] = toWord(-old);
            break;
        }
        case 'ROL': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'ROL', `r${instr.rd}`, old);
            s.regs[instr.rd] = rol(old, instr.amount);
            break;
        }
        case 'ROR': {
            const old = s.regs[instr.rd];
            recordLog(s, pc, 'ROR', `r${instr.rd}`, old);
            s.regs[instr.rd] = ror(old, instr.amount);
            break;
        }
        case 'SWAP': {
            const oldA = s.regs[instr.ra];
            const oldB = s.regs[instr.rb];
            recordLog(s, pc, 'SWAP', `r${instr.ra}`, oldA);
            recordLog(s, pc, 'SWAP', `r${instr.rb}`, oldB);
            s.regs[instr.ra] = oldB;
            s.regs[instr.rb] = oldA;
            break;
        }
        case 'EXCH': {
            const addr = s.regs[instr.ra];
            const oldReg = s.regs[instr.rd];
            const oldMem = s.mem[addr];
            recordLog(s, pc, 'EXCH', `r${instr.rd}`, oldReg);
            recordLog(s, pc, 'EXCH', `mem[0x${addr.toString(16).padStart(4, '0')}]`, oldMem);
            s.regs[instr.rd] = oldMem;
            s.mem[addr] = oldReg;
            break;
        }
        case 'CADD': {
            if (s.regs[instr.rc] !== 0) {
                const old = s.regs[instr.rd];
                recordLog(s, pc, 'CADD', `r${instr.rd}`, old);
                s.regs[instr.rd] = add(old, s.regs[instr.rs]);
            }
            break;
        }
        case 'CSUB': {
            if (s.regs[instr.rc] !== 0) {
                const old = s.regs[instr.rd];
                recordLog(s, pc, 'CSUB', `r${instr.rd}`, old);
                s.regs[instr.rd] = sub(old, s.regs[instr.rs]);
            }
            break;
        }
        case 'CSWAP': {
            if (s.regs[instr.rc] !== 0) {
                const oldA = s.regs[instr.ra];
                const oldB = s.regs[instr.rb];
                recordLog(s, pc, 'CSWAP', `r${instr.ra}`, oldA);
                recordLog(s, pc, 'CSWAP', `r${instr.rb}`, oldB);
                s.regs[instr.ra] = oldB;
                s.regs[instr.rb] = oldA;
            }
            break;
        }
        default:
            throw new Error(`Unknown opcode: ${String(instr.op)}`);
    }
}
export function runForwardBaseline(s, program) {
    while (s.pc < program.length) {
        stepForwardBaseline(s, program);
    }
    return s;
}
export function stepBackwardBaseline(s, program) {
    if (s.pc <= 0)
        throw new Error(`baseline stepBackward at pc === 0`);
    s.pc -= 1;
    const instr = program[s.pc];
    // Undo using the log entries recorded for this pc, in reverse order.
    const entries = s.log.filter((e) => e.pc === s.pc);
    // Pop matching entries from the end of the log.
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        // Restore old value.
        if (e.destination.startsWith('mem[')) {
            const addr = Number(e.destination.match(/\[(0x[0-9a-f]+)\]/i)?.[1] ?? '0');
            s.mem[addr] = e.oldValue;
        }
        else {
            const reg = Number(e.destination.slice(1));
            s.regs[reg] = e.oldValue;
        }
        s.log.pop();
        s.logBytes -= 2;
    }
    // Also run inverse op isn't strictly needed since log restores old values,
    // but we apply the inverse to mirror the reversible machine's structure.
    // The log restore is authoritative.
}
//# sourceMappingURL=baseline.js.map