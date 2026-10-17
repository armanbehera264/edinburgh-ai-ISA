export const REG_NAMES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
export function regName(r) {
    return REG_NAMES[r];
}
/** Forward opcode -> its exact inverse opcode. */
export const INVERSE_OP = {
    ADD: 'SUB', SUB: 'ADD',
    ADDI: 'SUBI', SUBI: 'ADDI',
    XOR: 'XOR',
    NOT: 'NOT', NEG: 'NEG',
    ROL: 'ROR', ROR: 'ROL',
    SWAP: 'SWAP',
    EXCH: 'EXCH',
    CADD: 'CSUB', CSUB: 'CADD',
    CSWAP: 'CSWAP',
};
export function isInversePair(a, b) {
    return INVERSE_OP[a] === b && INVERSE_OP[b] === a;
}
export function rdOf(i) {
    switch (i.op) {
        case 'ADD':
        case 'SUB':
        case 'XOR': return i.rd;
        case 'ADDI':
        case 'SUBI': return i.rd;
        case 'NOT':
        case 'NEG': return i.rd;
        case 'ROL':
        case 'ROR': return i.rd;
        case 'EXCH': return i.rd;
        case 'CADD':
        case 'CSUB': return i.rd;
        case 'SWAP':
        case 'CSWAP': return null;
        default: return null;
    }
}
export function srcRegsOf(i) {
    switch (i.op) {
        case 'ADD':
        case 'SUB':
        case 'XOR': return [i.rs];
        case 'ADDI':
        case 'SUBI': return [];
        case 'NOT':
        case 'NEG': return [];
        case 'ROL':
        case 'ROR': return [];
        case 'SWAP': return [i.ra, i.rb];
        case 'EXCH': return [i.ra];
        case 'CADD':
        case 'CSUB': return [i.rs, i.rc];
        case 'CSWAP': return [i.ra, i.rb, i.rc];
        default: return [];
    }
}
export function immOf(i) {
    switch (i.op) {
        case 'ADDI':
        case 'SUBI': return i.imm;
        default: return null;
    }
}
export function rotateAmountOf(i) {
    switch (i.op) {
        case 'ROL':
        case 'ROR': return i.amount;
        default: return null;
    }
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
        default: return '<unknown>';
    }
}
//# sourceMappingURL=instr.js.map