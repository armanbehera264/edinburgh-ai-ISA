# Flip-16: a reversible instruction-set architecture

## 1. Purpose and scope

Flip-16 is an educational, browser-run emulator for a **logically reversible** 16-bit processor. Its central claim is narrow and testable:

> For every legal instruction executed in a legal machine state, there is exactly one predecessor and exactly one successor state.

Consequently, the emulator can recover an earlier state by executing inverse instructions in reverse program order. It does not store an execution log.

The project is intended to demonstrate three related ideas:

1. An ISA can avoid destructive assignment by using only bijective state transformations.
2. A reversible program can be stepped backwards without a debugger trace.
3. The same constraints appear in reversible Boolean circuits and quantum-oracle construction.

The MVP is a straight-line machine: the program counter advances through a fixed instruction list; conditionals are data-controlled instructions, not branches. This is deliberate. General branches and ordinary halting complicate the reversible control state and are deferred.

This project is **not** a claim that an emulator, FPGA, or ordinary CMOS implementation saves energy. It demonstrates logical reversibility. Physical energy recovery would require specialized adiabatic circuits.

## 2. Chosen design

| Topic | Decision |
|---|---|
| Word size | 16 bits, unsigned modulo \(2^{16}\) arithmetic |
| Registers | Eight general-purpose registers: `r0`–`r7`; none is hard-wired to zero |
| Memory | 65,536 addressable 16-bit words (128 KiB), addressed by a register value |
| Code | Immutable program array; code is not data memory |
| Control flow | Straight-line only in MVP; assembler expands literal `REPEAT` blocks |
| Conditions | A condition is true iff its 16-bit register value is non-zero |
| Reverse execution | UI/API operation: decrement PC, then execute the exact instruction inverse |
| Primary implementation | TypeScript, no backend, static web application |
| Gate model | Optional reversible gate netlist for selected ALU operations, not physical hardware |

All register and memory values are members of `Word = {0, …, 65535}`. Arithmetic is always reduced modulo 65536. For example, `0xffff + 1 = 0x0000`.

### Why eight general registers?

Eight registers make the UI comprehensible, give enough temporaries for a small cipher or Bennett uncomputation demonstration, and keep instruction encoding compact. A fixed zero register was rejected because a register that can never change weakens the simple “every register is ordinary state” story. A zero value is instead supplied at program initialization and restored by uncomputation when needed.

## 3. Formal machine model

At an instruction boundary, the mutable architectural state is:

```ts
type Word = number; // canonicalized to 0..0xffff

type State = {
  regs: Uint16Array; // length 8
  mem: Uint16Array;  // length 65536
  pc: number;        // 0 <= pc <= program.length
};
```

For a program containing `N` instructions, `pc` denotes the **next forward instruction**. Thus `pc = 0` is the entry boundary and `pc = N` is the completed boundary.

Forward execution of instruction `i` is defined only for `0 <= i < N`:

```text
executeForward(program[pc], state)
pc := pc + 1
```

Backward execution is defined only for `0 < pc <= N`:

```text
pc := pc - 1
executeInverse(program[pc], state)
```

`stepForward` at `pc === N` and `stepBackward` at `pc === 0` return a boundary error without modifying state. There is no architectural `HALT` instruction: a conventional halt bit would need its own reversible protocol. A complete finite program is represented by reaching its end boundary.

For every internal transition, the required property is:

```text
stepBackward(stepForward(S, P), P) = S
stepForward(stepBackward(S, P), P) = S
```

The direction selector is an emulator/UI control argument, not an instruction that silently mutates machine state. If a hardware version is made later, direction must be an externally stable control signal or be changed using an explicitly reversible protocol.

### State outside the reversible core

Program loading, initial register/memory initialization, screen drawing, console output, and a user pressing Reset are outside the reversible computation. They interact with the environment and are generally irreversible. The demo must label this boundary clearly: *the pure execution region is reversible; I/O is not.*

## 4. ISA semantics

### 4.1 General rules

- Every update is in-place: its destination is also an input to the transformation.
- `x + y`, `x - y`, negation, and rotate all use 16-bit modular semantics.
- `imm` is a 16-bit bit pattern. Source syntax accepts decimal, hexadecimal (`0x...`), or signed decimal; the assembler reduces it modulo 65536.
- An instruction whose operands violate the legality rules is rejected by the assembler. The emulator also validates decoded programs defensively.
- `INV(op)` in the following table is the operation used by backward execution.

### 4.2 Core instruction table

| Mnemonic | Forward semantics | Exact inverse | Required legality |
|---|---|---|---|
| `ADD rd, rs` | `rd := rd + rs` | `SUB rd, rs` | `rd != rs` |
| `SUB rd, rs` | `rd := rd - rs` | `ADD rd, rs` | `rd != rs` |
| `ADDI rd, imm` | `rd := rd + imm` | `SUBI rd, imm` | none |
| `SUBI rd, imm` | `rd := rd - imm` | `ADDI rd, imm` | none |
| `XOR rd, rs` | `rd := rd XOR rs` | itself | `rd != rs` |
| `NOT rd` | `rd := NOT rd` | itself | none |
| `NEG rd` | `rd := -rd` | itself | none |
| `ROL rd, k` | rotate `rd` left by `k mod 16` | `ROR rd, k` | none |
| `ROR rd, k` | rotate `rd` right by `k mod 16` | `ROL rd, k` | none |
| `SWAP ra, rb` | exchange `ra` and `rb` | itself | `ra != rb` |
| `EXCH rd, [ra]` | exchange `rd` and `mem[regs[ra]]` | itself | `rd != ra` |
| `CADD rd, rs, rc` | if `rc != 0`, `rd := rd + rs` | `CSUB rd, rs, rc` | `rd != rs`, `rd != rc` |
| `CSUB rd, rs, rc` | if `rc != 0`, `rd := rd - rs` | `CADD rd, rs, rc` | `rd != rs`, `rd != rc` |
| `CSWAP ra, rb, rc` | if `rc != 0`, exchange `ra`, `rb` | itself | `ra`, `rb`, and `rc` pairwise distinct |

`rs` may equal `rc` in `CADD`/`CSUB`; the condition and source are read before the update and neither is modified. The stricter rule is only that the destination may not overlap either value being read.

### 4.3 Why each restriction is necessary

`ADD r1, r1` maps `r1` to `2*r1 mod 65536`. Both `0x0000` and `0x8000` map to zero, so it has no unique inverse. The same issue applies to `SUB r1, r1`.

`XOR r1, r1` maps every input to zero. It is destructive and illegal.

`EXCH r1, [r1]` is ambiguous after execution: the register no longer contains the address of the cell that was exchanged. Reversing cannot identify that cell. Requiring distinct data and address registers avoids this problem.

For a controlled operation, the control must not be changed. `CSWAP r1, r2, r1` could change the control while swapping, so the inverse cannot reliably decide whether a swap occurred. Requiring a distinct control register makes the control predicate identical on the forward and reverse path.

An identity operation such as `SWAP r1, r1` is mathematically reversible, but the assembler rejects it because it usually indicates a programming mistake and adds no demonstrable value.

### 4.4 No loads, stores, flags, or assignment

There is no `MOV`, `LOAD`, `STORE`, `AND`, `OR`, shift, compare, or hidden flags register.

- `EXCH` is the only memory transfer; it preserves both the old register value and the old memory value by exchanging them.
- A copy is made reversibly only into known-clean storage: `XOR dst, src` when `dst` is known to be zero. Later, applying the same XOR erases that copy.
- Right/left shifts are represented by `ROR`/`ROL`, which preserve every bit.
- Conditions live in an ordinary, unmodified register. This avoids destructive condition-code flags.

The fact that a value is zero is a **program invariant**, not a free instruction. The UI may display a “known-clean” annotation supplied by the assembler/demo, but the CPU does not infer semantic cleanliness from a raw zero value.

## 5. Memory, aliasing, and program encoding

Memory is `Uint16Array(65536)`. A register’s full 16-bit value selects a word directly, so there are no out-of-range addresses and no address truncation. Memory is initialized by the test harness or demo loader before execution.

The assembler produces a typed immutable representation rather than raw packed binary for the MVP:

```ts
type Reg = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Instr =
  | { op: 'ADD' | 'SUB' | 'XOR' | 'SWAP'; rd: Reg; rs: Reg }
  | { op: 'ADDI' | 'SUBI'; rd: Reg; imm: Word }
  | { op: 'NOT' | 'NEG'; rd: Reg }
  | { op: 'ROL' | 'ROR'; rd: Reg; amount: number }
  | { op: 'EXCH'; rd: Reg; ra: Reg }
  | { op: 'CADD' | 'CSUB'; rd: Reg; rs: Reg; rc: Reg }
  | { op: 'CSWAP'; ra: Reg; rb: Reg; rc: Reg };
```

The UI may render a compact pseudo-binary encoding, but binary format is not an MVP requirement. Designing a real instruction word before the emulator exists creates unnecessary constraints and distracts from the reversibility proof.

If a later FPGA target needs fixed-width encoding, a 32-bit word is sufficient: 5 opcode bits, three 3-bit register fields, a 4-bit rotation amount or 16-bit immediate field, and reserved zeros. The ROM itself must be immutable while a program executes.

## 6. Assembler and source language

The assembler accepts one instruction per line, labels only for display in the MVP, comments beginning with `;` or `//`, and the compile-time macro:

```text
REPEAT <non-negative decimal literal> {
  ...straight-line instructions...
}
```

Nested `REPEAT` is allowed with a maximum expanded program length of 65,535 instructions. The count must be a literal; allowing a runtime register count would create a loop and need reversible loop-entry/exit rules.

Example:

```asm
; Fibonacci state is (r1, r2) = (F(n), F(n+1)).
REPEAT 8 {
  ADD  r2, r1
  SWAP r1, r2
}
```

The assembler performs these checks before producing any runnable program:

1. register spelling/range and immediate syntax;
2. operand aliasing rules in Section 4;
3. rotation normalization to `0..15`;
4. balanced, literal-bounded `REPEAT` blocks;
5. expanded length limit;
6. optional demo contracts, for example “`r5` must begin at zero.”

It reports the source line, the rejected instruction, and the reversibility reason; e.g., “line 12: `XOR r2, r2` erases its input and has no inverse.”

Labels are deliberately not branch targets in the MVP. Permitting labels is useful for readable traces but does not imply a `JMP` instruction.

## 7. Reversing a program

The runtime implementation needs one semantic evaluator and an inverse-opcode mapping:

```ts
const inverse: Record<Instr['op'], Instr['op']> = {
  ADD: 'SUB', SUB: 'ADD', ADDI: 'SUBI', SUBI: 'ADDI',
  XOR: 'XOR', NOT: 'NOT', NEG: 'NEG', ROL: 'ROR', ROR: 'ROL',
  SWAP: 'SWAP', EXCH: 'EXCH', CADD: 'CSUB', CSUB: 'CADD', CSWAP: 'CSWAP',
};
```

`stepBackward` looks up the preceding instruction, replaces its opcode with `inverse[op]`, and passes it to the same evaluator. It does not need a history buffer.

The assembler should also expose a `makeInverseProgram(program)` utility for testing and export:

```text
inverseProgram(P) = reverse(map(invertOpcode, P))
```

Running `inverseProgram(P)` forward from `P`’s final state must yield its initial state. This is mathematically equivalent to stepping the original program backward; it is an important independent test oracle.

## 8. Control-flow roadmap

### MVP: branch-free execution

The PC is always changed by exactly one by the stepping rule. `CADD` and `CSWAP` express bounded if-like computation, and literal unrolling expresses fixed-count loops. This gives a clean PC inverse without recording path history.

### Deferred extension: Janus-style structured control flow

The recommended first extension is structured source syntax rather than raw jumps:

```text
IF condition THEN
  then-block
ELSE
  else-block
FI exit-condition
```

The entry condition selects a path. The exit condition must prove which path was taken, and both condition registers must remain valid as required by the construct. Loops similarly need distinct entry and exit assertions. This retains reversibility but requires static checking and a more complicated PC/control-state design.

### Rejected for the MVP: raw `JMP`/`JNZ`

A conventional conditional branch merges distinct predecessor PCs at a join point. At the join, the inverse machine cannot know which predecessor to revisit without an extra history bit or a structured assertion. Raw branches would make the demo’s core claim less clear and are not worth the implementation risk in an MVP.

## 9. Gate-level model

The gate model is a separate layer below the word-level ISA. It must produce the same values as the abstract evaluator and report resources; it need not simulate analog voltage or energy recovery.

### Primitive reversible gates

| Gate | Transformation | Self-inverse |
|---|---|---|
| `NOT(a)` | `a := a XOR 1` | yes |
| `CNOT(a, b)` | `(a, b) := (a, b XOR a)` | yes |
| `TOFFOLI(a, b, c)` | `(a, b, c) := (a, b, c XOR (a AND b))` | yes |
| `FREDKIN(c, a, b)` | if `c=1`, exchange `a`, `b` | yes |

Toffoli is computationally universal when initialized constant lines are allowed. Constants and fan-out are not free: a clean `0` ancilla is supplied, copied into using CNOT, and restored to `0` when temporary work is uncomputed.

### Required gate mappings

| ISA operation | Gate-level implementation target |
|---|---|
| `XOR rd, rs` | 16 parallel CNOT gates from `rs[i]` to `rd[i]` |
| `NOT rd` | 16 NOT gates |
| `SWAP ra, rb` | three CNOTs per bit (`a^=b; b^=a; a^=b`) or equivalent Fredkin construction |
| `ROL`/`ROR` | renamed/permuted wires; count as zero logical gates |
| `ADD rd, rs` | 16-bit in-place reversible ripple-carry adder, using a Cuccaro-style MAJ/UMA network |
| `CADD` | controlled reversible adder; control is never changed, and all temporary carries/ancillas are cleared |

The gate simulator must track:

```ts
type GateStats = {
  not: number;
  cnot: number;
  toffoli: number;
  fredkin: number;
  ancillaAllocated: number;
  ancillaDirtyAtEnd: number;
};
```

`ancillaDirtyAtEnd` must be zero after every completed ALU instruction. The UI should show “garbage ancillas: 0” in green when the invariant holds. A non-zero result is a correctness failure, not merely a performance warning.

### Adder choice

Use a ripple-carry Cuccaro-style adder for the first gate netlist. It has linear gate count and simple, explainable carry propagation. It is slower than a carry-lookahead design, but its regular MAJ/UMA pattern is easier to verify and visualize.

Carry-lookahead and Fourier/quantum adders are rejected for the MVP: they may reduce depth under particular gate models, but add substantial ancilla management and obscure the instructional point. At the word-level ISA, `ADD` remains a single reversible transformation regardless of its selected circuit implementation.

## 10. Bennett uncomputation protocol

Reversibility does not allow arbitrary temporary values to disappear. To calculate a useful irreversible-looking function while returning workspace to zero:

1. Start result and scratch registers in known-clean states.
2. Compute a reversible transformation, leaving the desired output and some scratch values.
3. Reversibly copy the desired output into a separate clean output register or output buffer.
4. Run the computing region backward.
5. Scratch registers return to their original values, while the copied output remains.

The copy only works because the output destination started at zero, for example `XOR output, result`. The final output is intentionally retained; it is the information not being erased. The demo should visibly show scratch registers becoming zero during the reverse phase.

## 11. UI specification

The interface is a single-page app with no server. It has these panes:

1. **Program pane** — source and expanded instructions; the instruction at `pc` is highlighted.
2. **State pane** — all eight registers in hexadecimal and decimal, memory watch addresses, and the PC boundary (`0..N`).
3. **Timeline controls** — Reset, Step forward, Step backward, Run forward, Run backward, and a slider limited to the valid `0..N` boundaries. Scrubbing may repeatedly call step functions; it must not restore snapshots as its primary mechanism.
4. **Reversibility pane** — selected instruction, inverse instruction, validation status, and log-memory comparison.
5. **Circuit pane** — optional wire/gate view, per-operation gate counts, and ancilla cleanliness.
6. **Energy pane** — clearly labelled theoretical lower-bound comparison only.

The UI stores a single current machine state plus the immutable program. It may cache rendered views for performance, but a cache is not used to make reverse execution work.

### Trace rows

Each displayed trace row records presentation data only: instruction index, instruction text, before/after register diff, and inverse mnemonic. It must be possible to disable trace-row retention and still reverse the computation. This visibly distinguishes the machine’s reversibility from a conventional time-travel debugger.

## 12. Conventional baseline and energy display

Implement an optional comparison model, not a competing CPU:

- The reversible execution uses no undo log.
- The baseline performs the analogous destructive assignments and appends old destination values to an undo log.
- For fair presentation, show exact bytes retained in the baseline log for the same demo, and zero trace-log bytes in Flip-16.

The energy indicator is educational only:

```text
minimum erased-bit energy = erasedBits × k × T × ln(2)
```

At 300 K, `kT ln 2` is approximately `2.87 × 10^-21 J` per erased bit. The display uses 300 K by default, lets the user change `T`, and labels the result **Landauer lower bound, not measured device energy**. Real ordinary chips dissipate vastly more due to switching, leakage, interconnect, clocks, and other losses.

Do not display literal “0 J” for the reversible machine. Display “0 intentionally erased architectural bits in this model”; physical gate operation is not energy-free.

## 13. Demonstration programs

### 13.1 Fibonacci recurrence

Initial state: `r1 = F(n)`, `r2 = F(n+1)`. One iteration is:

```asm
ADD  r2, r1
SWAP r1, r2
```

The pair becomes `(F(n+1), F(n+2))`. Reversing one step first swaps, then subtracts, restoring the previous pair. The demo is compact and understandable without cryptography.

### 13.2 ARX cipher-round demonstration

Build a clearly labelled toy Speck-style ARX round using `ADD`, `ROR`, `ROL`, and `XOR`. It should not be presented as production cryptography or use an unreviewed cipher as security software. Its purpose is to show that the inverse program is automatically derived: encryption forward and decryption backward use the same instruction listing plus the direction control.

Use a test vector committed with the source. Verify forward then backward returns the exact key, plaintext/state words, and PC boundary.

### 13.3 EXCH memory demonstration

Initialize `r3 = 0x0042`, `r4 = 0x0010`, and `mem[0x0010] = 0xabcd`:

```asm
EXCH r3, [r4]
```

Afterward, `r3 = 0xabcd` and `mem[0x0010] = 0x0042`. Repeating the instruction restores both. This is the clearest proof that “load/store” has been replaced by exchange rather than overwritten memory.

### 13.4 Bennett uncomputation

Use two input registers, a clean scratch register, and a clean output register. Compute a simple reversible intermediate into scratch, XOR it into output, then step the compute region backward. The final state must show input unchanged, scratch zero, and output populated.

### 13.5 Failure demonstration

The assembler editor includes rejected examples:

```asm
ADD r1, r1     ; rejected: modular doubling is not one-to-one
XOR r2, r2     ; rejected: destroys r2
EXCH r3, [r3]  ; rejected: address is overwritten by exchange
CSWAP r1, r2, r1 ; rejected: control is modified
```

Showing these failures prevents the project from appearing to rely on a vague definition of “reversible.”

## 14. Verification plan

### Unit tests

- Test every opcode on boundary values: `0`, `1`, `0x7fff`, `0x8000`, and `0xffff`.
- Test rotate amounts `0`, `1`, `15`, `16`, and larger values normalized modulo 16.
- Test `EXCH` at addresses `0x0000` and `0xffff`.
- Verify every rejected operand-overlap case produces a readable diagnostic.
- Verify self-inverse operations applied twice restore state.

### Property tests

Generate legal random instructions, states, and straight-line programs. Clone state including the full memory array before mutation. For each trial, require:

```text
backward(forward(S, P), P) == S
forward(backward(T, P), P) == T
forward(inverseProgram(P), forward(P, S)) == S
```

The first two comparisons include every register, every memory word, and PC. At least 10,000 random single-instruction cases and 1,000 random multi-instruction programs should run in CI.

### Gate-model tests

- Exhaustively test the reversible adder for all 8-bit inputs first (65,536 pairs), then sample at least 100,000 random 16-bit pairs.
- Compare its result against `(a + b) & 0xffff`.
- Assert that preserved operand lines are preserved as specified.
- Assert all ancillas are zero after the gate sequence and after its inverse.
- Compare each implemented gate-level ISA operation to the word-level evaluator.

## 15. Architecture alternatives considered

| Alternative | Decision | Reason |
|---|---|---|
| Conventional CPU plus undo log | Baseline only | Easy to implement, but storage grows with execution and the CPU itself remains destructive. Useful for a visual comparison. |
| Inherently reversible ISA | Chosen core | Provides exact inverse execution without an execution log and directly expresses the project’s thesis. |
| Hybrid reversible core plus Bennett uncomputation | Included as a demo pattern | Necessary for practical cleanup of scratch state, but it is a programming technique rather than the basic ISA. |
| Pre-build an inverse program | Include as export/test utility | Elegant and useful for tests, but the UI is clearer when it uses one listing and a backward step function. |
| PC direction bit inside mutable state | Rejected for MVP | Toggling it must itself be made reversible. Keeping direction as stable execution control avoids hiding an irreversible action. |
| Raw jumps/branches | Deferred | They merge control-flow history; structured reversible control needs extra proof conditions. |
| Janus-style structured control | Future extension | A principled answer for dynamic control flow once the straight-line model is solid. |
| Fixed zero register | Rejected | Simpler copying syntax, but muddles the model by adding exceptional non-mutable state. |
| Load/store memory | Rejected | A store destroys the old memory cell and a load destroys or duplicates information unless additional state is carried. `EXCH` is sufficient and demonstrative. |
| 32- or 64-bit words | Rejected for MVP | More realistic, but 16-bit visualization and exhaustive reduced-width tests are better for a first implementation. |
| FPGA implementation | Deferred | An FPGA proves logic behavior but not adiabatic energy recovery; it adds toolchain risk without strengthening the central demo. |
| Physical adiabatic hardware | Explain only | It is a real research direction but outside hackathon/MVP scope. |
| Carry-lookahead reversible adder | Rejected for first netlist | Potentially lower depth but materially harder ancilla management and visualization. |

## 16. Limitations and honest claims

- Logical reversibility does not mean zero real-world power consumption.
- A reversible core cannot erase unwanted intermediate information; it must preserve or uncompute it.
- Uncomputation often roughly doubles the work of a compute region, and clean temporary storage is valuable.
- I/O, reset, initialization, and observation create an irreversible boundary unless modeled with a larger environment.
- Straight-line control is intentionally restrictive. General-purpose software needs structured reversible control, additional state, or a conventional irreversible shell.
- “Same program decrypts backwards” applies to a reversible ARX transformation, not automatically to every encryption scheme or complete protocol.
- Flip-16 is not intended to outperform x86/ARM on current commodity silicon. Its immediate strengths are reversible-debugging pedagogy, rollback-style computation, and correspondence with reversible/quantum circuit construction.

## 17. Delivery plan

1. Build `Word` helpers, the typed instruction model, instruction validator, and forward/inverse evaluator.
2. Add property tests before UI work; do not proceed with an instruction that lacks an inverse test.
3. Implement parser, literal `REPEAT` expansion, diagnostics, and the Fibonacci/EXCH demos.
4. Build the browser state/timeline UI and demonstrate reverse execution with trace retention disabled.
5. Add baseline logging comparison and the carefully labelled Landauer display.
6. Implement and test the gate netlist for XOR, NOT, SWAP, rotate wiring, then the 16-bit adder.
7. Add the toy ARX and Bennett demos, record a fallback demo video, and prepare the pitch.

## 18. Acceptance criteria

The MVP is complete when all of the following are true:

- The assembler rejects every illegal overlap case described in this document.
- Every supported instruction has a tested exact inverse.
- A program can run from `pc = 0` to `pc = N` and return to a byte-for-byte identical state at `pc = 0` without using a history log.
- The UI makes PC boundary semantics and inverse instruction selection visible.
- `EXCH`, Fibonacci, toy ARX, and Bennett uncomputation demos run deterministically from documented initial states.
- The conventional comparison reports its undo-log size separately from presentation traces.
- The gate-level adder agrees with word-level modular addition and returns every ancilla to zero.
- All energy wording distinguishes logical reversibility, Landauer’s theoretical limit, and real hardware dissipation.

