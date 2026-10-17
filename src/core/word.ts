/** A 16-bit unsigned word: a member of {0, ..., 65535}. Arithmetic is
 * always reduced modulo 2^16. */
export type Word = number;

/** Maximum word value (2^16 - 1). */
export const MAX_WORD = 0xffff;

/** Reduce any integer to a canonical 16-bit word modulo 65536. */
export function toWord(x: number): Word {
  return ((x % 0x10000) + 0x10000) % 0x10000;
}

/** Add two words modulo 65536. */
export function add(a: Word, b: Word): Word {
  return toWord(a + b);
}

/** Subtract two words modulo 65536. */
export function sub(a: Word, b: Word): Word {
  return toWord(a - b);
}

/** Negate a word modulo 65536 (two's complement). */
export function neg(a: Word): Word {
  return toWord(-a);
}

/** Bitwise NOT of a 16-bit word. */
export function bitNot(a: Word): Word {
  return (~a) & 0xffff;
}

/** Rotate a 16-bit word left by k mod 16 bits. */
export function rol(a: Word, k: number): Word {
  const r = k & 15;
  if (r === 0) return a;
  return toWord((a << r) | (a >>> (16 - r)));
}

/** Rotate a 16-bit word right by k mod 16 bits. */
export function ror(a: Word, k: number): Word {
  const r = k & 15;
  if (r === 0) return a;
  return toWord((a >>> r) | (a << (16 - r)));
}

/** Test whether a value is a canonical word. */
export function isWord(x: unknown): x is Word {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= MAX_WORD;
}
