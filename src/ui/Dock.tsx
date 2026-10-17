import { useEffect } from 'react';
import type { Machine } from '../machine/useMachine.js';
import { Scrubber, type Mark } from './Scrubber.js';
import { Pause, Play, PlayBack, StepBack, StepFwd, ToEnd, ToStart } from './icons.js';

interface Props {
  m: Machine;
  marks?: Mark[];
  startLabel: string;
  endLabel: string;
  inspectorOpen: boolean;
}

/** Floating transport: rewind, step, play, and the big timeline. */
export function Dock({ m, marks, startLabel, endLabel, inspectorOpen }: Props) {
  // Keyboard: space play/pause, ←/→ step, shift+←/→ play to either end.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [role="slider"]')) return;
      if (e.key === ' ') { e.preventDefault(); m.toggle(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? m.play('backward') : m.step('backward'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? m.play('forward') : m.step('forward'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m]);

  const atStart = m.pc === 0;
  const atEnd = m.pc >= m.length;
  const dirWord = m.playing === 'backward' || (!m.playing && m.direction === 'backward') ? 'Backwards' : 'Forwards';

  return (
    <div className={`dock${inspectorOpen ? ' with-inspector-dock' : ''}`}>
      <div className="dock-row">
        <div className="transport">
          <button className="tbtn" onClick={() => m.play('backward')} disabled={atStart} aria-label="Rewind to the start" title="Rewind (shift ←)">
            <ToStart />
          </button>
          <button className="tbtn" onClick={() => m.step('backward')} disabled={atStart} aria-label="Step backward" title="Step back (←)">
            <StepBack />
          </button>
          {m.playing ? (
            <button className="tbtn play" onClick={m.pause} aria-label="Pause" title="Pause (space)"><Pause size={22} /></button>
          ) : atEnd ? (
            <button className="tbtn play" onClick={() => m.play('backward')} aria-label="Play backwards" title="Play backwards (space)"><PlayBack size={22} /></button>
          ) : (
            <button className="tbtn play" onClick={() => m.play('forward')} aria-label="Play" title="Play (space)"><Play size={22} /></button>
          )}
          <button className="tbtn" onClick={() => m.step('forward')} disabled={atEnd} aria-label="Step forward" title="Step (→)">
            <StepFwd />
          </button>
          <button className="tbtn" onClick={() => m.play('forward')} disabled={atEnd} aria-label="Play to the end" title="Play to end (shift →)">
            <ToEnd />
          </button>
        </div>
        <div className="dock-meta">
          <span className="big">Step {m.pc} <span style={{ color: 'var(--text-3)' }}>of {m.length}</span></span>
          <span className="small">{m.playing ? <span className="dir" style={{ color: 'var(--dir)' }}>Running {dirWord.toLowerCase()}</span> : 'Drag the timeline either way'}</span>
        </div>
        <div className="dock-right">
          <div className="history-pill" title="This machine keeps no log of past states. Going backwards uses only the current state and the program.">
            <span className="k">History stored</span>
            <span className="v">0 bytes</span>
          </div>
        </div>
      </div>
      <Scrubber value={m.pc} max={m.length} marks={marks} onSeek={m.seek} onScrubStart={m.pause} startLabel={startLabel} endLabel={endLabel} />
    </div>
  );
}
