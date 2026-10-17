import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { assemble, newState } from '../core/index.js';
import { useMachine } from '../machine/useMachine.js';
import { PRESETS } from '../programs/presets.js';
import { OursLane, OursStats, NormalLane } from '../ui/Lane.js';
import { Dock } from '../ui/Dock.js';
import { Inspector } from '../ui/Inspector.js';
import { Hero, RestoredBanner, Stagger, useAmbience } from './shared.js';

const LINE_H = 21;
const PAD_TOP = 10;

export function PlaygroundView({ inspector, closeInspector }: { inspector: boolean; closeInspector(): void }) {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [source, setSource] = useState(PRESETS[0].source);
  const seeds = useRef<number[]>(PRESETS[0].regs);

  // Only run code that assembles; while you're mid-edit, the last good version stays loaded.
  const check = useMemo(() => assemble(source), [source]);
  const [applied, setApplied] = useState(source);
  if (check.errors.length === 0 && check.program.length > 0 && applied !== source) setApplied(source);

  const makeInitial = useCallback(() => {
    const s = newState();
    seeds.current.forEach((v, r) => { s.regs[r] = v; });
    return s;
  }, []);
  const steps = useMemo(() => assemble(applied).program.length, [applied]);
  const m = useMachine(applied, makeInitial, Math.max(3, Math.min(30, steps / 3)));
  useAmbience(m);

  const atStart = m.pc === 0 && !m.playing;
  const [scrollTop, setScrollTop] = useState(0);
  const activeLine = m.lastIndex === null ? null : m.asm.sourceLines[m.lastIndex];

  const choose = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    if (m.pc !== 0) return;
    seeds.current = p.regs;
    setPresetId(id);
    setSource(p.source);
    if (p.source === applied) m.load(makeInitial());
  };

  const setReg = (r: number, raw: string) => {
    const v = Math.max(0, Math.min(65535, Number(raw.replace(/\D/g, '')) || 0));
    const next = Array.from(m.state.regs);
    next[r] = v;
    seeds.current = next;
    m.load(makeInitial());
  };

  const narration = {
    start: <>Pick a program or write one, set the registers, press <b>play</b>.</>,
    forward: <>Running. Nothing is being overwritten.</>,
    paused: <>Paused at step {m.pc}. Drag either way.</>,
    end: <>Done. Now <b>run it backwards</b>.</>,
    backward: <>Undoing, one exact inverse at a time…</>,
    restored: <>Every register is back where it started.</>,
  }[m.phase];

  return (
    <>
      <div className={`stage${inspector ? ' with-inspector' : ''}`}>
        <div className="stage-inner">
          <Hero
            eyebrow="Playground"
            title={<><span className="soft">Run any program.</span> <span className="accent">Then run it backwards.</span></>}
          >
            Write your own code with instructions that can't delete anything, or pick one to start from.
          </Hero>

          <Stagger delay={0.1}>
            <OursLane m={m} narration={narration} stats={false}>
              <div className="play-grid">
                <div>
                  <div className="editor-bar">
                    <select value={presetId} onChange={(e) => choose(e.target.value)} disabled={!atStart} aria-label="Example program">
                      {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span className="editor-hint">{atStart ? `${steps} steps` : 'Rewind to the start to edit'}</span>
                  </div>
                  <div className="editor">
                    {activeLine !== null && (
                      <div className="marker" style={{ top: PAD_TOP + (activeLine - 1) * LINE_H - scrollTop }} />
                    )}
                    <textarea
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                      disabled={!atStart}
                      spellCheck={false}
                      aria-label="Program source"
                    />
                  </div>
                  {check.errors.length > 0 && (
                    <div className="asm-errors">
                      {check.errors.slice(0, 3).map((e, i) => (
                        <div key={i}>Line {e.line}: {e.reason}{/one-to-one|unknown instruction/.test(e.reason) ? ' (that would delete information)' : ''}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                <div className="reg-grid">
                  {Array.from(m.state.regs).map((v, r) => (
                    <div key={r} className={`reg-card${m.changed.has(r) ? ' hot' : ''}`}>
                      <div className="label"><span>r{r}</span><span>{v.toString(16).padStart(4, '0')}</span></div>
                      <input
                        inputMode="numeric"
                        value={v}
                        disabled={!atStart}
                        onChange={(e) => setReg(r, e.target.value)}
                        aria-label={`Register r${r}`}
                      />
                      <div className="mini-bits">
                        {Array.from({ length: 16 }, (_, b) => <i key={b} className={(v >> (15 - b)) & 1 ? 'on' : ''} />)}
                      </div>
                    </div>
                  ))}
                </div>
                <OursStats />
                </div>
              </div>
            </OursLane>
          </Stagger>

          <Stagger delay={0.2}>
            <NormalLane m={m}>
              <div className="normal-regs" style={{ opacity: m.normalStuck ? 0.4 : 1, transition: 'opacity 300ms' }}>
                {Array.from(m.normal.machine.regs).map((v, r) => (
                  <div key={r} className="scratch" style={{ marginTop: 0 }}>
                    <div className="cell" style={{ width: '100%' }}><span>r{r}</span>{v}</div>
                  </div>
                ))}
              </div>
            </NormalLane>
          </Stagger>
        </div>
      </div>
      <RestoredBanner show={m.phase === 'restored'}>
        Back to the start <small>0 bytes of history used</small>
      </RestoredBanner>
      <Dock m={m} startLabel="Start" endLabel="End" inspectorOpen={inspector} />
      <AnimatePresence>
        {inspector && <Inspector m={m} source={applied} onClose={closeInspector} />}
      </AnimatePresence>
    </>
  );
}
