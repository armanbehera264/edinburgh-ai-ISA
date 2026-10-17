/** "Claude writes the code; the machine proves it."
 *
 * Every program Claude returns is checked here before the app will run it.
 * Register convention (also given to Claude in the prompt):
 *   r1 = x, r2 = y        inputs: must be unchanged at the end
 *   r3 = z                starts at 0, must end holding the answer
 *   r0, r4–r7             scratch: start at 0, must end at 0 (Bennett's trick)
 */

import {
  assemble, newState, runForward, runBackward, statesEqual, cloneState,
  type Instr,
} from '../core/index.js';
import type { ParsedExpr } from './expr.js';

export const X_REG = 1;
export const Y_REG = 2;
export const Z_REG = 3;
export const SCRATCH_REGS = [0, 4, 5, 6, 7];
export const MAX_INSTRUCTIONS = 4000;
export const TEST_COUNT = 20;

export interface Check {
  id: 'legal' | 'correct' | 'clean' | 'reversible';
  label: string;
  ok: boolean;
  detail: string;
}

export interface Verification {
  ok: boolean;
  checks: Check[];
  program: Instr[];
  sourceLines: number[];
  /** Plain-English summary of the first failure, sent back to Claude on retry. */
  feedback: string | null;
}

/** Deterministic test inputs: edge cases first, then a seeded pseudo-random spread. */
export function testInputs(count = TEST_COUNT): [number, number][] {
  const fixed: [number, number][] = [[0, 0], [1, 0], [0, 1], [0xffff, 0xffff], [12345, 678]];
  let seed = 0x2545f491;
  const next = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) & 0xffff;
  };
  const out = fixed.slice(0, count);
  while (out.length < count) out.push([next(), next()]);
  return out;
}

const hex = (v: number) => `0x${v.toString(16).padStart(4, '0')}`;

export function verifyProgram(source: string, expr: ParsedExpr): Verification {
  const asm = assemble(source);
  const checks: Check[] = [];
  const pending = (id: Check['id'], label: string): Check => ({ id, label, ok: false, detail: 'not run' });

  const legal: Check = { id: 'legal', label: 'Only reversible instructions', ok: false, detail: '' };
  if (asm.errors.length > 0) {
    const e = asm.errors[0];
    legal.detail = `line ${e.line}: ${e.instruction.trim()} — ${e.reason}`;
  } else if (asm.program.length === 0) {
    legal.detail = 'the program is empty';
  } else if (asm.program.length > MAX_INSTRUCTIONS) {
    legal.detail = `${asm.program.length} instructions after expanding REPEAT; the limit is ${MAX_INSTRUCTIONS}`;
  } else {
    legal.ok = true;
    legal.detail = `${asm.program.length} instructions, every one with an exact inverse`;
  }
  checks.push(legal);

  if (!legal.ok) {
    checks.push(pending('correct', `Matches the normal answer on ${TEST_COUNT} inputs`));
    checks.push(pending('clean', 'Scratch registers back to 0'));
    checks.push(pending('reversible', 'Runs backwards to the exact start'));
    return {
      ok: false, checks, program: asm.program, sourceLines: asm.sourceLines,
      feedback: `The assembler rejected the program: ${legal.detail}. Every error: ${asm.errors.map((e) => `line ${e.line}: ${e.reason}`).join('; ') || legal.detail}.`,
    };
  }

  const inputs = testInputs();
  let passed = 0;
  let wrong: string | null = null;
  let dirty: string | null = null;
  let irreversible: string | null = null;

  for (const [x, y] of inputs) {
    const start = newState();
    start.regs[X_REG] = x;
    start.regs[Y_REG] = y;
    const s = cloneState(start);
    runForward(s, asm.program);

    const expected = expr.evaluate(x, y);
    if (s.regs[Z_REG] === expected) passed++;
    else wrong ??= `for x=${x}, y=${y} the answer should be z=${expected} (${hex(expected)}) but r3 ended as ${s.regs[Z_REG]} (${hex(s.regs[Z_REG])})`;

    if (!dirty) {
      const leftovers = SCRATCH_REGS.filter((r) => s.regs[r] !== 0).map((r) => `r${r}=${s.regs[r]}`);
      if (s.regs[X_REG] !== x) leftovers.push(`r1 (x) changed from ${x} to ${s.regs[X_REG]}`);
      if (s.regs[Y_REG] !== y) leftovers.push(`r2 (y) changed from ${y} to ${s.regs[Y_REG]}`);
      if (leftovers.length) dirty = `for x=${x}, y=${y}: ${leftovers.join(', ')}`;
    }

    runBackward(s, asm.program);
    if (!irreversible && !statesEqual(s, start)) irreversible = `for x=${x}, y=${y} running backwards did not restore the start`;
  }

  checks.push({
    id: 'correct', label: `Matches the normal answer on ${inputs.length} inputs`, ok: passed === inputs.length,
    detail: passed === inputs.length ? `${passed}/${inputs.length} correct` : `${passed}/${inputs.length} correct — ${wrong}`,
  });
  checks.push({
    id: 'clean', label: 'Scratch registers back to 0', ok: !dirty,
    detail: dirty ? `left behind ${dirty}` : 'r0, r4–r7 all 0; x and y untouched',
  });
  checks.push({
    id: 'reversible', label: 'Runs backwards to the exact start', ok: !irreversible,
    detail: irreversible ?? `all ${inputs.length} runs rewound exactly, with no history`,
  });

  const failed = checks.find((c) => !c.ok);
  return {
    ok: !failed,
    checks,
    program: asm.program,
    sourceLines: asm.sourceLines,
    feedback: failed ? `Verification failed (${failed.label}): ${failed.detail}.` : null,
  };
}
