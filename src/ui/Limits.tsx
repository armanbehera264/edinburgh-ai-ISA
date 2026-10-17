import { motion } from 'motion/react';
import { Close } from './icons.js';

/** "What's real, what's theoretical, what's cached." Always one click away,
 * because being honest about limits is part of the pitch. */
export function Limits({ onClose }: { onClose(): void }) {
  return (
    <motion.div
      className="limits-scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        className="limits"
        role="dialog"
        aria-label="Limits and honesty notes"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inspector-head" style={{ padding: '0 0 6px' }}>
          <h3>What's real, and what isn't</h3>
          <button className="tbtn" onClick={onClose} aria-label="Close"><Close size={16} /></button>
        </div>

        <div className="limit-grid">
          <section>
            <span className="chip ok">Real</span>
            <ul>
              <li>Every step really runs backwards. Rewinding executes the exact inverse instruction using only the current registers and the program. No log, no snapshots, no replay from the start.</li>
              <li>Illegal "delete" instructions (MOV, XOR r1,r1, ADD r1,r1) are refused by the assembler.</li>
              <li>28 automated tests (<code>npm test</code>), including 5,000 random instructions and 500 random programs that all rewind to the exact starting state.</li>
            </ul>
          </section>

          <section>
            <span className="chip dir">Theoretical</span>
            <ul>
              <li>The heat figures use Landauer's limit: the minimum energy needed to erase one bit, kT·ln 2 ≈ 2.9×10⁻²¹ J at room temperature. It's a physical floor, not a measurement. Real chips use far more energy than this per operation.</li>
              <li>This is a simulation running on an ordinary laptop, which itself erases bits all the time. We show logical reversibility. Saving the energy would need reversible (adiabatic) hardware.</li>
              <li>The "normal computer" is a model: the same program, charged 16 bits destroyed for every register it overwrites.</li>
            </ul>
          </section>

          <section>
            <span className="chip">Cached or simplified</span>
            <ul>
              <li>The Claude compiler can use programs Claude wrote earlier, so the demo works offline. Saved programs are marked "Saved program from Claude" and are re-checked live every time.</li>
              <li>"Verified" means correct on 20 test inputs (including 0 and 65535), scratch registers clean, and an exact rewind. That's thorough testing, not a formal proof.</li>
              <li>The secret-message cipher is a toy, not real encryption.</li>
              <li>No loops or branches that depend on data yet: REPEAT counts are fixed. Reversible IF/FI with exit assertions (like the Janus language) is the next step.</li>
            </ul>
          </section>

          <section>
            <span className="chip">Built with</span>
            <ul>
              <li>TypeScript VM (Armaan's core, unit-tested) · React + Motion for the UI · React Three Fiber for the optional 3D mode · Vite.</li>
              <li>Claude (Opus 5.5) is the in-app compiler. We also used Claude Code to help build the app.</li>
            </ul>
          </section>
        </div>
      </motion.aside>
    </motion.div>
  );
}
