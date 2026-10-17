import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useMachine } from '../machine/useMachine.js';
import {
  CIPHER_SOURCE, ROUNDS, MESSAGE_LENGTH, decodeMessage, encodeMessage, sanitizeMessage,
} from '../programs/cipher.js';
import { ChipBoard } from '../ui/ChipBoard.js';
import { Dock } from '../ui/Dock.js';
import { Inspector } from '../ui/Inspector.js';
import { Hero, RestoredBanner, useAmbience } from './shared.js';

const STEPS_PER_ROUND = 24;

export type ViewMode = 'chip' | '3d';

export function CipherView({ inspector, closeInspector, view }: { inspector: boolean; closeInspector(): void; view: ViewMode }) {
  const m = useMachine(CIPHER_SOURCE, () => encodeMessage('THIS IS TENET'), { stepsPerSecond: 30 });
  useAmbience(m);

  // While editing, the text box mirrors the registers. Its own copy is dropped
  // the moment the program starts: from then on the message exists only in
  // the scrambled registers.
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (m.pc > 0) setDraft(null); }, [m.pc]);

  const editable = m.pc === 0 && !m.playing;
  const text = draft ?? decodeMessage(m.state.regs);
  const caretAt = editable && focused ? Math.min(text.length, MESSAGE_LENGTH - 1) : null;

  const narration = {
    start: <>Type a message into U1, then press <b>play</b>.</>,
    forward: <>Scrambling. Every step can be undone.</>,
    paused: <>Step {m.pc} of {m.length}. Drag the timeline either way.</>,
    end: <>Scrambled. Now <b>drag the timeline back</b>.</>,
    backward: <>Running time backwards.</>,
    restored: <>Your message is back. <b>Nothing was saved</b> to make that possible.</>,
  }[m.phase];

  const marks = Array.from({ length: ROUNDS }, (_, r) => ({ at: r * STEPS_PER_ROUND, label: `round ${r + 1}` }))
    .concat([{ at: m.length, label: '' }]);

  const messageInput = (
    <input
      ref={inputRef}
      className="text-input"
      value={text}
      maxLength={MESSAGE_LENGTH}
      disabled={!editable}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const next = sanitizeMessage(e.target.value.toUpperCase());
        setDraft(next);
        m.load(encodeMessage(next));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); m.play('forward'); } }}
      aria-label="Secret message (up to 16 characters)"
      autoComplete="off"
      spellCheck={false}
    />
  );

  return (
    <>
      <div className={`stage${inspector ? ' with-inspector' : ''}`}>
        <div className="stage-inner">
          <Hero
            eyebrow="Flip the Script"
            title={<><span className="soft">Computers only run forwards.</span> <span className="accent">TENET runs in reverse.</span></>}
          />
          <div className="flip-strip">
            <div>
              <span className="label"><i />The assumption</span>
              <p>A computer only moves forwards. Every step <b>overwrites and destroys</b> old values, billions of times a second, so there is no way back.</p>
            </div>
            <div className="flip">
              <span className="label"><i />The flip</span>
              <p>Every TENET instruction has an <b>exact opposite</b>. Nothing is ever destroyed, so any program can run backwards to its exact start, <b>with zero saved history</b>.</p>
            </div>
            <div className="why">
              <span className="label"><i />Why it matters</span>
              <p>Physics puts a <b>minimum energy cost</b> on destroying information. A computer that never destroys anything is the route to near-zero-energy chips, and quantum computers already work this way.</p>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <ChipBoard m={m} view={view} narration={narration} caretAt={caretAt} input={messageInput} />
        </div>
      </div>

      <RestoredBanner show={m.phase === 'restored'}>
        Restored exactly <small>0 bytes of history used</small>
      </RestoredBanner>

      <Dock m={m} marks={marks} startLabel="your message" endLabel="scrambled" inspectorOpen={inspector} />
      <AnimatePresence>
        {inspector && <Inspector m={m} source={CIPHER_SOURCE} showAscii onClose={closeInspector} />}
      </AnimatePresence>
    </>
  );
}
