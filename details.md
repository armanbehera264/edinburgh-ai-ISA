# Flip-16 Hybrid Architecture Specification

## 1. Status, terminology, and normative language

This document specifies the next version of Flip-16: a hybrid reversible/logged 16-bit architecture. It replaces the previous “every instruction must be intrinsically reversible” design as the product direction, while preserving that strict ISA as a first-class execution mode.

**Implementation status on 17 October 2026:** the repository implements the strict core and the first hybrid release: strict/hybrid assembly modes, labels, `MOV`, `LOAD`, `STORE`, `SHR`, `SHL`, `AND`, `JNZ`, a bounded typed undo stack, and hybrid browser controls. The multiplication, comparison, and vector extensions remain future work. The sections below specify the shipped behavior unless explicitly marked as a future extension.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are used in their normative sense.

Definitions:

- **Strict instruction:** An instruction whose transformation is a bijection over the architectural state it touches. Its inverse is derivable from the instruction itself; it creates no log record.
- **Logged instruction:** An instruction that would destroy information, paired with an undo record containing sufficient information to restore the pre-instruction state.
- **Hybrid state:** Architectural registers, memory, PC, and the append-only undo log considered together.
- **Undo record:** One LIFO record appended before a logged instruction modifies architectural state.
- **Pure region:** A sequence containing strict instructions only. It can be undone with zero log bytes.
- **Logged region:** A sequence containing one or more logged instructions. It can be undone only while its corresponding undo records are retained.
- **External boundary:** I/O, reset, host mutation, or observation that is not represented in Flip-16 state. It cannot be undone by this architecture.

## 2. Decision summary

Flip-16-H uses a two-path machine:

```text
                 ┌───────────────────────────────────────────┐
                 │                 Decoder                   │
                 └───────────────┬───────────────────────────┘
                                 │
              strict opcode      │       logged opcode
                                 │
       ┌─────────────────────────▼───┐  ┌─────────────────────▼───────────┐
       │ Reversible ALU / EXCH path  │  │ Undo-log preflight and append    │
       │ No history record           │  │ Destructive execution path       │
       └──────────────┬──────────────┘  └──────────────┬──────────────────┘
                      └───────────────┬────────────────┘
                                      ▼
                         registers, memory, next PC
```

| Decision | Chosen approach | Rationale |
|---|---|---|
| Baseline ISA | Preserve the existing strict instruction set | Keeps a zero-log reference design and simple correctness proof |
| Destructive convenience | Add explicit logged opcodes, never silently convert strict opcodes | Log use remains visible in source, traces, and performance reporting |
| Log discipline | LIFO undo stack, append before mutation | Reverse order matches backward execution exactly |
| Reverse dispatcher | Peek at a matching log record first; otherwise execute a strict inverse | Supports strict runs with no records and logged branches with non-linear PC movement |
| Initial log representation | Structured `UndoRecord[]` in TypeScript | Easy to inspect, validate, test, and render |
| Future compact representation | Byte-packed variable-length records | Optimisation only after the structured version is correct |
| Program modes | `strict` and `hybrid` compile modes | Strict mode remains a useful proof and teaching mode |
| Multiplication | Add accumulator-style strict extensions before a destructive `MUL` | `MULADD` supports numerical code without logging destination history |
| Control flow | Keep strict mode straight-line; permit only logged branches in hybrid mode | Branch provenance is explicitly recorded rather than hand-waved |
| I/O | Keep outside the reversible/hybrid machine state | Avoids false claims that printing or network writes can be undone |

## 3. Goals and non-goals

### 3.1 Goals

1. Preserve exact backward stepping for every successfully executed instruction until the required undo record has been discarded.
2. Retain zero undo-log consumption for all strict instructions.
3. Permit a deliberately small, useful destructive subset: assignment, load, store, lossy shifts, selected bitwise operations, and branches.
4. Make log usage measurable by instruction, program region, and total byte count.
5. Give programmers a path to more realistic numerical, matrix, and neural-network experiments without pretending that ReLU or quantisation are intrinsically reversible.
6. Keep the initial emulator simple enough to inspect line-by-line in TypeScript.

### 3.2 Non-goals

- Proving energy savings on current laptops, browsers, FPGAs, or ordinary CMOS.
- Reversing host I/O, DOM changes, file writes, networking, randomness, or wall-clock time.
- Replacing a general-purpose ISA.
- Hiding logging behind familiar operations so that programs appear more reversible than they are.
- Adding every x86/ARM instruction. Each instruction must justify its log format, reverse rule, alias rules, and test plan.
- Supporting arbitrary self-modifying code. Program code is immutable during execution.

## 4. Machine state

### 4.1 Existing strict state

All words are unsigned 16-bit values reduced modulo 65536.

```ts
type Word = number; // 0..0xffff
type Reg = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

type StrictState = {
  regs: Uint16Array; // eight words
  mem: Uint16Array;  // 65,536 words, indexed by a full Word address
  pc: number;        // boundary in the immutable program, 0..program.length
};
```

`pc` means “the next instruction to execute forward.” For a program of length `N`, `pc = 0` is its entry boundary and `pc = N` is its completed boundary.

### 4.2 Hybrid state

Hybrid state extends strict state with an undo log and explicit resource limits:

```ts
type LogTag =
  | 'MOV' | 'LOAD' | 'STORE' | 'SHR' | 'SHL' | 'AND' | 'JNZ';

type UndoRecord = {
  tag: LogTag;
  pcBefore: number;
  pcAfter: number;
  payload: unknown; // discriminated precisely in Section 8
};

type HybridState = StrictState & {
  undoLog: UndoRecord[];
  logBytesUsed: number;
  logByteLimit: number;
};
```

The log is part of the abstract machine state. A logged instruction becomes reversible only over the enlarged state `(regs, mem, pc, undoLog)`. The instruction alone is still destructive.

### 4.3 Boundary conditions

- `stepForward` at `pc === N` MUST fail without modifying registers, memory, PC, or log.
- `stepBackward` at the initial entry with `pc === 0` and an empty log MUST fail without mutation.
- A logged forward instruction MUST preflight log capacity before it mutates architectural state. A full log is a precise `LogOverflow` error, not a partially executed instruction.
- A reverse operation with an inconsistent record, impossible `pcAfter`, unexpected tag, or bad payload MUST raise `UndoLogCorruption` and leave state unchanged. Silent recovery is forbidden.
- Program loading, initial state seeding, log clearing, and UI Reset are external boundaries. They are not CPU instructions.

## 5. Execution semantics

### 5.1 Strict forward and backward execution

For strict instruction `P[pc]`:

```text
forward:
    require 0 <= pc < N
    executeStrictForward(P[pc])
    pc := pc + 1

backward:
    require 0 < pc <= N
    pc := pc - 1
    executeStrictInverse(P[pc])
```

For every legal strict state `S` and strict instruction `I`:

```text
inverse(I)(I(S)) = S
I(inverse(I)(S)) = S
```

No undo record is appended or consumed.

### 5.2 Hybrid forward execution

Each logged instruction executes atomically:

```text
1. Decode P[pc] and validate operands/mode.
2. Read every old value required by that instruction's undo record.
3. Determine pcAfter.
4. Construct UndoRecord(tag, pcBefore = pc, pcAfter, payload).
5. Check logByteLimit against encoded size of the record.
6. Append the record.
7. Perform the destructive register/memory/PC update.
8. Set pc := pcAfter.
```

If any part of steps 1–5 fails, steps 6–8 MUST NOT occur. If host allocation fails in a prototype, the implementation MUST treat it as a failed instruction rather than leave an architectural state without the matching record.

### 5.3 Hybrid backward dispatcher

The reverse algorithm cannot always blindly decrement PC: a logged branch may have jumped to an arbitrary successor. It MUST use the log first.

```text
stepBackwardHybrid(state, program):
    if undoLog is not empty and undoLog.top.pcAfter == state.pc:
        record := undoLog.top
        verify program[record.pcBefore] is compatible with record.tag
        restore state from record.payload
        state.pc := record.pcBefore
        pop record
        decrease logBytesUsed by encodedRecordSize(record)
        return

    # No logged instruction ended at this boundary. The preceding instruction
    # must be strict and therefore must lie immediately before the current PC.
    require state.pc > 0
    state.pc := state.pc - 1
    require program[state.pc] is strict
    executeStrictInverse(program[state.pc])
```

The `pcAfter` match is essential. Consider a logged `MOV` at PC 3 followed by strict instructions at PCs 4 and 5. At PC 6 the record’s `pcAfter` is 4, so PC 5 is undone strictly, then PC 4 is undone strictly, and only at PC 4 does the dispatcher consume the `MOV` record. For a taken `JNZ`, `pcAfter` can be an arbitrary target; the matching record identifies the predecessor unambiguously.

### 5.4 Program-level reversibility property

Let `F` be a sequence of successfully executed hybrid forward steps from initial hybrid state `H0`, and let `B` be the same number of hybrid backward steps, with no external boundary or log truncation between them. Then:

```text
B(F(H0)) = H0
```

The equality includes registers, all memory words, PC, log content, and `logBytesUsed`. It does not include host rendering state, elapsed time, or user interaction.

## 6. Strict ISA retained from Flip-16

Strict mode keeps these operations exactly because they are bijective under the stated alias restrictions.

| Instruction | Forward effect | Inverse | Required restriction |
|---|---|---|---|
| `ADD rd, rs` | `rd := rd + rs` | `SUB rd, rs` | `rd != rs` |
| `SUB rd, rs` | `rd := rd - rs` | `ADD rd, rs` | `rd != rs` |
| `ADDI rd, imm` | `rd := rd + imm` | `SUBI rd, imm` | none |
| `SUBI rd, imm` | `rd := rd - imm` | `ADDI rd, imm` | none |
| `XOR rd, rs` | `rd := rd XOR rs` | itself | `rd != rs` |
| `NOT rd` | `rd := NOT rd` | itself | none |
| `NEG rd` | `rd := -rd` | itself | none |
| `ROL rd, k` | rotate left by `k mod 16` | `ROR rd, k` | none |
| `ROR rd, k` | rotate right by `k mod 16` | `ROL rd, k` | none |
| `SWAP ra, rb` | exchange registers | itself | `ra != rb` |
| `EXCH rd, [ra]` | exchange `rd` with `mem[ra]` | itself | `rd != ra` |
| `CADD rd, rs, rc` | if `rc != 0`, add `rs` into `rd` | `CSUB` | `rd != rs`, `rd != rc` |
| `CSUB rd, rs, rc` | if `rc != 0`, subtract `rs` from `rd` | `CADD` | `rd != rs`, `rd != rc` |
| `CSWAP ra, rb, rc` | if `rc != 0`, exchange `ra` and `rb` | itself | all three registers distinct |

The existing [syntax.md](syntax.md) is the authoritative user-facing syntax document for the shipped strict and hybrid instruction sets.

## 7. Logged ISA

The first hybrid release MUST remain deliberately small. Every logged opcode is explicit in source and rejected by strict-mode compilation.

### 7.1 `MOV rd, rs`

```text
forward: regs[rd] := regs[rs]; pcAfter := pc + 1
record:  oldDestination = regs[rd]
undo:    regs[rd] := oldDestination; pc := pcBefore
```

`rd == rs` SHOULD be rejected as a no-op programming error. `MOV` needs no special source/destination alias rule otherwise: the source is read before the destination write.

### 7.2 `LOAD rd, [ra]`

```text
address := regs[ra]
forward: regs[rd] := mem[address]; pcAfter := pc + 1
record:  oldDestination = regs[rd]
undo:    regs[rd] := oldDestination; pc := pcBefore
```

Version 1 MUST require `rd != ra`. Although a record could restore `rd` even when it is also the address register, rejecting the overlap keeps operand timing, UI explanation, and future hardware semantics simple.

### 7.3 `STORE [ra], rs`

```text
address := regs[ra]
forward: mem[address] := regs[rs]; pcAfter := pc + 1
record:  address, oldMemory = mem[address]
undo:    mem[address] := oldMemory; pc := pcBefore
```

The record MUST include the resolved address, not merely `ra`. A future instruction between store and reverse might change `ra`; an undo record must be self-sufficient. `ra == rs` is legal because the store does not alter either register.

### 7.4 `SHR rd, k` and `SHL rd, k`

Shifts use `0 <= k <= 15`. They are distinct from existing rotates.

For `SHR`, define `lost = oldRd & ((1 << k) - 1)` for `k > 0`; for `k = 0`, `lost = 0`.

```text
forward: rd := oldRd >>> k
record:  amount = k, lostLowBits = lost
undo:    rd := (rd << k) OR lostLowBits
```

For `SHL`, define `lost = oldRd >>> (16 - k)` for `k > 0`.

```text
forward: rd := (oldRd << k) mod 2^16
record:  amount = k, lostHighBits = lost
undo:    rd := (rd >>> k) OR (lostHighBits << (16 - k))
```

The implementation MUST mask all results to 16 bits. Logging only the discarded bits is materially more efficient than logging the full old word: `k` bits of payload rather than 16, though the first structured emulator MAY store the loss in a 16-bit field for clarity.

### 7.5 `AND rd, rs` and optional `ANDI rd, imm`

`AND` is destructive because distinct old destination values can yield the same result. Version 1 records the full old destination word:

```text
forward: rd := rd AND rs
record:  oldDestination
undo:    rd := oldDestination
```

`rd == rs` is legal in hybrid mode but SHOULD produce a compiler warning: it turns the register into itself and needlessly consumes a record. `OR`, `ORI`, and ordinary `MUL rd, rs` are deferred; they use the same full-old-destination record pattern but are not needed in the first cut.

### 7.6 `JNZ rc, label`

General control flow is a logged escape hatch. At assembly time, `label` resolves to an instruction-boundary PC.

```text
pcBefore := pc
pcAfter := (regs[rc] != 0) ? targetPc : pc + 1
record: pcBefore, pcAfter, conditionWasNonzero
forward: pc := pcAfter
undo: pc := pcBefore
```

The condition value itself is not changed and need not be copied. `pcBefore` and `pcAfter` are nevertheless mandatory record fields: a target may have many predecessors, so the current PC alone cannot identify the branch that led there. `conditionWasNonzero` is retained as an audit/debug assertion; reverse execution need not recompute it and MUST validate it only if the implementation can do so without changing state.

Unconditional `JMP label` is also destructive with respect to predecessor PC and MAY be represented as `JNZ` with a dedicated guaranteed-nonzero control register only if that invariant is explicit. A standalone `JMP` is deferred from Version 1.

## 8. Undo-record schema and storage accounting

### 8.1 Structured prototype representation

**[TARGET, first implementation]** Use a tagged TypeScript union:

```ts
type UndoRecord =
  | { tag: 'MOV';   pcBefore: number; pcAfter: number; oldDestination: Word }
  | { tag: 'LOAD';  pcBefore: number; pcAfter: number; oldDestination: Word }
  | { tag: 'STORE'; pcBefore: number; pcAfter: number; address: Word; oldMemory: Word }
  | { tag: 'SHR';   pcBefore: number; pcAfter: number; amount: number; lostBits: Word }
  | { tag: 'SHL';   pcBefore: number; pcAfter: number; amount: number; lostBits: Word }
  | { tag: 'AND';   pcBefore: number; pcAfter: number; oldDestination: Word }
  | { tag: 'JNZ';   pcBefore: number; pcAfter: number; taken: boolean };
```

This object representation is for semantic correctness and UI inspection. JavaScript object allocation overhead MUST NOT be presented as architectural log size.

### 8.2 Canonical packed-size accounting

For comparisons and future byte packing, account records as:

```text
header = tag (1 byte) + payload length (1 byte) + pcBefore (2 bytes) + pcAfter (2 bytes)
```

| Tag | Payload | Canonical record size |
|---|---|---:|
| `MOV` | old destination word | 8 bytes |
| `LOAD` | old destination word | 8 bytes |
| `STORE` | resolved address + old memory word | 10 bytes |
| `SHR` / `SHL` | amount byte + one 16-bit loss field | 9 bytes |
| `AND` | old destination word | 8 bytes |
| `JNZ` | taken flag byte | 7 bytes |

These are Version-1 accounting sizes, not a lower bound. A later compact codec may omit `pcAfter` for linear instructions, pack shift-loss bits densely, or delta-code PCs. It MUST decode to the same logical record and produce exactly the same reverse behavior.

### 8.3 Log capacity and truncation

`logByteLimit` is selected when hybrid state is created. The browser demonstration uses and displays a 64 KiB limit; callers of `newHybridState(limit)` may select a different limit through the core API.

There are only three legitimate ways to reclaim undo-log storage:

1. Step backward and pop records.
2. Reach an explicitly declared irreversible checkpoint that discards the ability to go before that checkpoint.
3. End the computation and discard the entire state/log externally.

An automatic circular overwrite policy is prohibited in Version 1 because it silently invalidates older backward steps. If checkpoints are later added, the UI MUST label the earliest reversible boundary and require an explicit user/program acknowledgement before truncating records.

### 8.4 Confidentiality

Undo records contain prior register and memory contents. They can therefore retain secrets after a program no longer references those values. A production-oriented implementation SHOULD support clearing the log at an explicit irreversible boundary and MUST NOT claim that log-backed execution is inherently privacy-preserving.

## 9. Compiler, assembler, and mode rules

### 9.1 Mode selection

The assembler API exposes a mode:

```ts
type CompileMode = 'strict' | 'hybrid';
assemble(source, { mode: 'strict' | 'hybrid' })
```

- `strict` accepts only Section 6 operations and compile-time `REPEAT`.
- `hybrid` accepts all strict operations plus Section 7 operations and labels for logged branches.
- Hybrid mode MUST NOT change the semantics or inverse mapping of a strict instruction.
- The compiled program MUST classify every instruction as `strict` or `logged`.

### 9.2 Labels

Labels are required only for hybrid branches:

```asm
loop:
  SHR r1, 1
  JNZ r1, loop
```

A label identifies an instruction boundary, not a mutable memory address. Duplicate labels, undefined labels, and labels pointing inside a macro expansion are compile errors. The compiler SHOULD retain source-line metadata for both the branch and target so the editor can render control flow.

### 9.3 Comments, macros, and source locations

Comments begin with `#`. The compiler MUST remove comment suffixes before recognising `REPEAT`, labels, or instructions. `REPEAT` counts remain non-negative decimal literals and expand at compile time. The existing implementation does not support nested `REPEAT`; the hybrid compiler MUST either preserve that restriction or implement nesting deliberately with tests.

Every expanded instruction MUST retain its one-based original source line. This powers source-editor highlighting and makes log diagnostics useful even when an instruction was produced by a repeated block.

### 9.4 Diagnostics

Errors MUST identify source line, source text, mode, and reason. Examples:

```text
strict mode, line 8: MOV r1, r2 — logged instruction is unavailable in strict mode
hybrid mode, line 13: LOAD r3, [r3] — destination may not overlap address register
hybrid mode, line 19: JNZ r2, retry — undefined label: retry
hybrid mode, line 22: SHR r1, 16 — shift amount must be in 0..15
```

Warnings SHOULD cover no-op logged operations and suspicious log growth, for example `MOV r1, r1`, `AND r2, r2`, and a static loop expansion projected to exceed the configured log limit.

## 10. Numerical and neural-network extensions

### 10.1 Strict accumulator operations

The preferred multiplication primitive is not destructive assignment. It is an accumulator update:

```text
MULADD rd, ra, rb: rd := rd + (ra * rb mod 2^16)
MULSUB rd, ra, rb: rd := rd - (ra * rb mod 2^16)
```

`MULADD` and `MULSUB` are exact inverses when `rd` differs from `ra` and `rb`; `ra == rb` is allowed. The product is computed from preserved sources, while the destination’s old value remains recoverable by subtraction.

For useful fixed-point work, add a 32-bit accumulator pair:

```text
MULADDW rlo, rhi, ra, rb
MULSUBW rlo, rhi, ra, rb
```

Interpret `(rhi:rlo)` as one 32-bit modular accumulator. Both destination registers MUST be distinct from each other and from both source registers. The instruction adds/subtracts the unsigned 32-bit extension of the 16-by-16 product. Signed arithmetic, if added, MUST specify two's-complement interpretation separately.

### 10.2 Strict Boolean/comparison extensions

These are candidates because they toggle a destination rather than overwrite it:

```text
XORAND rd, ra, rb: rd := rd XOR (ra AND rb)       # word-parallel Toffoli form
XORLT  rd, ra, rb: rd := rd XOR (ra < rb ? 1 : 0)
PERM   rd, table:  rd := permutationTable[rd]
```

`rd` MUST differ from source registers for `XORAND` and `XORLT`. `PERM` is strict only if the selected immutable lookup table is proven to be a permutation of all 65,536 word values and an inverse table is available.

### 10.3 What remains lossy

The following common ML operations are not intrinsically reversible:

- ReLU maps every negative input to zero.
- Clamping maps a range of values to one endpoint.
- Quantisation maps many high-precision values to one low-precision value.
- Average pooling discards inputs.
- Right shifts discard low bits.

Hybrid mode can make such operations undoable by logging the lost information. Alternatively, use a reversible model family: additive coupling layers, invertible 1x1 transforms, permutations, or normalising flows. The design MUST never label conventional ReLU as a strict reversible instruction.

### 10.4 Worked dot-product region

Assume `r0` is a zeroed accumulator, `r1`/`r2` are inputs, and `r3`/`r4` are weights:

```asm
# Proposed strict extensions.
MULADD r0, r1, r3
MULADD r0, r2, r4
```

The result is a modular 16-bit dot product. It needs no undo record. If a reduced-scale output is required, `SHR r0, k` is a hybrid instruction that logs its discarded low bits. A program that needs to preserve only the scaled output may instead copy that output to clean storage and uncompute the prior strict calculation, following Bennett uncomputation.

## 11. UI requirements

### 11.1 Current strict UI

The current UI contains source editing, Compile, demo selection, state table, execution controls, source-line execution highlighting, register-difference highlighting, timeline scrubbing, and a teaching-oriented information-loss comparison. It intentionally no longer includes a gate-model or dedicated reversibility panel.

### 11.2 Hybrid UI additions

The shipped UI exposes:

- A `Strict reversible` / `Hybrid (with undo log)` selector before compile.
- Current undo-log bytes, capacity, and record count.
- Hybrid instruction and reverse-branch demos.
- A disabled scrubber with an explanation when a program contains `JNZ`, because a PC alone cannot name one loop history.
- Explicit log-overflow errors without a hidden fallback.

Useful future refinements are per-line strict/logged decoration, a privacy-safe latest-record inspector, and per-step log-delta text.

Timeline scrubbing in hybrid mode MAY replay forward from the initial state rather than store snapshots. It MUST seed the same initial state and reproduce log content deterministically. If a scrub target precedes a discarded checkpoint, it MUST be disabled or clearly marked unavailable.

## 12. Testing and verification

### 12.1 Strict regression suite

The strict suite MUST continue unchanged. For random legal strict programs and states:

```text
backward(forward(S, P), P) == S
forward(inverseProgram(P), forward(P, S)) == S
```

Comparison includes all eight registers, all 65,536 memory words, and PC.

### 12.2 Logged instruction tests

For every logged opcode, test boundary values `0`, `1`, `0x7fff`, `0x8000`, and `0xffff`, relevant alias patterns, and every shift amount `0..15`.

Examples:

- `MOV`: old destination restored for equal and unequal source/destination values.
- `LOAD`: old destination restored; memory remains unchanged.
- `STORE`: old memory restored at address `0x0000` and `0xffff`; source register remains unchanged.
- `SHR`: exhaustive test over all 16 shift counts and sampled/all word values; reconstructed word equals old word exactly.
- `SHL`: same reconstruction property.
- `JNZ`: both taken and fall-through paths restore the exact pre-branch PC and leave the control register unchanged.

### 12.3 Mixed-program property tests

Generate legal hybrid programs containing arbitrary mixtures of strict linear instructions and logged linear operations. Then generate branch-containing programs with bounded control-flow graphs and guaranteed termination. For every execution prefix that does not cross a checkpoint:

```text
state0 = clone(initial)
execute k successful forward steps
execute k backward steps
assert deepEqual(current, state0)
assert undoLog is empty
assert logBytesUsed == 0
```

For a start state containing a pre-existing log, backward/forward round trips MUST restore the original record sequence byte-for-byte, not merely produce equal register values.

### 12.4 Failure atomicity tests

Deliberately configure a log limit one byte below a record’s required size. Assert that the attempted forward instruction leaves registers, memory, PC, record count, and byte count unchanged. Repeat for malformed records and invalid branch targets.

### 12.5 Differential baseline tests

Implement a simple conventional execution model that performs the same destructive operations and stores old state in an undo log. Its reverse result MUST match hybrid reverse state. Compare log bytes using the canonical accounting table, not JavaScript heap size.

## 13. Alternatives considered

| Alternative | Decision | Reason |
|---|---|---|
| Stay completely reversible | Retain as strict mode, not as the only product mode | Best proof and zero-log path, but unnecessarily awkward for destructive numerical/control operations |
| Conventional CPU plus logger only | Rejected as core | Makes every overwrite pay a log cost and loses the key reversible fast path |
| Hybrid strict core plus explicit logger | Chosen | Preserves both pedagogical clarity and practical escape hatches |
| Implicit logger behind existing instructions | Rejected | Hides cost and makes source-level reversibility claims misleading |
| Record every complete state snapshot | Rejected | Simple but much larger than logging the information actually overwritten |
| Circular log with silent overwrite | Rejected | Makes backward availability non-obvious and can invalidate debugging unexpectedly |
| Hardware gate-netlist feature | Deferred/removed from UI | Not required to establish ISA semantics; it distracted from the software-visible trade-off |
| Raw branches in strict mode | Rejected | Joins lose predecessor information without a structural proof or record |
| Janus-style structured strict control flow | Future possibility | Principled, but more complex than the logged branch needed for the hybrid MVP |
| Full destructive `MUL` first | Rejected | `MULADD` provides useful numerical computation while staying strict |
| Reversible ReLU claim | Rejected | Mathematically false without retaining lost sign/magnitude information |

## 14. Delivery status and next sequence

Completed in the first hybrid release:

1. Preserved the strict ISA as the zero-log baseline.
2. Added `CompileMode`, instruction classification, and mode-aware diagnostics.
3. Added structured undo records, capacity preflight, `logBytesUsed`, and hybrid reverse dispatch.
4. Added `MOV`, `LOAD`, `STORE`, `SHR`, `SHL`, `AND`, labels, and `JNZ`.
5. Added browser mode selection, log observability, hybrid demos, and overflow handling.

The next work is `MULADD`/`MULSUB`, 32-bit accumulator support with a fixed-point demo, then explicit irreversible checkpoints only after their truncation semantics and UI warnings are complete.

## 15. Acceptance criteria

The hybrid architecture is complete only when all of the following hold:

- Strict programs compile and execute identically to the current implementation.
- Strict instructions consume exactly zero undo-log bytes.
- Every logged opcode has a documented payload and passes forward/backward round-trip tests.
- A full undo log prevents execution atomically rather than corrupting state.
- Mixed strict/logged programs rewind exactly to their starting architectural state and starting log state.
- Logged branches restore the correct predecessor PC for both taken and fall-through paths.
- The UI distinguishes strict work from logged work and reports canonical log-byte usage.
- Documentation clearly states which instructions are implemented now versus proposed.
- No energy claim implies that logger-backed execution or browser execution has zero physical cost.

