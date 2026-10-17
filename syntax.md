# Flip-16 Assembly Syntax

Flip-16 has two assembler modes. **Strict reversible** accepts only instructions that carry their own inverse. **Hybrid** also accepts conventional overwrite, shift, memory, and branch instructions; the emulator makes those reversible by recording the minimum information needed to undo them in a bounded log.

## Source format

```asm
# A full-line comment
ADD r2, r1       # An end-of-line comment
ROL r2, 3
```

- Comments begin with `#` and continue to the line end.
- Registers are `r0` through `r7`; none is a fixed zero register.
- Instruction and register spelling are case-insensitive.
- Separate operands with commas. Blank lines are ignored.
- Immediates are decimal (`42`), signed decimal (`-1`), or hexadecimal (`0x00ff`). They are stored as 16-bit words; `-1` is `0xffff`.
- Arithmetic wraps modulo 65536.
- Memory is 65,536 16-bit words. `[rN]` means the word at the address currently held in `rN`.

## Structure, labels, and fixed repeats

Use a label before a hybrid branch target. A label may appear on a line by itself or before an instruction.

```asm
loop:
  SUBI r1, 1
  JNZ r1, loop
```

Labels are case-insensitive and must start with a letter or `_`; the remaining characters may be letters, digits, or `_`. Labels are resolved after `REPEAT` expansion, so a `JNZ` target is an instruction boundary, not a source-line number.

Use `REPEAT` for a compile-time fixed loop:

```asm
REPEAT 8 {
  ADD r1, r2
  SWAP r1, r2
}
```

`REPEAT` counts are non-negative decimal integers. The assembler expands the body before execution; nested `REPEAT` blocks are not supported. The expanded program limit is 65,535 instructions. A bare `}` is an error.

## Strict reversible instructions

These assemble in both modes and consume **no undo-log space**.

| Syntax | Effect | Exact inverse | Rule |
|---|---|---|---|
| `ADD rd, rs` | `rd = rd + rs` | `SUB rd, rs` | `rd != rs` |
| `SUB rd, rs` | `rd = rd - rs` | `ADD rd, rs` | `rd != rs` |
| `ADDI rd, imm` | `rd = rd + imm` | `SUBI rd, imm` | — |
| `SUBI rd, imm` | `rd = rd - imm` | `ADDI rd, imm` | — |
| `XOR rd, rs` | `rd = rd XOR rs` | itself | `rd != rs` |
| `NOT rd` | complement every bit in `rd` | itself | — |
| `NEG rd` | two's-complement negation | itself | — |
| `ROL rd, amount` | rotate left | `ROR rd, amount` | amount is reduced modulo 16 |
| `ROR rd, amount` | rotate right | `ROL rd, amount` | amount is reduced modulo 16 |
| `SWAP ra, rb` | exchange two registers | itself | `ra != rb` |
| `EXCH rd, [ra]` | exchange `rd` with memory at address `ra` | itself | `rd != ra` |
| `CADD rd, rs, rc` | if `rc != 0`, add `rs` into `rd` | `CSUB rd, rs, rc` | `rd` differs from `rs` and `rc` |
| `CSUB rd, rs, rc` | if `rc != 0`, subtract `rs` from `rd` | `CADD rd, rs, rc` | `rd` differs from `rs` and `rc` |
| `CSWAP ra, rb, rc` | if `rc != 0`, exchange `ra` and `rb` | itself | all three registers differ |

## Hybrid logged instructions

These require **Hybrid** mode. Before executing one, Flip-16 appends a typed record to the undo log. Reverse execution consumes that record and restores the exact prior state. The default log capacity is 65,536 bytes; forward execution stops before a record that would exceed it.

| Syntax | Forward effect | Recorded information | Assembler rule |
|---|---|---|---|
| `MOV rd, rs` | `rd = rs` | previous `rd` word | `rd != rs` |
| `LOAD rd, [ra]` | `rd = mem[ra]` | previous `rd` word | `rd != ra` |
| `STORE [ra], rs` | `mem[ra] = rs` | resolved address and previous memory word | — |
| `SHR rd, amount` | logical right shift | shifted-out low bits | amount is `0..15` |
| `SHL rd, amount` | logical left shift | shifted-out high bits | amount is `0..15` |
| `AND rd, rs` | `rd = rd AND rs` | previous `rd` word | — |
| `JNZ rc, label` | if `rc != 0`, set PC to `label`; otherwise continue | actual next PC | target label must exist |

The log accounts for 8 bytes for `MOV`, `LOAD`, and `AND`; 10 bytes for `STORE`; 9 bytes for either shift; and 7 bytes for `JNZ`. These are canonical emulator-accounting sizes, not an on-chip binary encoding.

### Hybrid example

```asm
# Assemble in Hybrid mode.
ADDI  r1, 12
MOV   r2, r1
SHL   r2, 1
STORE [r0], r2
LOAD  r3, [r0]
AND   r3, r1
SHR   r3, 2
```

Stepping backward restores the memory word, every overwritten register, and the bits discarded by each shift. A strict instruction before or after these operations is reversed algebraically and adds no record.

## Branching example

```asm
# Assemble in Hybrid mode. Starts at r1 = 0.
ADDI r1, 3
loop:
  SUBI r1, 1
  JNZ  r1, loop
```

After it reaches zero, `Run backward` follows the logged branch decisions in reverse and returns to the all-zero entry state. The timeline scrubber is intentionally disabled for programs containing `JNZ`: one PC number does not identify a unique loop history.

## Common assembler errors

| Invalid source | Why it is rejected |
|---|---|
| `ADD r1, r1` | The strict operation is not one-to-one. |
| `MOV r1, r1` | It is a redundant logged no-op. |
| `LOAD r3, [r3]` | Overwriting the address register makes the source address unstable. |
| `SHR r1, 16` | Hybrid shifts accept only `0..15`; they do not wrap like rotates. |
| `JNZ r1, missing` | Every branch target must be a defined label. |
| `MOV r1, r2` in strict mode | Logged instructions require Hybrid mode. |
| `ADD r2 r1` | Commas are required: write `ADD r2, r1`. |

## Reverse execution

For a strict instruction, reverse execution decrements the PC and applies its opcode inverse. For a logged instruction, the top undo record must match the current PC; the record restores the preimage and resets the PC to where that instruction began. This LIFO discipline is why hybrid execution remains exactly reversible while allowing conventional destructive-looking operations.
