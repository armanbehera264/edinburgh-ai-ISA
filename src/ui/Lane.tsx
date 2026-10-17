import { motion, AnimatePresence } from 'motion/react';
import type { Machine } from '../machine/useMachine.js';
import { Lock } from './icons.js';

/** Instrument readout under our processor: nothing destroyed, nothing stored. */
export function OursReadout() {
  return (
    <div className="readout">
      <div><span className="silk">Bits destroyed</span><span className="v good">0</span></div>
      <div><span className="silk">History stored</span><span className="v good">0<small>B</small></span></div>
    </div>
  );
}

/** Instrument readout under the ordinary processor. */
export function NormalReadout({ m }: { m: Machine }) {
  return (
    <div className="readout">
      <div><span className="silk">Bits destroyed</span><span className="v loss">{m.normal.bitsErased.toLocaleString()}</span></div>
      <div><span className="silk">Can run backwards</span><span className="v loss">No</span></div>
    </div>
  );
}

export function LockOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="lock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <span className="msg"><Lock size={14} />It overwrote its old values. It can't go back.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
