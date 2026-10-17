import { Word, toWord, MAX_WORD } from './word.js';
import { AssemblyMode, Reg, InstrBody, Instr, Op, isLoggedOp } from './instr.js';
import { validateInstr, ValidationError } from './validate.js';

export interface AsmOptions {
  /** Strict accepts only self-inverting instructions; hybrid also accepts logged instructions. */
  mode?: AssemblyMode;
  /** Maximum expanded program length. Default 65535 per spec. */
  maxProgramLength?: number;
  /** Optional demo contracts, e.g. { r5: 0 } meaning r5 must begin at zero. */
  contracts?: Record<number, Word>;
}

export interface AsmResult {
  program: Instr[];
  /** Original one-based source line for each assembled instruction. */
  sourceLines: number[];
  errors: ValidationError[];
  expandedLength: number;
}

interface SourceItem { text: string; line: number; }
interface ParsedSourceItem extends SourceItem { instruction: string; }

function stripComment(text: string): string {
  const hash = text.indexOf('#');
  return hash === -1 ? text : text.slice(0, hash);
}

/** Parse a 16-bit immediate: decimal, hex, or signed decimal. */
function parseImm(text: string): { value: Word; error: string | null } {
  const t = text.trim();
  if (t === '') return { value: 0, error: 'empty immediate' };
  let sign = 1;
  let body = t;
  const signed = /^([+-])(.+)$/.exec(t);
  if (signed) {
    sign = signed[1] === '+' ? 1 : -1;
    body = signed[2].trim();
  }
  let num: number;
  if (/^0[xX][0-9a-fA-F]+$/.test(body)) num = parseInt(body.slice(2), 16);
  else if (/^\d+$/.test(body)) num = parseInt(body, 10);
  else return { value: 0, error: `invalid immediate: ${text}` };
  const value = toWord(sign * num);
  if (value > MAX_WORD) return { value: 0, error: `immediate out of range: ${text}` };
  return { value, error: null };
}

function parseReg(text: string): { reg: Reg | null; error: string | null } {
  const m = /^r([0-7])$/i.exec(text.trim());
  if (!m) return { reg: null, error: `invalid register: ${text}` };
  return { reg: Number(m[1]) as Reg, error: null };
}

function parseRotateAmount(text: string): { amount: number; error: string | null } {
  const n = Number(text.trim());
  if (!Number.isInteger(n) || n < 0) return { amount: 0, error: `invalid rotation amount: ${text}` };
  return { amount: n & 15, error: null };
}

function parseShiftAmount(text: string): { amount: number; error: string | null } {
  const n = Number(text.trim());
  if (!Number.isInteger(n) || n < 0 || n > 15) {
    return { amount: 0, error: `shift amount must be an integer in the range 0..15: ${text}` };
  }
  return { amount: n, error: null };
}

function parseAddress(text: string, op: string): { reg: Reg | null; error: string | null } {
  const match = /^\[\s*(r[0-7])\s*\]$/i.exec(text.trim());
  if (!match) return { reg: null, error: `${op} address must be [rN]` };
  return parseReg(match[1]);
}

export interface AsmLineError { line: number; instruction: string; reason: string; }

export function assemble(source: string, options: AsmOptions = {}): AsmResult {
  const mode = options.mode ?? 'strict';
  const maxProgramLength = options.maxProgramLength ?? 0xffff;
  const errors: AsmLineError[] = [];
  const expanded = expandRepeats(source, errors);

  // Labels name instruction boundaries after repeat expansion. Labels may have an
  // instruction on the same line and may be referenced before their definition.
  const labels = new Map<string, number>();
  const entries: ParsedSourceItem[] = [];
  for (const item of expanded) {
    let body = stripComment(item.text).trim();
    if (body === '') continue;
    const label = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s*(.*))?$/.exec(body);
    if (label) {
      const name = label[1].toLowerCase();
      if (labels.has(name)) {
        errors.push({ line: item.line, instruction: body, reason: `duplicate label: ${label[1]}` });
      } else {
        labels.set(name, entries.length);
      }
      body = (label[2] ?? '').trim();
      if (body === '') continue;
    }
    entries.push({ ...item, instruction: body });
  }

  const program: Instr[] = [];
  const sourceLines: number[] = [];
  for (const item of entries) {
    const parsed = parseLine(item.instruction, item.line, options.contracts, labels, mode);
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    const instr = parsed.instr;
    if (!instr) continue;
    const vErr = validateInstr(instr, item.line);
    if (vErr) {
      errors.push({ line: vErr.line ?? item.line, instruction: vErr.instruction, reason: vErr.reason });
      continue;
    }
    program.push(instr);
    sourceLines.push(item.line);
  }

  if (entries.length > maxProgramLength) {
    errors.push({ line: 0, instruction: '(program)', reason: `expanded program length ${entries.length} exceeds limit ${maxProgramLength}` });
  }

  // A branch target is meaningful only for a complete program. Do not expose a
  // partially assembled program that could make its label PCs inconsistent.
  const valid = errors.length === 0;
  return {
    program: valid ? program : [],
    sourceLines: valid ? sourceLines : [],
    errors: errors as ValidationError[],
    expandedLength: entries.length,
  };
}

function expandRepeats(source: string, errors: AsmLineError[]): SourceItem[] {
  const rawLines = source.split(/\r?\n/);
  const expanded: SourceItem[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const lineNo = i + 1;
    const trimmed = stripComment(line).trim();
    const repeat = /^REPEAT\s+(\d+)\s*\{\s*$/i.exec(trimmed);
    if (!repeat) {
      if (/^\}\s*$/.test(trimmed)) errors.push({ line: lineNo, instruction: trimmed, reason: 'unexpected closing brace outside REPEAT' });
      else expanded.push({ text: trimmed, line: lineNo });
      i += 1;
      continue;
    }

    const count = Number(repeat[1]);
    const block: SourceItem[] = [];
    const openingLine = lineNo;
    i += 1;
    let depth = 1;
    while (i < rawLines.length && depth > 0) {
      const inner = rawLines[i];
      const innerTrimmed = stripComment(inner).trim();
      if (/^REPEAT\s+\d+\s*\{\s*$/i.test(innerTrimmed)) depth += 1;
      else if (/^\}\s*$/.test(innerTrimmed)) {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
      block.push({ text: inner, line: i + 1 });
      i += 1;
    }
    if (depth !== 0) {
      errors.push({ line: openingLine, instruction: trimmed, reason: 'unclosed REPEAT block' });
      continue;
    }
    for (let n = 0; n < count; n += 1) expanded.push(...block);
  }
  return expanded;
}

type ParseOk = { instr: InstrBody | null; error: null };
type ParseFail = { instr: null; error: AsmLineError };
type ParseResult = ParseOk | ParseFail;

function parseLine(
  text: string,
  line: number,
  _contracts: Record<number, Word> | undefined,
  labels: ReadonlyMap<string, number>,
  mode: AssemblyMode,
): ParseResult {
  const body = stripComment(text).trim();
  if (body === '') return { instr: null, error: null };
  const opMatch = /^(\S+)(?:\s+(.*))?$/.exec(body);
  if (!opMatch) return { instr: null, error: null };
  const op = opMatch[1].toUpperCase() as Op;
  const args = opMatch[2] === undefined || opMatch[2].trim() === '' ? [] : opMatch[2].split(',').map((arg) => arg.trim());
  const fail = (reason: string): ParseFail => ({ instr: null, error: { line, instruction: text, reason } });
  const ensureMode = (): ParseFail | null => isLoggedOp(op) && mode !== 'hybrid'
    ? fail(`${op} is a logged instruction; select hybrid mode to assemble it`) : null;
  const readTwoRegs = (): { first: Reg; second: Reg } | ParseFail => {
    if (args.length !== 2) return fail(`${op} needs two register operands`);
    const first = parseReg(args[0]); const second = parseReg(args[1]);
    if (first.error) return fail(first.error);
    if (second.error) return fail(second.error);
    return { first: first.reg as Reg, second: second.reg as Reg };
  };

  try {
    switch (op) {
      case 'ADD': case 'SUB': case 'XOR': case 'MOV': case 'AND': {
        const blocked = ensureMode(); if (blocked) return blocked;
        const regs = readTwoRegs(); if ('error' in regs) return regs;
        return { instr: { op, rd: regs.first, rs: regs.second } as InstrBody, error: null };
      }
      case 'ADDI': case 'SUBI': case 'XORI': {
        if (args.length !== 2) return fail(`${op} needs a register and an immediate`);
        const rd = parseReg(args[0]); const imm = parseImm(args[1]);
        if (rd.error) return fail(rd.error); if (imm.error) return fail(imm.error);
        return { instr: { op, rd: rd.reg as Reg, imm: imm.value } as InstrBody, error: null };
      }
      case 'NOT': case 'NEG': {
        if (args.length !== 1) return fail(`${op} needs one register operand`);
        const rd = parseReg(args[0]); if (rd.error) return fail(rd.error);
        return { instr: { op, rd: rd.reg as Reg } as InstrBody, error: null };
      }
      case 'ROL': case 'ROR': {
        if (args.length !== 2) return fail(`${op} needs a register and an amount`);
        const rd = parseReg(args[0]); const amount = parseRotateAmount(args[1]);
        if (rd.error) return fail(rd.error); if (amount.error) return fail(amount.error);
        return { instr: { op, rd: rd.reg as Reg, amount: amount.amount } as InstrBody, error: null };
      }
      case 'SHL': case 'SHR': {
        const blocked = ensureMode(); if (blocked) return blocked;
        if (args.length !== 2) return fail(`${op} needs a register and an amount`);
        const rd = parseReg(args[0]); const amount = parseShiftAmount(args[1]);
        if (rd.error) return fail(rd.error); if (amount.error) return fail(amount.error);
        return { instr: { op, rd: rd.reg as Reg, amount: amount.amount } as InstrBody, error: null };
      }
      case 'SWAP': {
        const regs = readTwoRegs(); if ('error' in regs) return regs;
        return { instr: { op: 'SWAP', ra: regs.first, rb: regs.second }, error: null };
      }
      case 'EXCH': case 'LOAD': {
        const blocked = ensureMode(); if (blocked) return blocked;
        if (args.length !== 2) return fail(`${op} needs a register and [register]`);
        const rd = parseReg(args[0]); const ra = parseAddress(args[1], op);
        if (rd.error) return fail(rd.error); if (ra.error) return fail(ra.error);
        return op === 'EXCH'
          ? { instr: { op: 'EXCH', rd: rd.reg as Reg, ra: ra.reg as Reg }, error: null }
          : { instr: { op: 'LOAD', rd: rd.reg as Reg, ra: ra.reg as Reg }, error: null };
      }
      case 'STORE': {
        const blocked = ensureMode(); if (blocked) return blocked;
        if (args.length !== 2) return fail('STORE needs [register] and a register');
        const ra = parseAddress(args[0], op); const rs = parseReg(args[1]);
        if (ra.error) return fail(ra.error); if (rs.error) return fail(rs.error);
        return { instr: { op: 'STORE', ra: ra.reg as Reg, rs: rs.reg as Reg }, error: null };
      }
      case 'CADD': case 'CSUB': {
        if (args.length !== 3) return fail(`${op} needs three register operands`);
        const rd = parseReg(args[0]); const rs = parseReg(args[1]); const rc = parseReg(args[2]);
        if (rd.error) return fail(rd.error); if (rs.error) return fail(rs.error); if (rc.error) return fail(rc.error);
        return { instr: { op, rd: rd.reg as Reg, rs: rs.reg as Reg, rc: rc.reg as Reg } as InstrBody, error: null };
      }
      case 'CSWAP': {
        if (args.length !== 3) return fail('CSWAP needs three register operands');
        const ra = parseReg(args[0]); const rb = parseReg(args[1]); const rc = parseReg(args[2]);
        if (ra.error) return fail(ra.error); if (rb.error) return fail(rb.error); if (rc.error) return fail(rc.error);
        return { instr: { op: 'CSWAP', ra: ra.reg as Reg, rb: rb.reg as Reg, rc: rc.reg as Reg }, error: null };
      }
      case 'JNZ': {
        const blocked = ensureMode(); if (blocked) return blocked;
        if (args.length !== 2) return fail('JNZ needs a condition register and a label');
        const rc = parseReg(args[0]); if (rc.error) return fail(rc.error);
        const label = args[1].toLowerCase();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) return fail(`invalid label: ${args[1]}`);
        const target = labels.get(label);
        if (target === undefined) return fail(`unknown label: ${args[1]}`);
        return { instr: { op: 'JNZ', rc: rc.reg as Reg, target, label: args[1] }, error: null };
      }
      default: return fail(`unknown instruction: ${op}`);
    }
  } catch (error) {
    return fail(`parse error: ${String(error)}`);
  }
}
