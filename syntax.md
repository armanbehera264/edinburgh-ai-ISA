# Flip-16 Assembly Syntax

## Source format

Flip-16 is a straight-line reversible assembly language. Write one instruction per line. Instruction and register names are case-insensitive; the formatter displays them in uppercase/lowercase canonical form.

```asm
; This is a comment.
ADD r2, r1       // This is also a comment.
ROL r2, 3
```

- Comments begin with `;` or `//` and continue to the end of the line.
- Operands are separated with commas.
- Whitespace around an opcode, operands, commas, and braces is allowed.
- Blank lines are ignored.
- Registers are `r0` through `r7`. There is no special zero register.
- Decimal literals, signed decimal literals, and hexadecimal literals such as `0x00ff` are accepted where an immediate is expected.
- Values use 16-bit modular arithmetic. For example, `-1` is assembled as `0xffff`.

## Program structure

Flip-16 MVP programs have no labels, jumps, runtime loops, loads, or stores. The program counter advances one instruction at a time. Use a literal `REPEAT` block for fixed iteration counts:

```asm
REPEAT 8 {
  ADD r2, r1
  SWAP r1, r2
}
```

`REPEAT` counts must be non-negative decimal literals. Blocks are expanded by the assembler before execution; nested `REPEAT` blocks are not supported in the MVP. The maximum expanded program is 65,535 instructions.

Do not write a bare closing brace. Each `}` must close a preceding `REPEAT … {` block.

## Instructions

All arithmetic is modulo 65536. Every legal instruction has an exact inverse.

| Syntax | Effect | Inverse | Legality rule |
|---|---|---|---|
| `ADD rd, rs` | `rd = rd + rs` | `SUB rd, rs` | `rd` and `rs` must differ |
| `SUB rd, rs` | `rd = rd - rs` | `ADD rd, rs` | `rd` and `rs` must differ |
| `ADDI rd, imm` | `rd = rd + imm` | `SUBI rd, imm` | none |
| `SUBI rd, imm` | `rd = rd - imm` | `ADDI rd, imm` | none |
| `XOR rd, rs` | `rd = rd XOR rs` | itself | `rd` and `rs` must differ |
| `NOT rd` | bitwise complement of `rd` | itself | none |
| `NEG rd` | two's-complement negation of `rd` | itself | none |
| `ROL rd, amount` | rotate `rd` left | `ROR rd, amount` | amount is a non-negative integer |
| `ROR rd, amount` | rotate `rd` right | `ROL rd, amount` | amount is a non-negative integer |
| `SWAP ra, rb` | exchange `ra` and `rb` | itself | `ra` and `rb` must differ |
| `EXCH rd, [ra]` | exchange `rd` and the word at memory address `ra` | itself | `rd` and `ra` must differ |
| `CADD rd, rs, rc` | if `rc != 0`, add `rs` to `rd` | `CSUB rd, rs, rc` | `rd` differs from `rs` and `rc` |
| `CSUB rd, rs, rc` | if `rc != 0`, subtract `rs` from `rd` | `CADD rd, rs, rc` | `rd` differs from `rs` and `rc` |
| `CSWAP ra, rb, rc` | if `rc != 0`, exchange `ra` and `rb` | itself | all three registers differ |

Rotation amounts are reduced modulo 16, so `ROL r1, 16` has the same value effect as `ROL r1, 0`.

## Examples

### Fibonacci

With `(r1, r2)` initialized to consecutive Fibonacci values, each iteration advances the pair once:

```asm
REPEAT 8 {
  ADD r2, r1
  SWAP r1, r2
}
```

### Reversible memory access

`EXCH` is the only memory-transfer instruction. It retains both values by swapping them:

```asm
EXCH r3, [r4]
```

### Conditional operation

The condition register is read but never modified:

```asm
CADD r0, r1, r2  ; Add r1 into r0 only when r2 is non-zero.
```

## Common assembler errors

| Invalid source | Why it is rejected |
|---|---|
| `ADD r1, r1` | Doubling modulo 65536 is not one-to-one. |
| `XOR r1, r1` | It destroys the value by always producing zero. |
| `EXCH r3, [r3]` | The address register would be overwritten, so the inverse could not find the exchanged memory word. |
| `CSWAP r1, r2, r1` | The operation could modify its own condition register. |
| `}` | A closing brace must match an open `REPEAT` block. |
| `ADD r2 r1` | Commas are required between operands: write `ADD r2, r1`. |

## Reverse execution

The editor stores source in forward order. Step forward executes `program[pc]` and then increments the PC. Step backward first decrements the PC, then runs the inverse of that preceding instruction. A valid program can therefore return to its exact initial register, memory, and PC state without an undo log.
