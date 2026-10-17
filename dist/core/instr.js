export const REG_NAMES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
export function regName(r) {
    return REG_NAMES[r];
}
export function isLoggedOp(op) {
    return op === 'MOV' || op === 'LOAD' || op === 'STORE'
        || op === 'SHR' || op === 'SHL' || op === 'AND' || op === 'JNZ';
}
export function isStrictOp(op) {
    return !isLoggedOp(op);
}
export function isStrictInstr(instr) {
    return isStrictOp(instr.op);
}
/** Forward strict opcode -> its exact strict inverse opcode. */
export const INVERSE_OP = {
    ADD: 'SUB', SUB: 'ADD', ADDI: 'SUBI', SUBI: 'ADDI', XOR: 'XOR',
    NOT: 'NOT', NEG: 'NEG', ROL: 'ROR', ROR: 'ROL', SWAP: 'SWAP',
    EXCH: 'EXCH', CADD: 'CSUB', CSUB: 'CADD', CSWAP: 'CSWAP',
};
export function isInversePair(a, b) {
    return INVERSE_OP[a] === b && INVERSE_OP[b] === a;
}
export function rdOf(i) {
    switch (i.op) {
        case 'ADD':
        case 'SUB':
        case 'XOR':
        case 'MOV':
        case 'AND': return i.rd;
        case 'ADDI':
        case 'SUBI':
        case 'NOT':
        case 'NEG':
        case 'ROL':
        case 'ROR':
        case 'SHR':
        case 'SHL':
        case 'EXCH':
        case 'LOAD':
        case 'CADD':
        case 'CSUB': return i.rd;
        case 'SWAP':
        case 'CSWAP':
        case 'STORE':
        case 'JNZ': return null;
    }
}
export function srcRegsOf(i) {
    switch (i.op) {
        case 'ADD':
        case 'SUB':
        case 'XOR':
        case 'MOV':
        case 'AND': return [i.rs];
        case 'ADDI':
        case 'SUBI':
        case 'NOT':
        case 'NEG':
        case 'ROL':
        case 'ROR':
        case 'SHR':
        case 'SHL': return [];
        case 'SWAP': return [i.ra, i.rb];
        case 'EXCH':
        case 'LOAD': return [i.ra];
        case 'STORE': return [i.ra, i.rs];
        case 'CADD':
        case 'CSUB': return [i.rs, i.rc];
        case 'CSWAP': return [i.ra, i.rb, i.rc];
        case 'JNZ': return [i.rc];
    }
}
export function immOf(i) {
    return i.op === 'ADDI' || i.op === 'SUBI' ? i.imm : null;
}
export function rotateAmountOf(i) {
    return i.op === 'ROL' || i.op === 'ROR' ? i.amount : null;
}
export function toString(i) {
    switch (i.op) {
        case 'ADD': return `ADD ${regName(i.rd)}, ${regName(i.rs)}`;
        case 'SUB': return `SUB ${regName(i.rd)}, ${regName(i.rs)}`;
        case 'ADDI': return `ADDI ${regName(i.rd)}, ${i.imm}`;
        case 'SUBI': return `SUBI ${regName(i.rd)}, ${i.imm}`;
        case 'XOR': return `XOR ${regName(i.rd)}, ${regName(i.rs)}`;
        case 'NOT': return `NOT ${regName(i.rd)}`;
        case 'NEG': return `NEG ${regName(i.rd)}`;
        case 'ROL': return `ROL ${regName(i.rd)}, ${i.amount}`;
        case 'ROR': return `ROR ${regName(i.rd)}, ${i.amount}`;
        case 'SWAP': return `SWAP ${regName(i.ra)}, ${regName(i.rb)}`;
        case 'EXCH': return `EXCH ${regName(i.rd)}, [${regName(i.ra)}]`;
        case 'CADD': return `CADD ${regName(i.rd)}, ${regName(i.rs)}, ${regName(i.rc)}`;
        case 'CSUB': return `CSUB ${regName(i.rd)}, ${regName(i.rs)}, ${regName(i.rc)}`;
        case 'CSWAP': return `CSWAP ${regName(i.ra)}, ${regName(i.rb)}, ${regName(i.rc)}`;
        case 'MOV': return `MOV ${regName(i.rd)}, ${regName(i.rs)}`;
        case 'LOAD': return `LOAD ${regName(i.rd)}, [${regName(i.ra)}]`;
        case 'STORE': return `STORE [${regName(i.ra)}], ${regName(i.rs)}`;
        case 'SHR': return `SHR ${regName(i.rd)}, ${i.amount}`;
        case 'SHL': return `SHL ${regName(i.rd)}, ${i.amount}`;
        case 'AND': return `AND ${regName(i.rd)}, ${regName(i.rs)}`;
        case 'JNZ': return `JNZ ${regName(i.rc)}, ${i.label}`;
    }
}
//# sourceMappingURL=instr.js.map