/** Maximum word value (2^16 - 1). */
export const MAX_WORD = 0xffff;
/** Reduce any integer to a canonical 16-bit word modulo 65536. */
export function toWord(x) {
    return ((x % 0x10000) + 0x10000) % 0x10000;
}
/** Add two words modulo 65536. */
export function add(a, b) {
    return toWord(a + b);
}
/** Subtract two words modulo 65536. */
export function sub(a, b) {
    return toWord(a - b);
}
/** Negate a word modulo 65536 (two's complement). */
export function neg(a) {
    return toWord(-a);
}
/** Bitwise NOT of a 16-bit word. */
export function bitNot(a) {
    return (~a) & 0xffff;
}
/** Rotate a 16-bit word left by k mod 16 bits. */
export function rol(a, k) {
    const r = k & 15;
    if (r === 0)
        return a;
    return toWord((a << r) | (a >>> (16 - r)));
}
/** Rotate a 16-bit word right by k mod 16 bits. */
export function ror(a, k) {
    const r = k & 15;
    if (r === 0)
        return a;
    return toWord((a >>> r) | (a << (16 - r)));
}
/** Test whether a value is a canonical word. */
export function isWord(x) {
    return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= MAX_WORD;
}
//# sourceMappingURL=word.js.map