import { Word } from './word.js';

export type Reg = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const REG_NAMES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];

export function regName(r: Reg): string {
  return REG_NAMES[r];
}

/** Execution mode selected by the assembler. Hybrid mode also admits logged instructions. */
export type AssemblyMode = 'strict' | 'hybrid';

export type StrictOp =
  | 'ADD' | 'SUB' | 'ADDI' | 'SUBI' | 'XOR' | 'XORI' | 'NOT' | 'NEG'
  | 'ROL' | 'ROR' | 'SWAP' | 'EXCH' | 'CADD' | 'CSUB' | 'CSWAP';

/** These instructions rely on a bounded undo log in hybrid mode. */
export type LoggedOp = 'MOV' | 'LOAD' | 'STORE' | 'SHR' | 'SHL' | 'AND' | 'JNZ';

export type Op = StrictOp | LoggedOp;

export function isLoggedOp(op: Op): op is LoggedOp {
  return op === 'MOV' || op === 'LOAD' || op === 'STORE'
    || op === 'SHR' || op === 'SHL' || op === 'AND' || op === 'JNZ';
}

export function isStrictOp(op: Op): op is StrictOp {
  return !isLoggedOp(op);
}

export function isStrictInstr(instr: Instr): instr is StrictInstr {
  return isStrictOp(instr.op);
}

/** Forward strict opcode -> its exact strict inverse opcode. */
export const INVERSE_OP: Record<StrictOp, StrictOp> = {
  ADD: 'SUB', SUB: 'ADD', ADDI: 'SUBI', SUBI: 'ADDI', XOR: 'XOR', XORI: 'XORI',
  NOT: 'NOT', NEG: 'NEG', ROL: 'ROR', ROR: 'ROL', SWAP: 'SWAP',
  EXCH: 'EXCH', CADD: 'CSUB', CSUB: 'CADD', CSWAP: 'CSWAP',
} as const;

export function isInversePair(a: StrictOp, b: StrictOp): boolean {
  return INVERSE_OP[a] === b && INVERSE_OP[b] === a;
}

export interface InstrADD { readonly op: 'ADD'; readonly rd: Reg; readonly rs: Reg; }
export interface InstrSUB { readonly op: 'SUB'; readonly rd: Reg; readonly rs: Reg; }
export interface InstrADDI { readonly op: 'ADDI'; readonly rd: Reg; readonly imm: Word; }
export interface InstrSUBI { readonly op: 'SUBI'; readonly rd: Reg; readonly imm: Word; }
export interface InstrXOR { readonly op: 'XOR'; readonly rd: Reg; readonly rs: Reg; }
export interface InstrNOT { readonly op: 'NOT'; readonly rd: Reg; }
export interface InstrNEG { readonly op: 'NEG'; readonly rd: Reg; }
export interface InstrROL { readonly op: 'ROL'; readonly rd: Reg; readonly amount: number; }
export interface InstrROR { readonly op: 'ROR'; readonly rd: Reg; readonly amount: number; }
export interface InstrSWAP { readonly op: 'SWAP'; readonly ra: Reg; readonly rb: Reg; }
export interface InstrEXCH { readonly op: 'EXCH'; readonly rd: Reg; readonly ra: Reg; }
export interface InstrCADD { readonly op: 'CADD'; readonly rd: Reg; readonly rs: Reg; readonly rc: Reg; }
export interface InstrCSUB { readonly op: 'CSUB'; readonly rd: Reg; readonly rs: Reg; readonly rc: Reg; }
export interface InstrCSWAP { readonly op: 'CSWAP'; readonly ra: Reg; readonly rb: Reg; readonly rc: Reg; }

export interface InstrXORI { readonly op: 'XORI'; readonly rd: Reg; readonly imm: Word; }
export interface InstrMOV { readonly op: 'MOV'; readonly rd: Reg; readonly rs: Reg; }
export interface InstrLOAD { readonly op: 'LOAD'; readonly rd: Reg; readonly ra: Reg; }
export interface InstrSTORE { readonly op: 'STORE'; readonly ra: Reg; readonly rs: Reg; }
export interface InstrSHR { readonly op: 'SHR'; readonly rd: Reg; readonly amount: number; }
export interface InstrSHL { readonly op: 'SHL'; readonly rd: Reg; readonly amount: number; }
export interface InstrAND { readonly op: 'AND'; readonly rd: Reg; readonly rs: Reg; }
/** target is a zero-based instruction index resolved by the assembler. */
export interface InstrJNZ { readonly op: 'JNZ'; readonly rc: Reg; readonly target: number; readonly label: string; }

export type StrictInstr =
  | InstrADD | InstrSUB | InstrADDI | InstrSUBI | InstrXOR | InstrXORI | InstrNOT | InstrNEG
  | InstrROL | InstrROR | InstrSWAP | InstrEXCH | InstrCADD | InstrCSUB | InstrCSWAP;
export type LoggedInstr = InstrMOV | InstrLOAD | InstrSTORE | InstrSHR | InstrSHL | InstrAND | InstrJNZ;
/** A decoded, typed instruction. Immutable after construction. */
export type InstrBody = StrictInstr | LoggedInstr;
export type Instr = InstrBody;

export function rdOf(i: InstrBody): Reg | null {
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR': case 'MOV': case 'AND': return i.rd;
    case 'ADDI': case 'SUBI': case 'XORI': case 'NOT': case 'NEG': case 'ROL': case 'ROR': case 'SHR': case 'SHL':
    case 'EXCH': case 'LOAD': case 'CADD': case 'CSUB': return i.rd;
    case 'SWAP': case 'CSWAP': case 'STORE': case 'JNZ': return null;
  }
}

export function srcRegsOf(i: InstrBody): Reg[] {
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR': case 'MOV': case 'AND': return [i.rs];
    case 'ADDI': case 'SUBI': case 'XORI': case 'NOT': case 'NEG': case 'ROL': case 'ROR': case 'SHR': case 'SHL': return [];
    case 'SWAP': return [i.ra, i.rb];
    case 'EXCH': case 'LOAD': return [i.ra];
    case 'STORE': return [i.ra, i.rs];
    case 'CADD': case 'CSUB': return [i.rs, i.rc];
    case 'CSWAP': return [i.ra, i.rb, i.rc];
    case 'JNZ': return [i.rc];
  }
}

export function immOf(i: InstrBody): Word | null {
  return i.op === 'ADDI' || i.op === 'SUBI' || i.op === 'XORI' ? i.imm : null;
}

export function rotateAmountOf(i: InstrBody): number | null {
  return i.op === 'ROL' || i.op === 'ROR' ? i.amount : null;
}

export function toString(i: InstrBody): string {
  switch (i.op) {
    case 'ADD': return `ADD ${regName(i.rd)}, ${regName(i.rs)}`;
    case 'SUB': return `SUB ${regName(i.rd)}, ${regName(i.rs)}`;
    case 'ADDI': return `ADDI ${regName(i.rd)}, ${i.imm}`;
    case 'SUBI': return `SUBI ${regName(i.rd)}, ${i.imm}`;
    case 'XOR': return `XOR ${regName(i.rd)}, ${regName(i.rs)}`;
    case 'XORI': return `XORI ${regName(i.rd)}, 0x${i.imm.toString(16).padStart(4, '0')}`;
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
