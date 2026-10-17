import { motion } from 'motion/react';
import type { Direction } from '../machine/useMachine.js';
import { glyphFor, isPrintable } from '../programs/cipher.js';

interface Props {
  bytes: number[];
  size: 'big' | 'small';
  /** Registers changed by the last step: their two tiles light up. */
  hotRegs?: ReadonlySet<number>;
  direction: Direction;
  /** Treat letters as "plain" only at the very start; afterwards everything is ciphertext. */
  scrambled: boolean;
  caretAt?: number | null;
  dead?: boolean;
  labels?: boolean;
}

/** Sixteen character tiles: the message, two letters per register.
 * Each tile flips when its byte changes, in the direction time is running. */
export function Tiles({ bytes, size, hotRegs, direction, scrambled, caretAt = null, dead = false, labels = false }: Props) {
  return (
    <div className={`tiles ${size}`}>
      {bytes.map((b, i) => {
        const hot = hotRegs?.has(Math.floor(i / 2)) ?? false;
        const cls = ['tile', hot && 'hot', scrambled && 'scrambled', b === 32 && !scrambled && 'space', dead && 'dead']
          .filter(Boolean).join(' ');
        return (
          <div key={i} className={cls} style={{ marginLeft: i % 2 === 0 && i > 0 ? 'calc(var(--gap) * 0.6)' : undefined }}>
            <motion.span
              key={b}
              className="glyph"
              initial={{ rotateX: direction === 'forward' ? -100 : 100, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
              style={!isPrintable(b) ? { fontWeight: 500 } : undefined}
            >
              {glyphFor(b)}
            </motion.span>
            {caretAt === i && <span className="caret" />}
          </div>
        );
      })}
      {labels && Array.from({ length: 8 }, (_, r) => <span key={`l${r}`} className="reg-label">r{r}</span>)}
    </div>
  );
}
