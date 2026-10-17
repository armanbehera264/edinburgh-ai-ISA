## 1. Core idea: the machine state is a bijection

Every step must map each possible machine state to exactly one next state, and vice versa. If two different states could lead to the same next state, you can't go back. That's the only rule, and everything below follows from it.

A normal `MOV r1, r2` or `r1 = r2 + r3` fails this, because the old value of `r1` is destroyed. So the ISA has to be built from **in-place updates** and **swaps**, never overwrites.

**Option A: record and replay (reversible debugger).** Run a normal CPU and log every overwritten value so you can undo it. This is easy but not really "flipping" anything, and the log grows with runtime. It's worth building anyway as a **baseline to compare against**.

**Option B: inherently reversible ISA (the real flip).** Every instruction has an exact inverse, so no log is needed. This is the recommended core.

**Option C: hybrid.** Use B, plus Bennett's trick for irreversible functions: compute the result, copy it out, then run the computation backwards to erase the scratch work.

My recommendation is B as the core, with A as a comparison toggle ("log memory: 40 KB vs 0 bytes").

## 2. Instruction set

All instructions update `rd` in place. Registers are 8 × 16-bit.

| Instruction | Effect | Inverse |
|---|---|---|
| `ADD rd, rs` | rd += rs | `SUB rd, rs` |
| `ADDI rd, imm` | rd += imm | `SUBI rd, imm` |
| `XOR rd, rs` | rd ^= rs | itself |
| `NOT rd` / `NEG rd` | bitwise / two's complement | itself |
| `ROL rd, k` | rotate left | `ROR rd, k` |
| `SWAP rd, rs` | exchange registers | itself |
| `EXCH rd, [ra]` | swap register with memory cell | itself |
| `CADD rd, rs, rc` | if rc≠0: rd += rs | `CSUB` |
| `CSWAP ra, rb, rc` | if rc≠0: swap ra, rb | itself |

**Rules the assembler must enforce.** These are the traps people hit:
- `ADD r1, r1` and `XOR r1, r1` are illegal. Doubling loses the top bit, and `r ^= r` always gives 0. Require `rd ≠ rs`.
- `EXCH r1, [r1]` is illegal. The address register changes mid-instruction, so you can't find the cell again on the way back. Require `rd ≠ ra`.
- Conditional instructions need the condition register to differ from the registers they modify.
- Loads and stores don't exist. `EXCH` replaces both, which is a nice talking point.

**Why this ISA is handy.** It's an ARX instruction set (add, rotate, xor), exactly what many ciphers use, plus swaps.

## 3. Program counter and execution

Make the PC part of the reversible state, and pick one of these:

**Option 1: inverse program (most elegant).** Implement only forward execution. To run backwards, build the inverse program by reversing the instruction order and replacing each instruction with its inverse:

```
ADD r1, r2        SUB r1, r2   (this is last in inverse)
ROL r1, 3    →    ROR r1, 3
XOR r1, r3        XOR r1, r3   (this is first in inverse)
```

The inverse is `XOR r1,r3 ; ROR r1,3 ; SUB r1,r2`. One emulator handles both directions, and "uncompute" becomes a compile-time transformation.

**Option 2: direction bit.** Forward does `exec(prog[pc]); pc++`. Backward does `pc--; exec_inverse(prog[pc])`. This is simple, and it makes scrubbing the timeline slider trivial.

I'd do Option 2 for the UI and use Option 1 to test it.

**Testing trick.** Generate random states and programs and assert `unstep(step(s)) == s`. This single property test catches nearly every bug.

## 4. Control flow (the hard part)

A branch destroys information about where you came from, so the join point needs a way to tell which path was taken.

**Option X: no branches (recommended for the MVP).** Use conditional instructions (`CADD`, `CSWAP`) for if-statements and have the assembler unroll loops (`REPEAT 8 { ... }`). The PC is then always ±1, and nothing can go wrong. Speck-style ciphers, Fibonacci and sorting networks all work this way.

**Option Y: structured, Janus-style.**
- `IF c THEN … ELSE … FI c'`, where `c'` is an assertion that's true only if the THEN branch ran. The condition must not be modified inside the branches.
- `FROM a DO … LOOP … UNTIL b`, where `a` is true only on first entry. Running it backwards swaps `a` and `b`.

**Option Z: paired branches.** Each jump has a matching landing instruction, and a direction flag lets the landing site send you back. This is how the Pendulum processor did it. It's the most "hardware-like" but fiddly.

I'd do X first and add Y only if time allows.

## 5. The circuitry (gate level)

Normal gates like AND destroy information (two inputs, one output). Reversible gates have as many outputs as inputs:

```
NOT:      a → ¬a
CNOT:     (a, b) → (a, b⊕a)              [b ^= a]
Toffoli:  (a, b, c) → (a, b, c⊕(a∧b))    [CCNOT]
Fredkin:  (c, a, b) → c ? (c, b, a) : (c, a, b)   [controlled swap]
```

Toffoli alone is universal (with constant-0 inputs you get AND, with constant-1 you get NAND, and CNOT onto a 0 gives fan-out/copy).

**How each instruction maps to gates:**
- `XOR rd, rs`: 16 parallel CNOTs.
- `SWAP`: 3 CNOTs per bit (`a^=b; b^=a; a^=b`), or Fredkin gates with a constant-1 control.
- `ROL`/`ROR`: pure wiring, **zero gates**. It's a permutation of bit lines.
- `NOT`: 16 NOT gates.
- `ADD`: an in-place reversible adder. The Cuccaro ripple-carry adder computes `b = a + b` using about 2n Toffolis and one ancilla bit (a spare line that starts and ends at 0). Look up "Cuccaro adder, MAJ and UMA blocks".
- `CADD`: compute `tmp = rc ? rs : 0` with Toffolis into zeroed ancillas, add `tmp` into `rd`, then run the first step backwards to clear `tmp`. This is compute, use, uncompute in miniature.

**Ancilla discipline.** Ancilla bits must return to 0 after every instruction. Have the simulator assert this. It makes a great correctness check and a good UI element ("garbage bits: 0 ✓").

**Datapath sketch:**

```
PC ─► [Program ROM] ─► Decoder ─► opcode, rd, rs, imm
                                     │
 Register file ◄──────► Reversible ALU (gate netlist)
 (R0..R7)               result written back to *same* register
 Memory ◄─────────────► EXCH port
 PC ± 1 (direction bit)
```

The key difference from a normal CPU is that there's no separate destination and no "write", only in-place update.

## 6. How deep to go: options

| Level | What you build | Effort | Impact |
|---|---|---|---|
| A | ISA emulator + assembler + UI | Low | Good |
| B | A + gate-level ALU simulation (Toffoli netlist, gate counts, ancilla checks) | Medium | High: this is your "circuitry" |
| C | B + HDL (Verilog/Amaranth) or Logisim, maybe FPGA | High | Risky |

Level C only shows *logical* reversibility. An FPGA still dissipates heat normally, so it doesn't show real energy savings. I'd target **A + B**, and use Logisim Evolution or a generated diagram for a nice visual of one adder.

**Physical implementation (explain, don't build).** Real energy recovery needs **adiabatic logic**, where the power clock ramps slowly and charge flows back to the supply. Dissipation is roughly (RC/T)·CV², so slower means less heat, a speed-versus-energy trade-off. Landauer's limit is kT·ln2 ≈ 2.9×10⁻²¹ J per erased bit at room temperature.

**An energy counter for the UI.** Count bits erased by a conventional version of the same program (each overwrite erases n bits), multiply by kT ln2, and show the running total against zero for the reversible machine. Label it clearly as the *theoretical minimum*. Real chips dissipate orders of magnitude more, and judges will respect you for stating that.

## 7. Demos that sell it

1. **Encrypt forward, decrypt backward.** A Speck-style cipher round is only add, rotate and xor, so the same program run in reverse decrypts. No decrypt code exists. This is probably your best demo.
2. **Fibonacci.** `ADD a,b ; SWAP a,b` steps forward, and running it backwards counts the sequence down.
3. **Backwards bug hunt.** Crash the program, then step backwards from the faulty state to find which instruction corrupted it, with no recorded trace.
4. **Bennett uncompute.** Compute a result, copy it out, un-run, and show the scratch registers returning to zero.
5. **Log vs no log.** A memory-usage chart of Option A against Option B.

## 8. Honest limitations (put these in the pitch)

- Reversible machines can't forget, so intermediate "garbage" must be kept or uncomputed. Uncomputing roughly doubles the time.
- I/O is inherently irreversible, so treat the program as a pure function from initial state to final state.
- Reversible doesn't mean free. Running backwards still takes time.

## 9. Stack suggestion

Write the core in **TypeScript** so it runs in the browser. There's no backend, so no API contract to get wrong across your different setups, and deployment is a static page. The interface is tiny:

```ts
type State = { regs: Uint16Array; mem: Uint16Array; pc: number };
function step(s: State, prog: Instr[]): State;     // forward
function unstep(s: State, prog: Instr[]): State;   // backward
```

(Python plus a web frontend also works if your team prefers it.)

**Build order:**
1. ISA, `step`/`unstep`, and the property test (first 2 hours). Everything depends on this.
2. Assembler with the legality checks, plus the UI timeline scrubber (parallel).
3. Gate-level ALU and Toffoli adder, verified against `a+b` for random inputs.
4. Cipher demo, Fibonacci demo, and the energy counter.
5. Pitch and a polished demo script, with a fallback recording.

Do you want me to sketch the TypeScript skeleton for the emulator, or the Toffoli netlist for the 16-bit adder? I can also write a worked cipher round in this assembly.


## Where could it beat x86/ARM?

**On today's silicon, mostly nowhere.** A normal chip wastes far more energy than the theoretical cost of erasing bits, so a reversible instruction set running on ordinary transistors isn't faster or cheaper per operation. Be honest about that in your pitch. The advantages are in specific niches:

- **Undo and debugging:** x86/ARM can't rewind without logging every overwritten value, which costs memory and time. Here, rewinding is free, with no log.
- **Rollback and speculation:** anything that needs to "try something, then undo it" (transactions, speculative execution, simulations) normally needs checkpoints. Reversible code undoes itself.
- **Quantum computing:** this is the strongest real-world link. Quantum gates are always reversible, so any classical calculation inside a quantum algorithm has to be written in exactly this style (Toffoli and CNOT gates, ancilla bits, uncomputing). Your ISA is basically a classical model of that.
- **Future low-power hardware:** with adiabatic (energy-recovering) circuits, never erasing information is what lets you reclaim energy instead of turning it into heat. That's a long-term research direction, not something you can buy today.
- **Encryption:** the same program encrypts going forward and decrypts going backward, so there's half the code to write, store and verify.
- **Simpler hardware:** instructions update a register in place, rotates are just wires, and there's no separate "destination" or load/store path. The decoder and datapath can be smaller.

**Where it loses:** you need extra "scratch" registers, uncomputing garbage costs extra time, simple branches and I/O don't fit, and `r1 = r2 + r3` takes more than one instruction because nothing may be overwritten.

## How does the program counter know the order and the reverse?

It doesn't need to be clever. The program is just a list stored in forward order, and the **direction bit** says which way to walk it.

Take this program:

```
0: ADD r1, r2
1: ROL r1, 3
2: XOR r1, r3
```

**Going forward:** run the instruction at the PC, then add 1.
- PC=0: do ADD, PC becomes 1
- PC=1: do ROL, PC becomes 2
- PC=2: do XOR, PC becomes 3

**Going backward:** first subtract 1 from the PC, then run the *opposite* of the instruction found there.
- PC=3 → 2: undo XOR (XOR again)
- PC=2 → 1: undo ROL (ROR)
- PC=1 → 0: undo ADD (SUB)

So the reversed order comes for free from walking the list backwards. Nobody has to build a reversed program.

**How it knows what the opposite is:** a small lookup table in the decoder pairs each instruction with its undo:

| Forward | Undo |
|---|---|
| ADD | SUB |
| ROL | ROR |
| XOR | XOR (it's its own opposite) |
| SWAP | SWAP |

In hardware, that's just the decoder picking a different opcode when the direction bit is 1.

**Why the order of "move, then run" differs:** after going forward the PC points at the *next* instruction to run. To undo the one you just did, you first have to step back onto it. That's why forward is "run, then +1" and backward is "−1, then run inverse". It's the same trick as retracing your steps: you walk back to where you were before you can undo what you did there.

This only works cleanly because the PC always moves by exactly 1. Once you add jumps, you need extra rules so the machine can tell which way it came in, which is why I suggested starting with no branches.

If it helps, I can write the pitch line for the "where is it useful" question. Judges like a clear "here's the real use case (quantum, rollback, debugging)" followed by an honest "here's what it doesn't do".

Each problem gets fixed by a design rule, and the assembler enforces them so you can't write a destructive instruction by accident.

| Problem on x86/ARM | How this ISA fixes it |
|---|---|
| **`mov` overwrites the old value** | There is no `mov`. You can only update a register using its own old value (`rd += rs`) or swap two registers (`SWAP`). Nothing is ever overwritten, only transformed or exchanged, so the old value can always be recovered. |
| **`and`, `or`, shifts lose bits** | Those instructions don't exist. Shifts become **rotates**, where bits wrap around instead of falling off. `and`/`or` become **conditional** operations (`CADD`, `CSWAP`) that keep their inputs untouched and put the result into a separate register that started at 0. You also get a copy this way: `XOR` a value into a zeroed register. |
| **Flags get overwritten as a side effect** | There is no flags register. If a program needs a condition, it is held in an ordinary register that you can see and that the instruction never changes. So there are no hidden side effects. |
| **Jumps lose where you came from** | For the MVP there are no jumps. The PC only moves ±1, so it is always trivial to retrace. Loops are unrolled by the assembler and if-statements use conditional instructions. If you add real branches later, they need a "this is how you got here" assertion at the join point (the Janus-style `IF … FI` rule). |

**The one rule behind all four:** the assembler rejects any instruction that could lose information, such as `ADD r1, r1` (it doubles and drops the top bit) or `XOR r1, r1` (always gives 0).

**What it costs you:** because nothing can be thrown away, you sometimes end up with leftover "garbage" values, for example the copy you made earlier. Cleaning them up means running that part of the computation backwards (Bennett's trick), which roughly doubles the work for that section. Also, anything that is naturally lossy, like `r1 = r2 + r3` where `r1` already holds something, takes a few more instructions than it would on x86.

For the pitch, you can say "we didn't make normal instructions reversible, we removed every instruction that isn't." Then show a short program running forward and backward to prove it.