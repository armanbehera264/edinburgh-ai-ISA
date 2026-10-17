# TENET: a computer that runs in reverse

> **Flip the Script (EdinburghAI hackathon, 17 Oct 2026)**
>
> **The assumption:** a computer only moves forwards. Every step overwrites and destroys old values, so there is no way back.
>
> **The flip:** every TENET instruction has an exact opposite. Nothing is ever destroyed, so any program can run backwards to its exact starting state, with **zero saved history**.

Type a message, run the program forward and it scrambles. Drag the timeline back and the message comes back exactly. There is no decryption routine and no undo log: the machine executes each instruction's inverse using only its current registers and the program.

Next to it, an ordinary CPU runs the same program. It overwrites registers (the bits-destroyed counter climbs) and when you try to rewind, it is stuck.

**Why it matters:** physics puts a minimum energy cost on destroying information (Landauer's principle). A computer that never destroys anything is the route to near-zero-energy chips, and quantum computers already work this way.

## Run it

```bash
npm install
npm run dev      # http://127.0.0.1:5188
npm test         # 23 tests: random instructions and programs all rewind exactly
npm run build    # production build into dist/
```

- **Demo:** the message scrambler, with TENET and an ordinary CPU side by side on a 3D circuit board (drag to rotate, scroll to zoom; "Flat" switches to the 2D chip view).
- **Playground:** write or pick any program and run it backwards. Switch to *Ordinary instructions (with undo log)* to see exactly how many bytes of history a normal instruction set needs to rewind, compared with 0 B for reversible instructions.
- Keys: `space` play, `←/→` step, `shift+←` rewind, `I` look inside, `L` limits.

## Tech stack

- **TypeScript virtual machine** (`src/core`): the FLIP-16 ISA described below. Strict mode is fully reversible; hybrid mode adds ordinary instructions undone from an exact-byte undo log. Tested with **Vitest**.
- **React + Motion**: interface and spring animations. **SVG** for the flat chip view.
- **three.js via React Three Fiber + Drei**: the 3D circuit board (per-bit LEDs, trace pulses, heat sink and sparks on the ordinary CPU). Lazy-loaded; runs at 60 fps on a laptop.
- **Vite** to build. Everything runs in the browser; there is no server.

## Limits

- This is a simulation on an ordinary laptop. It shows *logical* reversibility; the energy saving would need reversible (adiabatic) hardware.
- The ordinary CPU is a model: the same program, charged 16 bits destroyed per register overwrite. Its heat gauge is illustrative, not a power measurement.
- The message scrambler is a toy, not real encryption. Reversible programs use fixed-count loops (`REPEAT n`); data-dependent loops need hybrid mode and its undo log.

## AI disclosure

We used Claude Code (Anthropic) as a coding assistant while building this.

---

# The FLIP-16 instruction set

Flip-16 is a 16-bit teaching processor that can run backward.

Its central idea is simple: whenever an instruction keeps enough information to undo itself, Flip-16 reverses it with **no history log at all**. When a normal, destructive instruction is more useful, the proposed hybrid extension records only the information that instruction destroyed and uses that small record to undo it later.

That gives Flip-16 two complementary paths:

| Path | Example | Undo cost |
|---|---|---|
| Reversible fast path | `ADD r1, r2`, `XOR r3, r4`, `SWAP r1, r2` | No undo-log storage |
| Logged escape hatch | `MOV r1, r2`, `STORE [r3], r4`, `SHR r5, 3` | Stores the overwritten or discarded information |

This is not a claim that a browser emulator or ordinary CPU consumes no power. Flip-16 demonstrates **logical reversibility**, reversible debugging, and the concrete trade-off between preserving information and recording it.

## What is implemented now

The browser emulator implements the strict reversible core and the first hybrid logged instruction set:

- Eight 16-bit general-purpose registers, `r0` through `r7`
- 65,536 words of 16-bit memory
- Forward and backward stepping without an execution history log
- `ADD`, `SUB`, `ADDI`, `SUBI`, `XOR`, `NOT`, `NEG`, `ROL`, `ROR`, `SWAP`, `EXCH`, `CADD`, `CSUB`, and `CSWAP`
- A source editor, compiler diagnostics, demo selector, execution-line highlight, register-change highlight, and timeline scrubber
- The Fibonacci, Copy-and-uncompute, hybrid memory, and reverse-branch demos
- A bounded 64 KiB undo log, assembly-mode selector, labels, and reverse branch tracing
- Hybrid `MOV`, `LOAD`, `STORE`, `SHR`, `SHL`, `AND`, and `JNZ`

The strict core remains the zero-log reference path; hybrid mode is an explicit opt-in at compile time.

## Why a hybrid design?

A completely reversible ISA is elegant, but certain familiar operations are expensive or inconvenient:

- `MOV` overwrites a destination.
- `LOAD` overwrites a register.
- `STORE` overwrites memory.
- Shifts throw away bits.
- General branches merge control-flow paths.
- Neural-network-style fixed-point code wants multiplication, scaling, comparisons, and many memory accesses.

Instead of making every program awkward, Flip-16 keeps the reversible operations cheap and explicit, then permits a small set of logged operations when the programmer decides the convenience is worth the log space.

The right mental model is **not** “partly reversible hardware makes erasure free.” It is:

> Preserve information when that is naturally cheap. Record it only when a destructive operation is genuinely useful.

## A quick example

The built-in Fibonacci demo starts from `r1 = 0` and `r2 = 1`:

```asm
# Each pair is (F(n), F(n+1)).
REPEAT 8 {
  ADD  r1, r2
  SWAP r1, r2
}
```

After `ADD r1, r2`, the old `r1` can be recovered by subtraction. After `SWAP`, both old values are still present, merely exchanged. The emulator can therefore step backward with no stored trace.

A hybrid program can use ordinary-looking assignment:

```asm
MOV   r1, r2       # Logger saves old r1.
SHR   r1, 4        # Logger saves the four discarded low bits.
STORE [r3], r1     # Logger saves old memory[r3].
```

When moving backward, Flip-16 pops those undo records in reverse order and restores the exact old values.

## Strict mode and hybrid mode

### Strict mode

Strict mode is the current emulator behavior. Every instruction is a bijection over the machine state. The assembler rejects destructive forms such as `ADD r1, r1`, `XOR r2, r2`, and `EXCH r3, [r3]`.

Use strict mode when you want:

- A clean proof that a program can run backward without a trace
- Reversible algorithms, uncomputation, reversible debugging, or ARX-style crypto demonstrations
- A zero-byte undo-log comparison

### Hybrid mode

Hybrid mode accepts the strict instructions unchanged and adds explicitly logged instructions. Each logged instruction is marked in the assembled program and appends an undo record before it changes state.

Select **Ordinary instructions (with undo log)** in the Playground, then use hybrid mode when you need:

- Conventional register assignment and memory access
- Lossy shifts or bitwise operations
- General conditional branches
- More direct matrix, fixed-point, or neural-network experiments

The logger is a stack. A forward logged instruction pushes one record; backward execution pops that exact record. Strict instructions push nothing.

## Writing a strict-mode program

Registers begin at zero for a custom program. `ADDI` changes a known-zero register without an irreversible assignment:

```asm
# r1 = 10 and r2 = 25 because both start at zero.
ADDI r1, 10
ADDI r2, 25
ADD  r1, r2
```

`ADDI r1, 10` means “add 10 to the existing value.” It is not a general overwrite. If `r1` was not zero, it becomes its old value plus 10.

Use `#` for comments. The full source grammar and strict-mode legality rules live in [syntax.md](syntax.md).

## The hybrid ISA at a glance

| Instruction | Forward action | Undo information saved |
|---|---|---|
| `MOV rd, rs` | `rd := rs` | Previous `rd` word |
| `LOAD rd, [ra]` | `rd := mem[ra]` | Previous `rd` word |
| `STORE [ra], rs` | `mem[ra] := rs` | Previous memory word |
| `SHR rd, k` | Logical right shift | The `k` low bits discarded by the shift |
| `SHL rd, k` | Logical left shift | The `k` high bits discarded by the shift |
| `AND rd, rs` | `rd := rd AND rs` | Previous `rd` word |
| `JNZ rc, label` | Branch when `rc != 0` | The pre-branch PC and chosen successor |

Each row is reversible **only because the undo record is included in the enlarged hybrid machine state**. The underlying destructive instruction by itself is still not reversible.

## Neural-network and numerical work

The most valuable future strict extensions are reversible accumulator instructions:

```asm
# Proposed strict extension; inverse is MULSUB.
MULADD r0, r1, r3  # r0 := r0 + r1 * r3 (mod 2^16)
```

`MULADD` can be reversible because it preserves both inputs and updates an accumulator in place. A 32-bit accumulator pair is recommended for fixed-point work.

Ordinary ReLU, quantisation, and right shifts are not reversible: they lose information. Hybrid logging can make them undoable, while reversible neural architectures such as additive coupling layers and invertible permutations can remain on the zero-log path.

## Honest limits

- Running backward takes time; it is not free.
- Hybrid-mode log use grows with destructive work and can contain sensitive old values.
- I/O, reset, and interaction with the outside world are irreversible boundaries.
- A logger makes destructive instructions undoable; it does not make those instructions intrinsically reversible.
- The ordinary CPU's heat gauge is illustrative, not a power measurement.

## Documentation map

- [syntax.md](syntax.md): complete strict and hybrid assembly syntax.
- [details.md](details.md): hybrid architecture specification, undo-log format, execution algorithms, safety invariants, tests, and future extensions.

