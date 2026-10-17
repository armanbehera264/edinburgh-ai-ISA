import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Machine } from '../machine/useMachine.js';
import { Check } from '../ui/icons.js';

/** Tint the whole page by the direction time is running. */
export function useAmbience(m: Machine) {
  const dir = m.playing ?? m.direction;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.dir = dir;
    root.dataset.phase = m.phase;
  }, [dir, m.phase]);
}

export function Hero({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <motion.header
      className="hero"
      initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ type: 'spring', bounce: 0, duration: 0.7 }}
    >
      <span className="eyebrow"><span className="dot" />{eyebrow}</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
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
            initial={{ opacity: 0, y: -16, scale: 0.94, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, scale: 0.97, filter: 'blur(4px)' }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
          >
            <span className="check"><Check size={16} /></span>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Stagger({ children, delay = 0.08 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.6, delay }}
    >
      {children}
    </motion.div>
  );
}
