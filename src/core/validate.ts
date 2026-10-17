import { InstrBody, Instr, toString } from './instr.js';

export interface ValidationError {
  line?: number;
  instruction: string;
  reason: string;
}

export function formatInstr(i: InstrBody): string {
  return toString(i);
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

function loggedOperandOverlap(i: InstrBody): ValidationError | null {
  if (i.op === 'MOV' && i.rd === i.rs) {
    return { instruction: formatInstr(i), reason: 'destination equals source; MOV would be a redundant logged no-op' };
  }
  if (i.op === 'LOAD' && i.rd === i.ra) {
    return { instruction: formatInstr(i), reason: 'destination equals address register; preserve the address in another register' };
  }
  if ((i.op === 'SHL' || i.op === 'SHR') && (i.amount < 0 || i.amount > 15)) {
    return { instruction: formatInstr(i), reason: 'shift amount must be in the range 0..15' };
  }
  return null;
}

const LEGALITY_CHECKS: LegalityCheck[] = [
  rdEqRs,
  exchAddressOverlap,
  controlOverlap,
  swapIdentity,
  loggedOperandOverlap,
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
