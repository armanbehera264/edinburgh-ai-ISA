import { lazy, Suspense, type ReactNode } from 'react';
import type { Instr } from '../core/index.js';
import type { Machine } from '../machine/useMachine.js';
import { glyphFor, registerBytes } from '../programs/cipher.js';
import { ChipSvg } from './ChipSvg.js';
import { LockOverlay, NormalReadout, OursReadout } from './Lane.js';
import { Narration } from '../views/shared.js';

// The 3D board only downloads when someone switches to it.
const Board3D = lazy(() => import('../three/Board3D.js').then((mod) => ({ default: mod.Board3D })));

/** What the registers spell, as a small character display. */
function Display({ bytes, scrambled, caretAt = null, dead = false }: { bytes: number[]; scrambled: boolean; caretAt?: number | null; dead?: boolean }) {
  return (
    <div className={`lcd${scrambled ? ' scrambled' : ''}${dead ? ' dead' : ''}`}>
      {bytes.map((b, i) => (
        <span key={i} className={`cell${i % 2 === 1 ? ' pair-end' : ''}`}>
          {b === 32 && !scrambled ? ' ' : glyphFor(b)}
          {caretAt === i && <i className="caret" />}
        </span>
      ))}
    </div>
  );
}

interface Props {
  m: Machine;
  view: 'chip' | '3d';
  narration: ReactNode;
  caretAt: number | null;
  /** The hidden text input used for typing the message. */
  input: ReactNode;
}

/** Both processors on one circuit board, running the same program side by side. */
export function ChipBoard({ m, view, narration, caretAt, input }: Props) {
  const dir = m.playing ?? m.direction;
  const instr = m.lastIndex === null ? null : (m.program[m.lastIndex] as Instr);
  const normalPc = m.normal.machine.pc;
  const normalInstr = normalPc > 0 ? (m.program[normalPc - 1] as Instr) : null;
  // Bits the ordinary chip will have destroyed by the end of the program.
  const totalBits = m.program.reduce((n, i) => n + (i.op === 'SWAP' || i.op === 'EXCH' ? 32 : 16), 0);
  const heat = Math.min(1, m.normal.bitsErased / Math.max(1, totalBits));

  const oursChip = (
    <ChipSvg variant="ours" regs={m.state.regs} hot={m.changed} instr={instr} stepKey={`${m.pc}-${dir}`} direction={dir} />
  );
  const normalChip = (
    <div style={{ position: 'relative' }}>
      <ChipSvg
        variant="normal"
        regs={m.normal.machine.regs}
        hot={new Set()}
        instr={normalInstr}
        stepKey={`n${normalPc}`}
        direction="forward"
        heat={heat}
        pc={normalPc}
        dim={m.normalStuck}
      />
      <LockOverlay show={m.normalStuck} />
    </div>
  );

  return (
    <section className="board">
      <div className="board-head">
        <Narration m={m}>{narration}</Narration>
        <span className="silk">Same program · two processors</span>
      </div>

      <div className="board-grid">
        <div className="unit ours">
          <div className="unit-head">
            <span className="silk">U1</span>
            <span className="name">TENET</span>
            <span className="silk">reversible</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Display bytes={registerBytes(m.state.regs)} scrambled={m.pc > 0} caretAt={caretAt} />
            {input}
          </div>
        </div>

        <div className="unit normal">
          <div className="unit-head">
            <span className="silk">U2</span>
            <span className="name">Ordinary CPU</span>
            <span className="silk">forward only</span>
          </div>
          <Display bytes={registerBytes(m.normal.machine.regs)} scrambled={normalPc > 0} dead={m.normalStuck} />
        </div>

        {view === 'chip' ? (
          <>
            <div className="unit">{oursChip}</div>
            <div className="unit">{normalChip}</div>
          </>
        ) : (
          <div className="span" style={{ position: 'relative' }}>
            <Suspense fallback={<div className="scene" style={{ height: 300 }}><div className="scene-loading">loading 3D board…</div></div>}>
              <Board3D
                ours={m.state.regs}
                normal={m.normal.machine.regs}
                hot={m.changed}
                instr={instr}
                normalInstr={normalInstr}
                stepKey={m.pc}
                normalPc={normalPc}
                direction={dir}
                playing={m.playing !== null}
                phase={m.phase}
                stuck={m.normalStuck}
                heat={heat}
              />
            </Suspense>
            <div style={{ position: 'absolute', top: 8, left: '50%', right: 0, bottom: 0, pointerEvents: 'none' }}>
              <LockOverlay show={m.normalStuck} />
            </div>
          </div>
        )}

        <div className="unit"><OursReadout /></div>
        <div className="unit"><NormalReadout m={m} /></div>
      </div>
    </section>
  );
}
