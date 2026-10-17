import { useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { assemble, newState } from '../core/index.js';
import { useMachine } from '../machine/useMachine.js';
import { X_REG, Y_REG, Z_REG, SCRATCH_REGS } from '../compiler/verify.js';
import { OursLane, NormalLane } from '../ui/Lane.js';
import { Dock } from '../ui/Dock.js';
import { Inspector } from '../ui/Inspector.js';
import { Hero, RestoredBanner, Stagger, useAmbience } from './shared.js';
import type { CompiledProgram } from './ClaudeView.js';

function inputs(x: number, y: number) {
  const s = newState();
  s.regs[X_REG] = x;
  s.regs[Y_REG] = y;
  return s;
}

export function FormulaView({ program, inspector, closeInspector }: { program: CompiledProgram; inspector: boolean; closeInspector(): void }) {
  const makeInitial = useCallback(() => inputs(1234, 567), []);
  // Aim for a ~3 second run however long the program is.
  const steps = assemble(program.source).program.length;
  const m = useMachine(program.source, makeInitial, Math.max(2.5, Math.min(40, steps / 3)));
  useAmbience(m);

  const regs = m.state.regs;
  const editable = m.pc === 0 && !m.playing;
  const setInput = (reg: number, raw: string) => {
    const v = Math.max(0, Math.min(65535, Number(raw.replace(/\D/g, '')) || 0));
    const s = inputs(regs[X_REG], regs[Y_REG]);
    s.regs[reg] = v;
    m.load(s);
  };

  const narration = {
    start: <>Pick any <b>x</b> and <b>y</b>, then press play.</>,
    forward: <>Working in the scratch registers…</>,
    paused: <>Watch the scratch registers fill up and empty again.</>,
    end: <>z is computed and every scratch register is back to 0.</>,
    backward: <>Un-computing…</>,
    restored: <>z is back to 0. x and y never changed.</>,
  }[m.phase];

  const card = (label: string, reg: number, input = false) => (
    <div className={`number-card${m.changed.has(reg) ? ' hot' : ''}`}>
      <div className="label"><span>{label}</span><code>r{reg}</code></div>
      {input ? (
        <input
          className="value" inputMode="numeric" value={regs[reg]} disabled={!editable}
          onChange={(e) => setInput(reg, e.target.value)} aria-label={`${label} input`}
        />
      ) : <div className="value" style={reg === Z_REG ? { color: 'var(--dir)' } : undefined}>{regs[reg].toLocaleString()}</div>}
    </div>
  );

  return (
    <>
      <div className={`stage${inspector ? ' with-inspector' : ''}`}>
        <div className="stage-inner">
          <Hero eyebrow="Compiled by Claude · verified by the machine" title={<span className="accent">{program.expression}</span>}>
            Bennett's trick, live: the program borrows scratch space, uses it, then gives every bit back.
          </Hero>
          <Stagger delay={0.1}>
            <OursLane m={m} narration={narration}>
              <div className="numbers">
                {card('x', X_REG, true)}
                {card('y', Y_REG, true)}
                {card('z', Z_REG)}
              </div>
              <div className="scratch">
                {SCRATCH_REGS.map((r) => (
                  <div key={r} className={`cell${regs[r] ? ' busy' : ' zero'}`}>
                    <span>scratch r{r}</span>{regs[r]}
                  </div>
                ))}
              </div>
            </OursLane>
          </Stagger>
          <Stagger delay={0.2}>
            <NormalLane m={m}>
              <div className="scratch" style={{ marginTop: 0, opacity: m.normalStuck ? 0.4 : 1 }}>
                {[X_REG, Y_REG, Z_REG, ...SCRATCH_REGS].map((r) => (
                  <div key={r} className="cell"><span>r{r}</span>{m.normal.machine.regs[r]}</div>
                ))}
              </div>
            </NormalLane>
          </Stagger>
        </div>
      </div>
      <RestoredBanner show={m.phase === 'restored'}>
        Back to the inputs <small>0 bytes of history used</small>
      </RestoredBanner>
      <Dock m={m} startLabel="Inputs" endLabel="Answer in z" inspectorOpen={inspector} />
      <AnimatePresence>
        {inspector && <Inspector m={m} source={program.source} onClose={closeInspector} />}
      </AnimatePresence>
    </>
  );
}
