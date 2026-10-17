import { motion } from 'motion/react';
import { Close } from './icons.js';

/** What's real, what's theoretical, what's simplified. Always one click away,
 * because knowing the limits is part of the pitch. */
export function Limits({ onClose }: { onClose(): void }) {
  return (
    <motion.div className="limits-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside
        className="limits"
        role="dialog"
        aria-label="Limits and honesty notes"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inspector-head" style={{ padding: '0 0 6px' }}>
          <h3>What's real, and what isn't</h3>
          <button className="tbtn" onClick={onClose} aria-label="Close"><Close size={16} /></button>
        </div>

        <div className="limit-grid">
          <section>
            <h4 className="real">Real</h4>
            <ul>
              <li>Every step really runs backwards. Rewinding executes the exact inverse instruction using only the current registers and the program. No log, no snapshots, no replay from the start.</li>
              <li>Instructions that would destroy information (MOV, XOR r1,r1, ADD r1,r1) are refused by the assembler in reversible mode.</li>
              <li>Automated tests (<code>npm test</code>): 5,000 random instructions and 500 random programs all rewind to the exact starting state.</li>
            </ul>
          </section>

          <section>
            <h4 className="theory">Theoretical</h4>
            <ul>
              <li>The heat gauge on the ordinary CPU is illustrative, not a measurement of real chip energy.</li>
              <li>This is a simulation on an ordinary laptop, which itself erases bits constantly. It shows logical reversibility; saving the energy would need reversible (adiabatic) hardware.</li>
              <li>The ordinary CPU is a model: the same program, charged 16 bits destroyed for every register it overwrites.</li>
            </ul>
          </section>

          <section>
            <h4 className="simple">Simplified</h4>
            <ul>
              <li>The message scrambler is a toy, not real encryption.</li>
              <li>Reversible programs have no data-dependent loops yet: REPEAT counts are fixed.</li>
              <li>Hybrid mode (Playground) allows ordinary instructions and real loops, but those are undone from an undo log, so it does store history and shows exactly how much.</li>
            </ul>
          </section>

          <section>
            <h4 className="built">Built with</h4>
            <ul>
              <li>A TypeScript virtual machine with a strict reversible mode and a logged hybrid mode, unit-tested with Vitest.</li>
              <li>React and Motion for the interface, SVG for the chip view, React Three Fiber (three.js) for the 3D board, Vite to build.</li>
              <li>We used Claude Code (Anthropic) as a coding assistant while building it.</li>
            </ul>
          </section>
        </div>
      </motion.aside>
    </motion.div>
  );
}
