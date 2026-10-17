import { Word } from './word.js';

export type Reg = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const REG_NAMES = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];

export function regName(r: Reg): string {
  return REG_NAMES[r];
}

/** A decoded, typed instruction. Immutable after construction. */
export type Instr = InstrBody;

export type Op =
  | 'ADD' | 'SUB'
  | 'ADDI' | 'SUBI'
  | 'XOR'
  | 'NOT' | 'NEG'
  | 'ROL' | 'ROR'
  | 'SWAP'
  | 'EXCH'
  | 'CADD' | 'CSUB'
  | 'CSWAP';

/** Forward opcode -> its exact inverse opcode. */
export const INVERSE_OP: Record<Op, Op> = {
  ADD: 'SUB', SUB: 'ADD',
  ADDI: 'SUBI', SUBI: 'ADDI',
  XOR: 'XOR',
  NOT: 'NOT', NEG: 'NEG',
  ROL: 'ROR', ROR: 'ROL',
  SWAP: 'SWAP',
  EXCH: 'EXCH',
  CADD: 'CSUB', CSUB: 'CADD',
  CSWAP: 'CSWAP',
} as const;

export function isInversePair(a: Op, b: Op): boolean {
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

export type InstrBody =
  | InstrADD | InstrSUB | InstrADDI | InstrSUBI | InstrXOR
  | InstrNOT | InstrNEG | InstrROL | InstrROR
  | InstrSWAP | InstrEXCH
  | InstrCADD | InstrCSUB | InstrCSWAP;

export function rdOf(i: InstrBody): Reg | null {
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR': return i.rd;
    case 'ADDI': case 'SUBI': return i.rd;
    case 'NOT': case 'NEG': return i.rd;
    case 'ROL': case 'ROR': return i.rd;
    case 'EXCH': return i.rd;
    case 'CADD': case 'CSUB': return i.rd;
    case 'SWAP': case 'CSWAP': return null;
    default: return null;
  }
}

export function srcRegsOf(i: InstrBody): Reg[] {
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR': return [i.rs];
    case 'ADDI': case 'SUBI': return [];
    case 'NOT': case 'NEG': return [];
    case 'ROL': case 'ROR': return [];
    case 'SWAP': return [i.ra, i.rb];
    case 'EXCH': return [i.ra];
    case 'CADD': case 'CSUB': return [i.rs, i.rc];
    case 'CSWAP': return [i.ra, i.rb, i.rc];
    default: return [];
  }
}

export function immOf(i: InstrBody): Word | null {
  switch (i.op) {
    case 'ADDI': case 'SUBI': return i.imm;
    default: return null;
  }
}

export function rotateAmountOf(i: InstrBody): number | null {
  switch (i.op) {
    case 'ROL': case 'ROR': return i.amount;
    default: return null;
  }
}

export function toString(i: InstrBody): string {
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
