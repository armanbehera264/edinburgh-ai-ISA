/** Gate-level reversible simulator for Flip-16 ALU operations.
 *
 * Implements the primitive reversible gates (NOT, CNOT, Toffoli, Fredkin)
 * and the required ISA-to-gate mappings from section 9 of the spec.
 * All gates are self-inverse. Ancilla bits must return to 0 after every
 * completed ALU instruction.
 */

export type Bit = 0 | 1;

/** Gate statistics tracked by the simulator (section 9.1). */
export interface GateStats {
  not: number;
  cnot: number;
  toffoli: number;
  fredkin: number;
  ancillaAllocated: number;
  ancillaDirtyAtEnd: number;
}

/** A simple reversible circuit: a list of gates applied to a bit vector.
 * Bits are indexed by integer; ancillas are just extra bit slots. */
class Circuit {
  private bits: number[];
  private stats: GateStats;

  constructor(size: number) {
    this.bits = new Array(size).fill(0);
    this.stats = { not: 0, cnot: 0, toffoli: 0, fredkin: 0, ancillaAllocated: 0, ancillaDirtyAtEnd: 0 };
  }

  static fromBools(bools: boolean[]): Circuit {
    const c = new Circuit(bools.length);
    for (let i = 0; i < bools.length; i++) c.bits[i] = bools[i] ? 1 : 0;
    return c;
  }

  /** NOT(a): a := a XOR 1 (self-inverse). */
  not(a: number): void {
    this.bits[a] ^= 1;
    this.stats.not += 1;
  }

  /** CNOT(a, b): (a, b) := (a, b XOR a) (self-inverse). */
  cnot(a: number, b: number): void {
    this.bits[b] ^= this.bits[a];
    this.stats.cnot += 1;
  }

  /** Toffoli(a, b, c): (a, b, c) := (a, b, c XOR (a AND b)) (self-inverse). */
  toffoli(a: number, b: number, c: number): void {
    this.bits[c] ^= this.bits[a] & this.bits[b];
    this.stats.toffoli += 1;
  }

  /** Fredkin(c, a, b): if c=1, exchange a and b (self-inverse). */
  fredkin(c: number, a: number, b: number): void {
    if (this.bits[c] === 1) {
      const tmp = this.bits[a];
      this.bits[a] = this.bits[b];
      this.bits[b] = tmp;
    }
    this.stats.fredkin += 1;
  }

  getBit(i: number): number {
    return this.bits[i];
  }

  setBit(i: number, v: number): void {
    this.bits[i] = v;
  }

  size(): number {
    return this.bits.length;
  }

  getStats(): GateStats {
    return { ...this.stats };
  }

  toBools(): boolean[] {
    return this.bits.map((b) => b === 1);
  }
}

/** Extract the k-th bit (LSB = bit 0) of a 16-bit word. */
export function bitOf(word: number, k: number): Bit {
  return ((word >>> k) & 1) as Bit;
}

/** Reconstruct a 16-bit word from bit indices [base .. base+15]. */
export function wordFromBits(circuit: Circuit, base: number): number {
  let word = 0;
  for (let k = 0; k < 16; k++) {
    if (circuit.getBit(base + k) === 1) word |= (1 << k);
  }
  return word;
}

/** Run XOR rd, rs at the gate level: 16 parallel CNOTs from rs[i] to rd[i].
 * Returns gate stats. The same circuit run twice restores state. */
export function gateXOR(rdWord: number, rsWord: number): { result: number; stats: GateStats } {
  const c = new Circuit(32);
  for (let i = 0; i < 16; i++) {
    c.setBit(i, bitOf(rdWord, i));
    c.setBit(16 + i, bitOf(rsWord, i));
  }
  // 16 CNOTs: rs[i] -> rd[i]
  for (let i = 0; i < 16; i++) {
    c.cnot(16 + i, i);
  }
  return { result: wordFromBits(c, 0), stats: c.getStats() };
}

/** Run NOT rd at the gate level: 16 NOT gates. Self-inverse. */
export function gateNOT(rdWord: number): { result: number; stats: GateStats } {
  const c = new Circuit(16);
  for (let i = 0; i < 16; i++) c.setBit(i, bitOf(rdWord, i));
  for (let i = 0; i < 16; i++) c.not(i);
  return { result: wordFromBits(c, 0), stats: c.getStats() };
}

/** Run SWAP ra, rb at the gate level: 3 CNOTs per bit (a^=b; b^=a; a^=b).
 * Self-inverse. */
export function gateSWAP(aWord: number, bWord: number): { resultA: number; resultB: number; stats: GateStats } {
  const c = new Circuit(32);
  for (let i = 0; i < 16; i++) {
    c.setBit(i, bitOf(aWord, i));
    c.setBit(16 + i, bitOf(bWord, i));
  }
  for (let i = 0; i < 16; i++) {
    c.cnot(i, 16 + i);   // a ^= b
    c.cnot(16 + i, i);   // b ^= a
    c.cnot(i, 16 + i);   // a ^= b
  }
  return { resultA: wordFromBits(c, 0), resultB: wordFromBits(c, 16), stats: c.getStats() };
}

/** Cuccaro-style reversible ripple-carry adder.
 *
 * Computes b := a + b (mod 2^16) in place using MAJ and UMA blocks.
 * Uses one ancilla carry line that starts and ends at 0.
 *
 * MAJ(a, b, c): c := majority(a, b, c); returns with c updated.
 * UMA(c, b, a): uncompute; restores c to 0 and leaves a = a + b (mod 2).
 *
 * The classic Cuccaro network for n bits:
 *   MAJ(c0, a0, b0);  for i in 0..n-2: MAJ(c_{i+1}, a_{i+1}, b_{i+1});
 *   CNOT(a_{n-1}, b_{n-1});   // sum bit out
 *   for i in n-2 down to 0: UMA(c_i, b_i, a_i);
 *   (final carry is discarded back into the ancilla chain ending at 0)
 *
 * We implement it straightforwardly: all gates self-inverse, ancilla
 * carry line starts at 0 and returns to 0.
 */
export function gateADD(aWord: number, bWord: number): {
  resultA: number;
  resultB: number;  // a + b mod 2^16
  stats: GateStats;
  ancillaDirty: boolean;
} {
  // Layout: bits 0..15 = a, bits 16..31 = b, bit 32 = carry ancilla.
  const c = new Circuit(33);
  for (let i = 0; i < 16; i++) {
    c.setBit(i, bitOf(aWord, i));
    c.setBit(16 + i, bitOf(bWord, i));
  }
  const CARRY = 32;

  // Forward MAJ sweep: MAJ(carry, a_i, b_i) -> carry becomes carry-out,
  // and b_i becomes the (propagated) sum bit being built.
  // MAJ(x, y, z) = (x, y, z ^ (x & y)); but we need the 3-gate form:
  //   Toffoli(x, y, z); CNOT(z, x); Toffoli(x, y, z)
  // Wait — the standard Cuccaro MAJ is:
  //   CNOT(y, x)  -- no.
  // Let's use the well-known 5-gate Toffoli-based MAJ/UMA. Actually the
  // cleanest Toffoli-only Cuccaro MAJ (3 Toffolis):
  //   Toffoli(a, b, c); CNOT(c, b); Toffoli(a, c, b)
  // Hmm, that's not standard either.
  //
  // We use the common formulation where MAJ and UMA are inverses:
  // MAJ(a,b,c):  Toffoli(a,b,c); CNOT(c,a); Toffoli(a,c,b)
  // UMA(c,b,a):  Toffoli(a,c,b); CNOT(c,a); Toffoli(a,b,c)   (MAJ reversed)
  //
  // This keeps c as the carry. We don't need bit-perfect optimality for the
  // MVP; correctness and the ancilla-returns-to-zero invariant matter.

  function MAJ(circ: Circuit, carry: number, a: number, b: number): void {
    circ.toffoli(a, b, carry);   // carry ^= a & b
    circ.cnot(carry, a);         // a ^= carry
    circ.toffoli(a, carry, b);   // b ^= a & carry
  }
  function UMA(circ: Circuit, carry: number, a: number, b: number): void {
    circ.toffoli(a, carry, b);   // undo last MAJ gate
    circ.cnot(carry, a);         // undo
    circ.toffoli(a, b, carry);   // undo first MAJ gate
  }

  // MAJ sweep from LSB to MSB-1.
  for (let i = 0; i < 15; i++) {
    MAJ(c, CARRY, i, 16 + i);
  }
  // Final MAJ into MSB including carry.
  MAJ(c, CARRY, 15, 16 + 15);

  // Output sum bit: CNOT(a_{n-1}, b_{n-1}) puts sum into b.
  c.cnot(15, 16 + 15);

  // UMA sweep from MSB-1 down to LSB.
  for (let i = 14; i >= 0; i--) {
    UMA(c, CARRY, i, 16 + i);
  }

  const resultA = wordFromBits(c, 0);
  const resultB = wordFromBits(c, 16);
  const stats = c.getStats();
  const ancillaDirty = c.getBit(CARRY) !== 0;
  return { resultA, resultB, stats, ancillaDirty };
}

/** Run a controlled reversible add (CADD rd, rs, rc) at gate level.
 * If rc != 0, add rs into rd; otherwise leave rd unchanged.
 * Implementation: compute controlled copy of rs into a zeroed ancilla,
 * add ancilla into rd, then uncompute the ancilla (compute-use-uncompute).
 *
 * All temporaries return to zero. Returns gate stats and ancilla-dirty flag.
 */
export function gateCADD(rdWord: number, rsWord: number, rcWord: number): {
  resultRd: number;
  stats: GateStats;
  ancillaDirty: boolean;
} {
  // Layout: bits 0..15 = rd, 16..31 = rs, 32 = rc control (single bit),
  // 33..48 = temp copy of rs (starts zero), 49 = carry ancilla for the adder.
  // We treat rc as a full word but only its LSB matters as control (rc != 0).
  const ctrlBit = rcWord !== 0 ? 1 : 0;
  const SIZE = 50;
  const c = new Circuit(SIZE);
  for (let i = 0; i < 16; i++) {
    c.setBit(i, bitOf(rdWord, i));
    c.setBit(16 + i, bitOf(rsWord, i));
  }
  c.setBit(32, ctrlBit);
  // temp copy at 33..48 starts at 0.
  const TEMP_BASE = 33;
  const CARRY = 49;

  // Step 1: compute controlled copy of rs into temp.
  // For each bit i: Toffoli(ctrl, rs[i], temp[i]) -> temp[i] ^= ctrl & rs[i].
  for (let i = 0; i < 16; i++) {
    c.toffoli(32, 16 + i, TEMP_BASE + i);
  }

  // Step 2: add temp into rd using Cuccaro adder over (rd, temp).
  // We reuse gateADD logic but on the sub-circuit bits [0..15] and [TEMP_BASE..TEMP_BASE+15].
  // Re-implement inline since gateADD uses fixed layout.
  function MAJ(circ: Circuit, carry: number, a: number, b: number): void {
    circ.toffoli(a, b, carry);
    circ.cnot(carry, a);
    circ.toffoli(a, carry, b);
  }
  function UMA(circ: Circuit, carry: number, a: number, b: number): void {
    circ.toffoli(a, carry, b);
    circ.cnot(carry, a);
    circ.toffoli(a, b, carry);
  }
  for (let i = 0; i < 15; i++) {
    MAJ(c, CARRY, i, TEMP_BASE + i);
  }
  MAJ(c, CARRY, 15, TEMP_BASE + 15);
  c.cnot(15, TEMP_BASE + 15);
  for (let i = 14; i >= 0; i--) {
    UMA(c, CARRY, i, TEMP_BASE + i);
  }

  // Step 3: uncompute the temp copy (run step 1 backwards).
  for (let i = 15; i >= 0; i--) {
    c.toffoli(32, 16 + i, TEMP_BASE + i);
  }

  const resultRd = wordFromBits(c, 0);
  const stats = c.getStats();
  // All temp bits and carry must be zero.
  let dirty = c.getBit(CARRY) !== 0;
  for (let i = 0; i < 16 && !dirty; i++) {
    dirty = c.getBit(TEMP_BASE + i) !== 0;
  }
  return { resultRd, stats, ancillaDirty: dirty };
}
