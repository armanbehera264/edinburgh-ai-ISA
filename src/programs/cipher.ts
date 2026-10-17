import { newState, type State } from '../core/index.js';

/** The message lives entirely in the 8 registers: two characters per register. */
export const MESSAGE_LENGTH = 16;
export const ROUNDS = 4;
const ROTATE = 5;
const KEYS = [0x9e37, 0x79b9, 0x7f4a, 0x7c15, 0xf39c, 0xc0b5, 0x2d6e, 0x5a3c];

/** Add-rotate-xor rounds that chain every register into the next, so one
 * letter ends up influencing all sixteen. Every line has an exact inverse. */
export const CIPHER_SOURCE = [
  '# Secret-message cipher: add, rotate, xor.',
  '# The message lives in r0–r7, two letters each.',
  `REPEAT ${ROUNDS} {`,
  ...KEYS.flatMap((key, i) => {
    const next = (i + 1) % 8;
    return [
      `  XORI r${i}, 0x${key.toString(16)}`,
      `  ROL  r${i}, ${ROTATE}`,
      `  ADD  r${next}, r${i}`,
    ];
  }),
  '}',
].join('\n');

export function sanitizeMessage(text: string): string {
  return Array.from(text)
    .map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126 ? ch : '?'))
    .join('')
    .slice(0, MESSAGE_LENGTH);
}

/** Write a message straight into the registers (padded with spaces). */
export function encodeMessage(text: string, into: State = newState()): State {
  const padded = sanitizeMessage(text).padEnd(MESSAGE_LENGTH, ' ');
  for (let r = 0; r < 8; r++) {
    into.regs[r] = (padded.charCodeAt(2 * r) << 8) | padded.charCodeAt(2 * r + 1);
  }
  return into;
}

/** The 16 raw bytes held in the registers, in message order. */
export function registerBytes(regs: Uint16Array): number[] {
  const out: number[] = [];
  for (let r = 0; r < 8; r++) out.push(regs[r] >> 8, regs[r] & 0xff);
  return out;
}

/** Read the registers back as text (trailing padding trimmed). */
export function decodeMessage(regs: Uint16Array): string {
  return String.fromCharCode(...registerBytes(regs)).replace(/ +$/, '');
}

export function isPrintable(byte: number): boolean {
  return byte >= 32 && byte <= 126;
}

// Bytes that aren't printable get a stable stand-in glyph so scrambled
// tiles always show something, and the same byte always looks the same.
const GLYPHS = 'ΔΣΨΩλξπφЖЯЭФБДЛЮ§¶†‡¤¥£€∆∑∏√∞≈≠±÷×ØøÆæßðþıłœŋ◊◆◇○●□■▲△▼▽◐◑◒◓★☆♠♣♥♦';

export function glyphFor(byte: number): string {
  return isPrintable(byte) ? String.fromCharCode(byte) : GLYPHS[byte % GLYPHS.length];
}
