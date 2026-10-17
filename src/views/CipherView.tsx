import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMachine } from '../machine/useMachine.js';
import {
  CIPHER_SOURCE, ROUNDS, MESSAGE_LENGTH, decodeMessage, encodeMessage, registerBytes, sanitizeMessage,
} from '../programs/cipher.js';
import { Tiles } from '../ui/Tiles.js';
import { OursLane, NormalLane } from '../ui/Lane.js';
import { Dock } from '../ui/Dock.js';
import { Inspector } from '../ui/Inspector.js';
import { AnimatePresence } from 'motion/react';
import { Hero, RestoredBanner, Stagger, useAmbience } from './shared.js';
import { ChipBoard } from '../ui/ChipBoard.js';

const STEPS_PER_ROUND = 24;

// The 3D scene only downloads when someone switches it on.
const OursScene = lazy(() => import('../three/Scene3D.js').then((mod) => ({ default: mod.OursScene })));
const NormalScene = lazy(() => import('../three/Scene3D.js').then((mod) => ({ default: mod.NormalScene })));

export type ViewMode = 'tiles' | 'chip' | '3d';

export function CipherView({ inspector, closeInspector, view }: { inspector: boolean; closeInspector(): void; view: ViewMode }) {
  const threeD = view === '3d';
  const m = useMachine(CIPHER_SOURCE, () => encodeMessage('MEET ME AT NOON'), 30);
  useAmbience(m);

  // While editing, the text box shows the registers. Its own copy is dropped
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
    start: <>Type a secret message, then press <b>play</b>.</>,
    forward: <>Scrambling. Every step can be undone.</>,
    paused: <>Step {m.pc} of {m.length}. Drag the timeline either way.</>,
    end: <>Scrambled. Now <b>drag the timeline back</b>.</>,
    backward: <>Running time backwards…</>,
    restored: <>Your message is back. <b>Nothing was saved</b> to make that possible.</>,
  }[m.phase];

  const marks = Array.from({ length: ROUNDS }, (_, r) => ({ at: r * STEPS_PER_ROUND, label: `Round ${r + 1}` }))
    .concat([{ at: m.length, label: '' }]);

  const messageInput = (
    <input
      ref={inputRef}
      className="tiles-input"
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
            eyebrow="A computer with no delete button"
            title={<><span className="soft">Every computer deletes things.</span> <span className="accent">This one can't.</span></>}
          >
            Scramble a secret, then drag time backwards. No decryption program, no saved history: every step just runs in reverse.
          </Hero>

          {view === 'chip' ? (
            <Stagger delay={0.1}>
              <ChipBoard m={m} narration={narration} caretAt={caretAt} input={messageInput} />
            </Stagger>
          ) : (
            <>
            <Stagger delay={0.1}>
              <OursLane m={m} narration={narration}>
                <div style={{ position: 'relative' }} onClick={() => inputRef.current?.focus()}>
                  {(() => {
                    const flat = (
                      <Tiles
                        bytes={registerBytes(m.state.regs)}
                        size="big"
                        hotRegs={m.changed}
                        direction={m.playing ?? m.direction}
                        scrambled={m.pc > 0}
                        caretAt={caretAt}
                        labels
                      />
                    );
                    if (!threeD) return flat;
                    return (
                      <Suspense fallback={flat}>
                        <OursScene
                          bytes={registerBytes(m.state.regs)}
                          hotRegs={m.changed}
                          scrambled={m.pc > 0}
                          direction={m.playing ?? m.direction}
                          playing={m.playing !== null}
                          phase={m.phase}
                        />
                      </Suspense>
                    );
                  })()}
                  {messageInput}
                </div>
              </OursLane>
            </Stagger>

            <Stagger delay={0.2}>
              <NormalLane m={m}>
                {(() => {
                  const flat = (
                    <Tiles
                      bytes={registerBytes(m.normal.machine.regs)}
                      size="small"
                      direction="forward"
                      scrambled={m.normal.machine.pc > 0}
                      dead={m.normalStuck}
                    />
                  );
                  if (!threeD) return flat;
                  return (
                    <Suspense fallback={flat}>
                      <NormalScene
                        bytes={registerBytes(m.normal.machine.regs)}
                        pc={m.normal.machine.pc}
                        scrambled={m.normal.machine.pc > 0}
                        stuck={m.normalStuck}
                      />
                    </Suspense>
                  );
                })()}
              </NormalLane>
            </Stagger>
            </>
          )}
        </div>
      </div>

      <RestoredBanner show={m.phase === 'restored'}>
        Restored exactly <small>0 bytes of history used</small>
      </RestoredBanner>

      <Dock m={m} marks={marks} startLabel="Your message" endLabel="Scrambled" inspectorOpen={inspector} />
      <AnimatePresence>
        {inspector && <Inspector m={m} source={CIPHER_SOURCE} showAscii onClose={closeInspector} />}
      </AnimatePresence>
    </>
  );
}
