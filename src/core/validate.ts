import { InstrBody, Instr } from './instr.js';

export interface ValidationError {
  line?: number;
  instruction: string;
  reason: string;
}

export function formatInstr(i: InstrBody): string {
  const rdOf = (x: InstrBody): number | null => {
    switch (x.op) {
      case 'ADD': case 'SUB': case 'XOR': return x.rd;
      case 'ADDI': case 'SUBI': case 'XORI': return x.rd;
      case 'NOT': case 'NEG': return x.rd;
      case 'ROL': case 'ROR': return x.rd;
      case 'EXCH': return x.rd;
      case 'CADD': case 'CSUB': return x.rd;
      default: return null;
    }
  };
  const srcs = (x: InstrBody): number[] => {
    switch (x.op) {
      case 'ADD': case 'SUB': case 'XOR': return [x.rs];
      case 'ADDI': case 'SUBI': case 'XORI': return [];
      case 'NOT': case 'NEG': return [];
      case 'ROL': case 'ROR': return [];
      case 'SWAP': return [x.ra, x.rb];
      case 'EXCH': return [x.ra];
      case 'CADD': case 'CSUB': return [x.rs, x.rc];
      case 'CSWAP': return [x.ra, x.rb, x.rc];
      default: return [];
    }
  };
  const regName = (r: number): string => `r${r}`;
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR':
      return `${i.op} ${regName(i.rd)}, ${regName(i.rs)}`;
    case 'ADDI': case 'SUBI': case 'XORI':
      return `${i.op} ${regName(i.rd)}, ${i.imm}`;
    case 'NOT': case 'NEG':
      return `${i.op} ${regName(i.rd)}`;
    case 'ROL': case 'ROR':
      return `${i.op} ${regName(i.rd)}, ${i.amount}`;
    case 'SWAP':
      return `SWAP ${regName(i.ra)}, ${regName(i.rb)}`;
    case 'EXCH':
      return `EXCH ${regName(i.rd)}, [${regName(i.ra)}]`;
    case 'CADD': case 'CSUB':
      return `${i.op} ${regName(i.rd)}, ${regName(i.rs)}, ${regName(i.rc)}`;
    case 'CSWAP':
      return `CSWAP ${regName(i.ra)}, ${regName(i.rb)}, ${regName(i.rc)}`;
    default:
      return '<unknown>';
  }
}

export type LegalityCheck = (i: InstrBody) => ValidationError | null;

function rdEqRs(i: InstrBody): ValidationError | null {
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR':
      if (i.rd === i.rs) {
        return { instruction: formatInstr(i), reason: 'destination equals source; operation is not one-to-one' };
      }
      return null;
    default:
      return null;
  }
}

function exchAddressOverlap(i: InstrBody): ValidationError | null {
  if (i.op === 'EXCH' && i.rd === i.ra) {
    return { instruction: formatInstr(i), reason: 'data register equals address register; reversal cannot identify the exchanged cell' };
  }
  return null;
}

function controlOverlap(i: InstrBody): ValidationError | null {
  switch (i.op) {
    case 'CADD': case 'CSUB':
      if (i.rd === i.rc) {
        return { instruction: formatInstr(i), reason: 'destination equals control register; control predicate would change' };
      }
      if (i.rd === i.rs) {
        return { instruction: formatInstr(i), reason: 'destination equals source register' };
      }
      return null;
    case 'CSWAP':
      if (i.ra === i.rb || i.ra === i.rc || i.rb === i.rc) {
        return { instruction: formatInstr(i), reason: 'ra, rb, and rc must be pairwise distinct' };
      }
      return null;
    default:
      return null;
  }
}

function swapIdentity(i: InstrBody): ValidationError | null {
  if (i.op === 'SWAP' && i.ra === i.rb) {
    return { instruction: formatInstr(i), reason: 'identity swap; usually indicates a programming mistake' };
  }
  return null;
}

const LEGALITY_CHECKS: LegalityCheck[] = [
  rdEqRs,
  exchAddressOverlap,
  controlOverlap,
  swapIdentity,
];

export function validateInstr(i: InstrBody, line?: number): ValidationError | null {
  for (const check of LEGALITY_CHECKS) {
    const err = check(i);
    if (err) {
      if (line !== undefined) err.line = line;
      return err;
    }
  }
  return null;
}

export function validateProgram(program: readonly Instr[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (let i = 0; i < program.length; i++) {
    const err = validateInstr(program[i] as InstrBody, i + 1);
    if (err) errors.push(err);
  }
  return errors;
}

export function validateDefensive(sRegs: number[], memLen: number, i: InstrBody): ValidationError | null {
  // All register operands are within 0..7 by construction of the Reg type.
  // EXCH address is always in range because a full 16-bit register addresses memory.
  return validateInstr(i);
}
