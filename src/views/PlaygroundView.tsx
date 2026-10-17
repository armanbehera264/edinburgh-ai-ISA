import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { assemble, isStrictInstr, newState, type AssemblyMode, type Instr } from '../core/index.js';
import { useMachine } from '../machine/useMachine.js';
import { PRESETS } from '../programs/presets.js';
import { ChipSvg } from '../ui/ChipSvg.js';
import { Dock } from '../ui/Dock.js';
import { Inspector } from '../ui/Inspector.js';
import { Hero, Narration, RestoredBanner, useAmbience } from './shared.js';

const LINE_H = 21;
const PAD_TOP = 10;

export function PlaygroundView({ inspector, closeInspector }: { inspector: boolean; closeInspector(): void }) {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [mode, setMode] = useState<AssemblyMode>(PRESETS[0].mode);
  const [source, setSource] = useState(PRESETS[0].source);
  const seeds = useRef<number[]>(PRESETS[0].regs);

  // Only run code that assembles; while you're mid-edit, the last good version stays loaded.
  const check = useMemo(() => assemble(source, { mode }), [source, mode]);
  const [applied, setApplied] = useState({ source, mode });
  if (check.errors.length === 0 && check.program.length > 0 && (applied.source !== source || applied.mode !== mode)) {
    setApplied({ source, mode });
  }

  const makeInitial = useCallback(() => {
    const s = newState();
    seeds.current.forEach((v, r) => { s.regs[r] = v; });
    return s;
  }, []);
  const m = useMachine(applied.source, makeInitial, { mode: applied.mode, compare: false, stepsPerSecond: 6 });
  useAmbience(m);

  // Scale the history bar to the most the log has held during this run.
  const peak = useRef(0);
  if (m.pc === 0) peak.current = 0;
  peak.current = Math.max(peak.current, m.historyBytes);

  const atStart = m.pc === 0 && !m.playing;
  const [scrollTop, setScrollTop] = useState(0);
  const instr = m.lastIndex === null ? null : (m.program[m.lastIndex] as Instr);
  const logged = instr !== null && !isStrictInstr(instr);
  const activeLine = m.lastIndex === null ? null : m.asm.sourceLines[m.lastIndex];
  const dir = m.playing ?? m.direction;

  const choose = (id: string) => {
    if (m.pc !== 0) return;
    const p = PRESETS.find((x) => x.id === id)!;
    seeds.current = p.regs;
    setPresetId(id);
    setMode(p.mode);
    setSource(p.source);
    if (p.source === applied.source && p.mode === applied.mode) m.load(makeInitial());
  };

  const setReg = (r: number, raw: string) => {
    const v = Math.max(0, Math.min(65535, Number(raw.replace(/\D/g, '')) || 0));
    const next = Array.from(m.state.regs);
    next[r] = v;
    seeds.current = next;
    m.load(makeInitial());
  };

  const narration = {
    start: <>Pick a program or write your own, then press <b>play</b>.</>,
    forward: logged ? <>Ordinary instruction: what it overwrote goes into the log.</> : <>Reversible instruction: nothing to save.</>,
    paused: <>Paused at step {m.pc}. Drag either way.</>,
    end: <>Done. Now <b>run it backwards</b>.</>,
    backward: logged ? <>Restoring that one from the log.</> : <>Undoing with the exact opposite instruction.</>,
    restored: <>Back to the start{m.mode === 'hybrid' ? ', and the log has been used up.' : ', with nothing stored at all.'}</>,
  }[m.phase];

  const modeSwitch = (
    <div className="seg" role="group" aria-label="Instruction set">
      <button aria-pressed={mode === 'strict'} disabled={!atStart} onClick={() => setMode('strict')}>Reversible instructions</button>
      <button aria-pressed={mode === 'hybrid'} disabled={!atStart} onClick={() => setMode('hybrid')}>Ordinary instructions (with undo log)</button>
    </div>
  );

  return (
    <>
      <div className={`stage${inspector ? ' with-inspector' : ''}`}>
        <div className="stage-inner">
          <Hero
            eyebrow="Playground"
            title={<><span className="soft">Run any program.</span> <span className="accent">Then run it backwards.</span></>}
            aside={modeSwitch}
          >
            Reversible instructions rewind for free. Ordinary ones (copy, shift, AND, jumps) must save what they overwrite, and the meter shows exactly how much.
          </Hero>

          <section className="board">
            <div className="board-head">
              <Narration m={m}>{narration}</Narration>
              <span className="silk">{m.mode === 'strict' ? 'reversible mode' : 'hybrid mode · undo log on'}</span>
            </div>

            <div className="lab">
              <div>
                <div className="editor-bar">
                  <select value={presetId} onChange={(e) => choose(e.target.value)} disabled={!atStart} aria-label="Example program">
                    {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span className="editor-hint">{atStart ? `${m.length} steps` : 'rewind to the start to edit'}</span>
                </div>
                {(() => {
                  const p = PRESETS.find((x) => x.id === presetId);
                  if (!p || p.source !== source) return null;
                  return (
                    <p className="preset-note">
                      <span className={`tag ${p.mode === 'strict' ? 'rev' : 'ord'}`}>{p.mode === 'strict' ? 'reversible' : 'ordinary'}</span>
                      {p.description}
                    </p>
                  );
                })()}
                <div className="editor">
                  {activeLine !== null && (
                    <div className={`marker${logged ? ' logged' : ''}`} style={{ top: PAD_TOP + (activeLine - 1) * LINE_H - scrollTop }} />
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
                    {check.errors.slice(0, 2).map((e, i) => (
                      <div key={i}>
                        Line {e.line}: {e.reason}
                        {mode === 'strict' && /unknown instruction/.test(e.reason) ? '. It destroys information, so reversible mode refuses it. Switch to "Ordinary instructions (with undo log)" to run it.' : ''}
                      </div>
                    ))}
                  </div>
                )}
                <div className="section-title" style={{ margin: '12px 0 6px' }}>Starting values</div>
                <div className="seed-row">
                  {Array.from(m.state.regs).map((v, r) => (
                    <label key={r} className={`seed${m.changed.has(r) ? ' hot' : ''}`}>
                      <span>r{r}</span>
                      <input inputMode="numeric" value={v} disabled={!atStart} onChange={(e) => setReg(r, e.target.value)} aria-label={`Register r${r}`} />
                    </label>
                  ))}
                </div>
              </div>

              <div className="unit">
                <div className="unit-head">
                  <span className="silk">U1</span>
                  <span className="name">TENET</span>
                  <span className="silk">{m.mode === 'strict' ? 'reversible' : 'reversible + undo log'}</span>
                </div>
                <ChipSvg variant="ours" regs={m.state.regs} hot={m.changed} instr={instr} stepKey={`${m.pc}-${dir}`} direction={dir} />
                <div className="cost-meter">
                  <div className="row">
                    <span className="silk">History needed to rewind</span>
                    <span className={`v ${m.historyBytes > 0 ? 'loss' : 'good'}`}>{m.historyBytes} B</span>
                  </div>
                  <div className="bar"><i style={{ width: `${peak.current ? (m.historyBytes / peak.current) * 100 : 0}%` }} /></div>
                  <div className="legend">
                    <span><i style={{ background: 'var(--forward)' }} />reversible: free</span>
                    <span><i style={{ background: 'var(--loss)' }} />ordinary: logged</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <RestoredBanner show={m.phase === 'restored'}>
        Back to the start <small>{m.mode === 'strict' ? '0 bytes of history used' : 'undo log emptied'}</small>
      </RestoredBanner>
      <Dock m={m} startLabel="start" endLabel="end" inspectorOpen={inspector} />
      <AnimatePresence>
        {inspector && <Inspector m={m} source={applied.source} onClose={closeInspector} />}
      </AnimatePresence>
    </>
  );
}
