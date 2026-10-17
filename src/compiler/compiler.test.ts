import { describe, expect, it } from 'vitest';
import { parseExpression } from './expr.js';
import { verifyProgram } from './verify.js';
import { extractAssembly } from './prompt.js';

describe('expression reference', () => {
  it('evaluates with 16-bit wrapping and normal precedence', () => {
    const e = parseExpression('z = x*2 + y');
    expect(e.text).toBe('z = x * 2 + y');
    expect(e.evaluate(3, 4)).toBe(10);
    expect(e.evaluate(0xffff, 0)).toBe(0xfffe);
    expect(parseExpression('(x + y) * 5 - 3').evaluate(1, 1)).toBe(7);
    expect(parseExpression('x ^ (y + 7)').evaluate(1, 0)).toBe(6);
    expect(parseExpression('-x').evaluate(1, 0)).toBe(0xffff);
  });

  it('rejects things that are not formulas', () => {
    expect(() => parseExpression('z = x + ')).toThrow();
    expect(() => parseExpression('rm -rf /')).toThrow();
  });
});

describe('verifier', () => {
  const expr = parseExpression('z = x*2 + y');

  it('accepts a correct reversible program', () => {
    const v = verifyProgram('ADD r3, r1\nADD r3, r1\nADD r3, r2', expr);
    expect(v.ok).toBe(true);
    expect(v.checks.every((c) => c.ok)).toBe(true);
  });

  it('accepts Bennett-style scratch use when the scratch is uncomputed', () => {
    const v = verifyProgram(
      ['ADD r4, r1', 'ADD r4, r1', 'ADD r3, r4', 'ADD r3, r2', 'SUB r4, r1', 'SUB r4, r1'].join('\n'),
      expr,
    );
    expect(v.ok).toBe(true);
  });

  it('catches wrong answers with a concrete counterexample', () => {
    const v = verifyProgram('ADD r3, r1\nADD r3, r2', expr);
    expect(v.ok).toBe(false);
    expect(v.feedback).toMatch(/should be z=/);
  });

  it('catches scratch registers left dirty', () => {
    const v = verifyProgram('ADD r4, r1\nADD r4, r1\nADD r3, r4\nADD r3, r2', expr);
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === 'clean')?.ok).toBe(false);
  });

  it('rejects illegal instructions before running anything', () => {
    const v = verifyProgram('MOV r3, r1', expr);
    expect(v.ok).toBe(false);
    expect(v.checks[0].ok).toBe(false);
  });

  it('pulls the program out of a fenced reply', () => {
    expect(extractAssembly('Here:\n```asm\nADD r3, r1\n```\n')).toBe('ADD r3, r1');
  });
});
