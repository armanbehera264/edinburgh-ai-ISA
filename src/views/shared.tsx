import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Machine } from '../machine/useMachine.js';
import { Check } from '../ui/icons.js';

/** Tint the interface by the direction time is running. */
export function useAmbience(m: Machine) {
  const dir = m.playing ?? m.direction;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.dir = dir;
    root.dataset.phase = m.phase;
  }, [dir, m.phase]);
}

export function Hero({ eyebrow, title, children, aside }: { eyebrow: string; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <motion.header
      className="hero"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
    >
      <span className="eyebrow"><span className="dot" />{eyebrow}</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
      {aside && <div className="aside">{aside}</div>}
    </motion.header>
  );
}

export function RestoredBanner({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className="banner-wrap">
      <AnimatePresence>
        {show && (
          <motion.div
            className="banner"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
          >
            <span className="check"><Check size={14} /></span>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Narration({ m, children }: { m: Machine; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={m.phase}
        className="narration"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
