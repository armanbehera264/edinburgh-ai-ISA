import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { assemble, INVERSE_OP, isStrictInstr, toString, type Instr, type StrictInstr } from '../core/index.js';
import type { Machine } from '../machine/useMachine.js';
import { glyphFor } from '../programs/cipher.js';
import { Close } from './icons.js';

interface Props {
  m: Machine;
  source: string;
  showAscii?: boolean;
  onClose(): void;
}

const hex = (v: number) => v.toString(16).padStart(4, '0').toUpperCase();

/** "Look inside the machine": the code, the registers bit by bit, and a box
 * where you can try (and fail) to make it delete something. */
export function Inspector({ m, source, showAscii = false, onClose }: Props) {
  const lines = source.split('\n');
  const activeLine = m.lastIndex === null ? null : m.asm.sourceLines[m.lastIndex];

  // Which pass through a REPEAT block the current instruction belongs to.
  const pass = useMemo(() => {
    const seen = new Map<number, number>();
    return m.asm.sourceLines.map((line) => {
      const n = (seen.get(line) ?? 0) + 1;
      seen.set(line, n);
      return n;
    });
  }, [m.asm]);

  const repeated = useMemo(() => {
    const counts = new Map<number, number>();
    for (const line of m.asm.sourceLines) counts.set(line, (counts.get(line) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([line]) => line));
  }, [m.asm]);

  // Keep the running line in view.
  const codeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = codeRef.current;
    const el = box?.querySelector<HTMLElement>('.line.active');
    if (!box || !el) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top, behavior: 'auto' });
  }, [activeLine]);

  const instr = m.lastIndex === null ? null : (m.program[m.lastIndex] as Instr);
  const logged = instr !== null && !isStrictInstr(instr);
  const inverse = instr && !logged ? toString({ ...instr, op: INVERSE_OP[(instr as StrictInstr).op] } as StrictInstr) : null;

  return (
    <motion.aside
      className="inspector"
      initial={{ x: 480, opacity: 0.4 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 480, opacity: 0.4 }}
      transition={{ type: 'spring', bounce: 0.12, duration: 0.45 }}
    >
      <div className="inspector-head">
        <h3>Inside the machine</h3>
        <button className="tbtn" onClick={onClose} aria-label="Close"><Close size={16} /></button>
      </div>
      <div className="inspector-body">
        <div className="section-title">{m.direction === 'backward' ? 'Just undone' : 'Just ran'}</div>
        <div className="now">
          {instr ? (
            m.direction === 'forward' ? (
              <>
                <div className="row"><span className="arrow">▶</span>{toString(instr)}</div>
                {logged && <div className="muted" style={{ marginTop: 4, color: 'var(--loss)' }}>ordinary instruction: what it destroyed was saved to the undo log</div>}
              </>
            ) : logged ? (
              <>
                <div className="row"><span className="arrow">◀</span>{toString(instr)}</div>
                <div className="muted" style={{ marginTop: 4, color: 'var(--loss)' }}>no exact opposite exists, so it was restored from the undo log</div>
              </>
            ) : (
              <>
                <div className="row"><span className="arrow">◀</span>{inverse}</div>
                <div className="muted" style={{ marginTop: 4 }}>the exact opposite of <code>{toString(instr)}</code></div>
              </>
            )
          ) : <span className="muted">Nothing yet. Press play or step.</span>}
        </div>

        <div className="section-title">Program</div>
        <div className="code" ref={codeRef} style={{ position: 'relative' }}>
          {lines.map((text, i) => {
            const ln = i + 1;
            const active = ln === activeLine;
            const isComment = text.trim().startsWith('#');
            return (
              <div key={i} className={`line${active ? ' active' : ''}${isComment ? ' comment' : ''}`}>
                <span className="ln">{ln}</span>
                <span>{text}</span>
                {active && m.lastIndex !== null && repeated.has(ln) && (
                  <span className="badge">pass {pass[m.lastIndex]}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="section-title">Registers</div>
        <div className="regs">
          {Array.from(m.state.regs).map((v, r) => (
            <div key={r} className={`reg${m.changed.has(r) ? ' hot' : ''}`}>
              <span className="name">r{r}</span>
              <span className="ascii">{showAscii ? glyphFor(v >> 8) + glyphFor(v & 0xff) : v}</span>
              <span className="hex">{hex(v)}</span>
              <span className="bits">
                {Array.from({ length: 16 }, (_, b) => <i key={b} className={(v >> (15 - b)) & 1 ? 'on' : ''} />)}
              </span>
            </div>
          ))}
        </div>

        <div className="section-title">Every instruction has an exact opposite</div>
        <div className="pairs">
          <div>ADD <span>↔</span> SUB</div>
          <div>ROL <span>↔</span> ROR</div>
          <div>XOR <span>↔</span> XOR</div>
          <div>SWAP <span>↔</span> SWAP</div>
        </div>

        <Cheat />

        <p className="honest">
          Going backwards uses only the current registers and the program text: no log, no snapshots.
          The ordinary CPU's heat gauge is illustrative,
          not a measurement of any real chip.
        </p>
      </div>
    </motion.aside>
  );
}

function Cheat() {
  const [text, setText] = useState('');
  const verdict = useMemo(() => {
    if (!text.trim()) return null;
    const r = assemble(text);
    if (r.errors.length) {
      const e = r.errors[0];
      const why = /unknown instruction/.test(e.reason)
        ? `This machine has no ${e.instruction.trim().split(/\s+/)[0].toUpperCase()} instruction. Overwriting is how information gets destroyed, so it doesn't exist.`
        : /one-to-one|destroys|equals source/.test(e.reason)
          ? 'That would destroy information: two different starting values would end up the same, so there would be no way back.'
          : e.reason;
      return { ok: false, text: why };
    }
    const i = r.program[0] as StrictInstr;
    return { ok: true, text: `Its exact opposite is ${toString({ ...i, op: INVERSE_OP[i.op] } as StrictInstr)}.` };
  }, [text]);

  return (
    <div className="cheat">
      <div className="section-title">Try to make it delete something</div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g.  MOV r1, 0   or   XOR r1, r1"
        spellCheck={false}
        aria-label="Try an instruction"
      />
      {verdict && (
        <div className={`verdict ${verdict.ok ? 'yes' : 'no'}`}>
          <b>{verdict.ok ? 'Accepted. ' : 'Refused. '}</b>{verdict.text}
        </div>
      )}
    </div>
  );
}
