import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assemble, cloneState, runBackward, stepBackward, stepForward,
  newConventional, conventionalForward, conventionalBackward,
  type ConventionalState, type Instr, type State, type AsmResult,
} from '../core/index.js';

export type Direction = 'forward' | 'backward';
export type Phase = 'start' | 'forward' | 'backward' | 'paused' | 'end' | 'restored';

export interface Machine {
  asm: AsmResult;
  program: Instr[];
  /** The reversible machine's live state. It is the only copy: there is no history. */
  state: State;
  /** The ordinary computer running the same program alongside. */
  normal: ConventionalState;
  pc: number;
  length: number;
  direction: Direction;
  playing: Direction | null;
  phase: Phase;
  /** Index of the instruction just executed (forward) or just undone (backward). */
  lastIndex: number | null;
  changed: ReadonlySet<number>;
  /** The ordinary computer is ahead of us and has no way back. */
  normalStuck: boolean;
  logging: boolean;
  setLogging(on: boolean): void;
  seek(target: number): void;
  step(dir: Direction): void;
  play(dir: Direction): void;
  pause(): void;
  toggle(): void;
  /** Load a new starting state (only allowed at the start). */
  load(initial: State): void;
}

export function useMachine(source: string, makeInitial: () => State, stepsPerSecond = 30): Machine {
  const asm = useMemo(() => assemble(source), [source]);
  const program = asm.program;

  const stateRef = useRef<State>(makeInitial());
  const normalRef = useRef<ConventionalState>(newConventional(stateRef.current, false));
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const [direction, setDirection] = useState<Direction>('forward');
  const [playing, setPlaying] = useState<Direction | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<number>>(new Set());
  const [logging, setLoggingState] = useState(false);
  const [leftStart, setLeftStart] = useState(false);
  const [arrivedBack, setArrivedBack] = useState(false);

  // Reset whenever the program changes.
  useEffect(() => {
    stateRef.current = makeInitial();
    normalRef.current = newConventional(stateRef.current, logging);
    setLastIndex(null);
    setChanged(new Set());
    setLeftStart(false);
    setArrivedBack(false);
    setPlaying(null);
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  /** Keep the ordinary computer in step. Without a log it can only go forward. */
  const syncNormal = useCallback(() => {
    const n = normalRef.current;
    const pc = stateRef.current.pc;
    while (n.machine.pc < pc) conventionalForward(n, program);
    if (n.log) while (n.machine.pc > pc && conventionalBackward(n));
  }, [program]);

  /** Move one instruction. Backward runs the inverse, using only the current state. */
  const move = useCallback((dir: Direction): boolean => {
    const s = stateRef.current;
    if (dir === 'forward' ? s.pc >= program.length : s.pc <= 0) return false;
    const before = Uint16Array.from(s.regs);
    const index = dir === 'forward' ? s.pc : s.pc - 1;
    if (dir === 'forward') stepForward(s, program);
    else stepBackward(s, program);
    const diff = new Set<number>();
    for (let r = 0; r < 8; r++) if (before[r] !== s.regs[r]) diff.add(r);
    setChanged(diff);
    setLastIndex(index);
    setDirection(dir);
    if (dir === 'forward') { setLeftStart(true); setArrivedBack(false); }
    else if (s.pc === 0) setArrivedBack(true);
    return true;
  }, [program]);

  const seek = useCallback((target: number) => {
    const t = Math.max(0, Math.min(program.length, Math.round(target)));
    const s = stateRef.current;
    let moved = false;
    while (s.pc < t) moved = move('forward') || moved;
    while (s.pc > t) moved = move('backward') || moved;
    if (moved) { syncNormal(); rerender(); }
  }, [move, program.length, rerender, syncNormal]);

  const step = useCallback((dir: Direction) => {
    setPlaying(null);
    if (move(dir)) { syncNormal(); rerender(); }
  }, [move, rerender, syncNormal]);

  // Playback: a display-synced clock that advances whole instructions.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      carry += ((now - last) / 1000) * stepsPerSecond;
      last = now;
      let moved = false;
      let atEdge = false;
      while (carry >= 1) {
        carry -= 1;
        if (!move(playing)) { atEdge = true; break; }
        moved = true;
      }
      if (moved) { syncNormal(); rerender(); }
      if (atEdge) { setPlaying(null); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, move, rerender, stepsPerSecond, syncNormal]);

  const play = useCallback((dir: Direction) => {
    const s = stateRef.current;
    if (dir === 'forward' && s.pc >= program.length) return;
    if (dir === 'backward' && s.pc <= 0) return;
    setDirection(dir);
    setPlaying(dir);
  }, [program.length]);

  const pause = useCallback(() => setPlaying(null), []);

  const toggle = useCallback(() => {
    if (playing) { setPlaying(null); return; }
    play(stateRef.current.pc >= program.length ? 'backward' : 'forward');
  }, [play, playing, program.length]);

  const setLogging = useCallback((on: boolean) => {
    setLoggingState(on);
    // Rebuild the ordinary computer from the start. We find the start the
    // reversible way: copy the current state and run it backwards.
    const start = cloneState(stateRef.current);
    runBackward(start, program);
    normalRef.current = newConventional(start, on);
    syncNormal();
    rerender();
  }, [program, rerender, syncNormal]);

  const load = useCallback((initial: State) => {
    if (stateRef.current.pc !== 0) return;
    stateRef.current = cloneState(initial);
    normalRef.current = newConventional(initial, logging);
    setChanged(new Set());
    setLastIndex(null);
    setLeftStart(false);
    setArrivedBack(false);
    rerender();
  }, [logging, rerender]);

  const s = stateRef.current;
  const pc = s.pc;
  const phase: Phase = playing
    ? playing
    : pc === 0
      ? (arrivedBack && leftStart ? 'restored' : 'start')
      : pc >= program.length ? 'end' : 'paused';

  return {
    asm, program, state: s, normal: normalRef.current,
    pc, length: program.length, direction, playing, phase, lastIndex, changed,
    normalStuck: normalRef.current.machine.pc > pc,
    logging, setLogging, seek, step, play, pause, toggle, load,
  };
}
