## Inspiration

Every computer ever built quietly assumes that time only moves forwards. Each step overwrites a register, and the old value is gone forever. Billions of times a second, information is destroyed, so there's no way back.

The challenge asked, "What if they worked in reverse?" We took that literally. What if a computer could never destroy anything, and so could run any program backwards to its exact starting point, with no saved history?

There's a real reason this matters. Physics (Landauer's principle) puts a minimum energy cost on destroying information. A computer that never destroys anything is the theoretical route to near-zero-energy chips, and quantum computers already have to work this way.

## What it does

**TENET is a computer that runs in reverse.**

- **Demo:** type a message and press play. The program scrambles it.
  - An ordinary CPU runs the same program side by side on a 3D circuit board. You can watch it destroy bits: sparks fly into its heat sink and a counter climbs.
  - Then you drag the timeline back. TENET's message reappears exactly, while the ordinary CPU is stuck because its old values are gone.
  - There is no decryption program and no undo log: **History stored: 0 bytes.** We just ran time backwards.
- **Playground:** write or pick any program, run it forwards, then backwards.
  - Switch to *ordinary instructions* (copy, shift, AND, jumps) and a meter shows exactly how many bytes of history a normal computer must save to undo them.
  - Swapping two numbers the normal way needs 32 bytes saved. The reversible way needs 0.
- **Limits panel:** always one key away. It says plainly what's real, what's theoretical and what's simplified.

## How we built it

- **Our own CPU, FLIP-16, in TypeScript.**
  - 8 registers with 16-bit arithmetic. Every instruction has an exact inverse: ADD↔SUB, ROL↔ROR, while XOR and SWAP undo themselves.
  - Anything that destroys data, like MOV or `XOR r1, r1`, is refused by the assembler.
  - Stepping backwards runs the inverse instruction using only the current registers and the program, never a stored copy.
- **Hybrid mode:** ordinary instructions are allowed, but each one pushes exactly the bytes it destroys onto an undo log. That lets us measure the cost of "normal" computing precisely.
- **Vitest:** 5,000 random instructions and 500 random programs all rewind to the exact starting state.
- **React + Motion** for the interface. **SVG** for the flat chip view, with one LED per bit.
- **three.js** (React Three Fiber + Drei) for the rotatable 3D circuit board. It has per-bit LEDs, pulses along the traces (amber forwards, cyan backwards), and a heat sink with sparks on the ordinary CPU. It runs at 60 fps.
- **Vite**, running entirely in the browser: no server, no API keys.
- We used **Claude Code** (Anthropic) as a coding assistant while building it.

## Challenges we ran into

- **Programming without overwriting.** Without MOV, even "copy a value" or "clear a register" needs a different approach. We had to rethink simple programs, using things like XOR swaps and un-computing scratch values back to zero.
- **A scrambler that undoes itself.** We built the message cipher only from invertible steps (add, rotate, XOR) so that it would also run perfectly in reverse.
- **Being honest about the cost.** For ordinary instructions, we had to count exactly what each one destroys (a MOV costs 8 bytes, a jump 7) so the comparison is real, not hand-waved.
- **Making an abstract idea visible.** "Information is destroyed" is invisible on a normal computer. Turning it into something you can see took many design rounds: two chips side by side, sparks for lost bits, and a CPU that visibly locks when it can't rewind.
- **Cutting scope.** We first built a feature where Claude rewrote programs into reversible form. We cut it to keep the demo focused on the one idea that matters.

## Accomplishments that we're proud of

- It truly runs backwards, with zero stored history. The tests prove it on thousands of random programs, not just our demo.
- The moment your message reappears while the ordinary CPU is stuck makes the idea click in seconds, with no physics background needed.
- The Playground puts an exact number on how much history ordinary computing has to throw away or store.
- A smooth 3D circuit board running at 60 fps in the browser.

## What we learned

- Reversibility isn't a trick bolted on afterwards. It's a constraint you design the whole instruction set around, and it changes how you write even simple programs.
- Most of what a normal CPU does is destroy information it could have kept.
- The difference between *undo* (keeping a history) and *reversibility* (needing none) is subtle but fundamental.
- Being upfront about limits makes a demo stronger, not weaker.

## What's next for Tenet

- **Reversible if-statements and loops** that depend on data, using exit assertions as in reversible languages like Janus, so more programs need zero history.
- **A compiler** that turns ordinary code into reversible code automatically, cleaning up its scratch work (Bennett's trick).
- **Bigger demos:** reversible sorting, hashing and invertible neural-network layers.
- **Real hardware:** mapping FLIP-16 onto reversible logic gates and, eventually, the adiabatic circuits that could actually deliver the energy savings.
