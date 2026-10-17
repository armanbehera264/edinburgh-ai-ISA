import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { compile, type Attempt, type CompileRun } from '../compiler/client.js';
import { parseExpression } from '../compiler/expr.js';
import { Hero, Stagger } from './shared.js';
import { Arrow, Check, Cross, Spark } from '../ui/icons.js';

export interface CompiledProgram { expression: string; source: string }

const EXAMPLES = ['x*2 + y', '3*x - y', 'x ^ (y + 7)', '(x + y) * 5'];

export function ClaudeView({ onRun }: { onRun(p: CompiledProgram): void }) {
  const [input, setInput] = useState('x*2 + y');
  const [run, setRun] = useState<CompileRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferCache, setPreferCache] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.dir = 'forward';
    document.documentElement.dataset.phase = 'start';
  }, []);

  const go = async (text = input) => {
    setError(null);
    try { parseExpression(text); } catch (e) { setError((e as Error).message); return; }
    setBusy(true);
    setRun(null);
    try {
      await compile(text, { preferCache }, setRun);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const winner = run?.result ? run.attempts[run.attempts.length - 1] : null;

  return (
    <div className="stage">
      <div className="stage-inner">
        <Hero
          eyebrow="Demo 3 · Claude as the compiler"
          title={<><span className="soft">Claude writes the code.</span><br /><span className="accent">The machine proves it.</span></>}
        >
          Type a formula. Claude translates it into instructions that can never delete anything.
          Then the app checks the result itself before it will run it.
        </Hero>

        <Stagger delay={0.1}>
          <form className="compose" onSubmit={(e) => { e.preventDefault(); if (!busy) go(); }}>
            <span className="prefix">z =</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="x*2 + y"
              spellCheck={false}
              aria-label="Formula using x and y"
            />
            <button className="btn claude" type="submit" disabled={busy}>
              <Spark size={16} />{busy ? 'Compiling…' : 'Compile with Claude'}
            </button>
          </form>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="btn" type="button" onClick={() => { setInput(ex); go(ex); }} disabled={busy}>{ex}</button>
            ))}
          </div>
          <div className="compile-meta">
            <button
              className="switch" role="switch" aria-checked={preferCache}
              onClick={() => setPreferCache(!preferCache)} style={{ background: 'none', border: 0 }}
            >
              <span className="knob-track" style={preferCache ? { background: 'var(--ok)' } : undefined}>
                <motion.span className="knob" animate={{ x: preferCache ? 16 : 0 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.35 }} />
              </span>
              <span>Use programs Claude already wrote (re-checked every time)</span>
            </button>
            <span>x in r1 · y in r2 · z in r3 · scratch must end at 0</span>
          </div>
          {error && <div className="form-error">{error}</div>}
        </Stagger>

        <div className="attempts">
          <AnimatePresence>
            {run?.attempts.map((a) => (
              <AttemptCard key={`${run.expr.text}-${a.n}`} attempt={a} source={run.source} last={a === run.attempts[run.attempts.length - 1]} done={run.done} />
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {run?.done && run.result && winner?.asm && (
            <motion.div
              ref={(el) => { if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 1600); }}
              className="proof"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6, delay: 1.5 }}
            >
              <span className="banner" style={{ padding: 0, background: 'none', border: 0, boxShadow: 'none' }}>
                <span className="check"><Check size={16} /></span>
              </span>
              <div>
                <div className="big">Verified: {run.expr.text}</div>
                <div className="sub">
                  {run.source === 'cache' ? 'Written by Claude earlier, re-checked just now.' : `Written by Claude in ${winner.n === 1 ? 'one attempt' : `${winner.n} attempts`}.`}
                  {' '}Correct on every test, leaves no mess, and runs backwards.
                </div>
              </div>
              <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => onRun({ expression: run.expr.text, source: winner.asm! })}>
                Run it forwards and backwards <Arrow size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AttemptCard({ attempt: a, source, last, done }: { attempt: Attempt; source: 'claude' | 'cache'; last: boolean; done: boolean }) {
  const status = a.status;
  return (
    <motion.article
      className={`attempt ${status}`}
      layout
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
    >
      <div className="attempt-head">
        <Spark size={15} style={{ color: '#d9805f' }} />
        {source === 'cache' ? 'Saved program from Claude' : `Attempt ${a.n}`}
        <span className="spacer" />
        {status === 'asking' && <span className="chip">Claude is writing…</span>}
        {status === 'checking' && <span className="chip dir">Checking…</span>}
        {status === 'passed' && <span className="chip ok">Verified</span>}
        {status === 'failed' && <span className="chip bad">Rejected</span>}
        {status === 'error' && <span className="chip bad">Couldn't reach Claude</span>}
      </div>

      {status === 'asking' && (
        <div className="thinking"><span className="dots"><span /><span /><span /></span>Writing reversible code…</div>
      )}
      {status === 'error' && <div className="thinking" style={{ color: '#ff8a80' }}>{a.error}</div>}

      {a.asm && <Code text={a.asm} />}

      {a.verification && (
        <div className="checks">
          {a.verification.checks.map((c, i) => {
            const skipped = c.detail === 'not run';
            return (
              <motion.div
                key={c.id}
                className={`check${!c.ok && !skipped ? ' failed' : ''}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.32, type: 'spring', bounce: 0, duration: 0.4 }}
              >
                <span className={`mark ${skipped ? 'skip' : c.ok ? 'ok' : 'no'}`}>
                  {!skipped && (c.ok ? <Check size={12} /> : <Cross size={11} />)}
                </span>
                <div>
                  <div>{c.label}</div>
                  {!skipped && <div className="detail">{c.detail}</div>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      {status === 'failed' && source === 'claude' && !(last && done) && (
        <div className="sent-back">↩ Sent the failure back to Claude to fix</div>
      )}
      {status === 'failed' && last && done && source === 'claude' && (
        <div className="sent-back" style={{ color: '#ff8a80' }}>Gave up after 3 attempts. The machine refused to run unverified code.</div>
      )}
    </motion.article>
  );
}

function Code({ text }: { text: string }) {
  return (
    <pre>
      {text.split('\n').map((line, i) => {
        const hash = line.indexOf('#');
        const code = hash === -1 ? line : line.slice(0, hash);
        const comment = hash === -1 ? '' : line.slice(hash);
        const m = /^(\s*)(\S+)(.*)$/.exec(code);
        return (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.025, 0.6) }}>
            {m ? <>{m[1]}<span className="op">{m[2]}</span>{m[3]}</> : code}
            {comment && <span className="c">{comment}</span>}
            {line === '' && ' '}
          </motion.div>
        );
      })}
    </pre>
  );
}
