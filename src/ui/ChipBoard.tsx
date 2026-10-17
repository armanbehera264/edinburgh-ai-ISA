import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { InstrBody } from '../core/index.js';
import { logBytes } from '../core/index.js';
import type { Machine } from '../machine/useMachine.js';
import { glyphFor, registerBytes } from '../programs/cipher.js';
import { ChipSvg } from './ChipSvg.js';
import { LogSwitch, NormalStats, NormalStatus, OursStats, StuckOverlay } from './Lane.js';
import { Chip, Rewind } from './icons.js';

/** A two-line display above each chip showing what the registers spell. */
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
  narration: ReactNode;
  caretAt: number | null;
  /** The hidden text input used for typing the message. */
  input: ReactNode;
}

/** Both computers on one circuit board, running the same program side by side. */
export function ChipBoard({ m, narration, caretAt, input }: Props) {
  const dir = m.playing ?? m.direction;
  const instr = m.lastIndex === null ? null : (m.program[m.lastIndex] as InstrBody);
  const normalPc = m.normal.machine.pc;
  const normalInstr = normalPc > 0 ? (m.program[normalPc - 1] as InstrBody) : null;
  // Bits the normal chip will have destroyed by the end of the program.
  const totalBits = m.program.reduce((n, i) => n + (i.op === 'SWAP' || i.op === 'EXCH' ? 32 : 16), 0);

  return (
    <section className={`lane board${m.playing ? ' running' : ''}`}>
      <div className="lane-head">
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
        <span className="board-label">Same program · two processors</span>
      </div>

      <div className="board-grid">
        <div className="board-col ours">
          <div className="col-head">
            <div className="lane-title"><span className="icon"><Rewind size={15} /></span>This computer</div>
            <div className="spacer" />
            <span className="chip ok">Can run backwards</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Display bytes={registerBytes(m.state.regs)} scrambled={m.pc > 0} caretAt={caretAt} />
            {input}
          </div>
          <ChipSvg
            variant="ours"
            regs={m.state.regs}
            hot={m.changed}
            instr={instr}
            stepKey={`${m.pc}-${dir}`}
            direction={dir}
          />
          <OursStats />
        </div>

        <div className="board-col normal">
          <div className="col-head">
            <div className="lane-title"><span className="icon"><Chip size={15} /></span>A normal computer</div>
            <div className="spacer" />
            <LogSwitch m={m} />
            <NormalStatus m={m} />
          </div>
          <Display bytes={registerBytes(m.normal.machine.regs)} scrambled={normalPc > 0} dead={m.normalStuck} />
          <div style={{ position: 'relative' }}>
            <ChipSvg
              variant="normal"
              regs={m.normal.machine.regs}
              hot={new Set()}
              instr={normalInstr}
              stepKey={`n${normalPc}`}
              direction="forward"
              heat={Math.min(1, m.normal.bitsErased / Math.max(1, totalBits))}
              pc={normalPc}
              dim={m.normalStuck}
              logBytes={m.logging ? logBytes(m.normal) : null}
            />
            <StuckOverlay m={m} />
          </div>
          <NormalStats m={m} />
        </div>
      </div>
    </section>
  );
}
