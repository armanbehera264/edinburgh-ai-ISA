import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Machine } from '../machine/useMachine.js';
import { LANDAUER_J_PER_BIT, logBytes } from '../core/index.js';
import { Chip, Flame, Lock, Rewind } from './icons.js';

export function OursStats() {
  return (
    <div className="stats">
      <div className="stat hero-stat"><span className="k">Bits destroyed</span><span className="v">0</span></div>
      <div className="stat good"><span className="k">History stored</span><span className="v">0 <small>bytes</small></span></div>
      <div className="stat"><span className="k">Min. heat (Landauer)</span><span className="v">0 <small>J</small></span></div>
    </div>
  );
}

export function OursLane({ m, narration, children, stats = true }: { m: Machine; narration: ReactNode; children: ReactNode; stats?: boolean }) {
  return (
    <section className={`lane ours${m.playing ? ' running' : ''}`}>
      <div className="lane-head">
        <div className="lane-title"><span className="icon"><Rewind size={15} /></span>This computer</div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={m.phase}
            className="narration"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {narration}
          </motion.div>
        </AnimatePresence>
        <div className="spacer" />
        <span className="chip ok">Can run backwards</span>
      </div>
      {children}
      {stats && <OursStats />}
    </section>
  );
}

export function LogSwitch({ m }: { m: Machine }) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={m.logging}
      onClick={() => m.setLogging(!m.logging)}
      style={{ background: 'none', border: 0 }}
    >
      <span>Let it keep a history log</span>
      <span className="knob-track">
        <motion.span className="knob" animate={{ x: m.logging ? 16 : 0 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.35 }} />
      </span>
    </button>
  );
}

export function NormalStatus({ m }: { m: Machine }) {
  return m.normalStuck
    ? <span className="chip bad"><Lock size={12} />Can't go back</span>
    : <span className="chip">{m.logging ? 'Rewinds from its log' : 'Forward only'}</span>;
}

export function StuckOverlay({ m }: { m: Machine }) {
  return (
    <AnimatePresence>
      {m.normalStuck && (
        <motion.div className="stuck-overlay" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
          <span className="msg"><Lock size={14} />It overwrote its old values. There's no way back.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function NormalStats({ m }: { m: Machine }) {
  const bits = m.normal.bitsErased;
  const bytes = logBytes(m.normal);
  return (
    <div className="stats">
      <div className="stat bad"><span className="k">Bits destroyed</span><span className="v">{bits.toLocaleString()}</span></div>
      <div className={`stat${m.logging ? ' bad' : ''}`}>
        <span className="k">History stored</span>
        <span className="v">{m.logging ? <>{bytes.toLocaleString()} <small>bytes</small></> : <small>none</small>}</span>
      </div>
      <div className="stat bad"><span className="k"><Flame size={11} style={{ verticalAlign: -1 }} /> Min. heat (Landauer)</span><span className="v"><Joules value={bits * LANDAUER_J_PER_BIT} /></span></div>
    </div>
  );
}

export function NormalLane({ m, children }: { m: Machine; children: ReactNode }) {
  return (
    <section className="lane normal">
      <div className="lane-head">
        <div className="lane-title"><span className="icon"><Chip size={15} /></span>A normal computer, same program</div>
        <div className="spacer" />
        <LogSwitch m={m} />
        <NormalStatus m={m} />
      </div>
      <div style={{ position: 'relative' }}>
        {children}
        <StuckOverlay m={m} />
      </div>
      <NormalStats m={m} />
    </section>
  );
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function Joules({ value }: { value: number }) {
  if (value === 0) return <>0 <small>J</small></>;
  const exp = Math.floor(Math.log10(value));
  const mant = value / 10 ** exp;
  const sup = (exp < 0 ? '⁻' : '') + String(Math.abs(exp)).split('').map((d) => SUP[Number(d)]).join('');
  return <>{mant.toFixed(2)} × 10{sup} <small>J</small></>;
}
