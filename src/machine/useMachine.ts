import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assemble, cloneState, runBackward, stepBackward, stepForward,
  newConventional, conventionalForward, conventionalBackward,
  newHybridState, cloneHybridState, stepForwardHybrid, stepBackwardHybrid,
  type AssemblyMode, type ConventionalState, type HybridState, type Instr, type State, type AsmResult,
} from '../core/index.js';

export type Direction = 'forward' | 'backward';
export type Phase = 'start' | 'forward' | 'backward' | 'paused' | 'end' | 'restored';

export interface MachineOptions {
  /** 'strict': no instruction can destroy information, nothing is ever logged.
   *  'hybrid': ordinary instructions are allowed too, and each one
   *  saves exactly what it destroys to an undo log. */
  mode?: AssemblyMode;
  /** Run an ordinary computer alongside for comparison (strict programs only). */
  compare?: boolean;
  stepsPerSecond?: number;
}

export interface Machine {
  asm: AsmResult;
  program: Instr[];
  mode: AssemblyMode;
  /** The machine's live state. In strict mode it is the only copy: there is no history. */
  state: State;
  /** Position on the timeline: instructions executed so far. Equals the program
   * counter for straight-line code; differs once loops jump around. */
  pc: number;
  /** Total steps from start to finish. */
  length: number;
  /** Bytes of undo history the machine is holding right now. Always 0 in strict mode. */
  historyBytes: number;
  normal: ConventionalState;
  compare: boolean;
  direction: Direction;
  playing: Direction | null;
  phase: Phase;
  /** Index of the instruction just executed (forward) or just undone (backward). */
  lastIndex: number | null;
  changed: ReadonlySet<number>;
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

const MAX_STEPS = 5000;

function fresh(initial: State, mode: AssemblyMode): State | HybridState {
  if (mode === 'strict') return cloneState(initial);
  const h = newHybridState();
  h.regs.set(initial.regs);
  h.mem.set(initial.mem);
  return h;
}

/** How many steps the program takes from this start (loops can depend on data). */
function countSteps(start: State, program: Instr[], mode: AssemblyMode): number {
  if (mode === 'strict') return program.length;
  const s = cloneHybridState(fresh(start, mode) as HybridState);
  let n = 0;
  try {
    while (s.pc < program.length && n < MAX_STEPS) { stepForwardHybrid(s, program); n++; }
  } catch { /* log full or bad jump: the timeline ends where the run stopped */ }
  return n;
}

export function useMachine(source: string, makeInitial: () => State, opts: MachineOptions = {}): Machine {
  const mode = opts.mode ?? 'strict';
  const compare = (opts.compare ?? true) && mode === 'strict';
  const stepsPerSecond = opts.stepsPerSecond ?? 30;
  const asm = useMemo(() => assemble(source, { mode }), [source, mode]);
  const program = asm.program;

  const stateRef = useRef<State | HybridState>(fresh(makeInitial(), mode));
  const timeRef = useRef(0);
  const [length, setLength] = useState(() => countSteps(stateRef.current, program, mode));
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

  const reset = useCallback((initial: State) => {
    stateRef.current = fresh(initial, mode);
    timeRef.current = 0;
    normalRef.current = newConventional(initial, logging);
    setLength(countSteps(initial, program, mode));
    setLastIndex(null);
    setChanged(new Set());
    setLeftStart(false);
    setArrivedBack(false);
  }, [logging, mode, program]);

  // Start over whenever the program changes.
  useEffect(() => {
    reset(makeInitial());
    setPlaying(null);
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, mode]);

  /** Keep the ordinary computer in step. Without a log it can only go forward. */
  const syncNormal = useCallback(() => {
    if (!compare) return;
    const n = normalRef.current;
    const t = timeRef.current;
    while (n.machine.pc < t) conventionalForward(n, program);
    if (n.log) while (n.machine.pc > t && conventionalBackward(n));
  }, [compare, program]);

  /** Move one step. Strict mode undoes a step with its exact inverse, using only
   * the current state. Hybrid mode does the same for reversible instructions and
   * pops the undo log for the ordinary ones. */
  const move = useCallback((dir: Direction): boolean => {
    const s = stateRef.current;
    if (dir === 'forward' ? (s.pc >= program.length || timeRef.current >= MAX_STEPS) : timeRef.current <= 0) return false;
    const before = Uint16Array.from(s.regs);
    let index: number;
    try {
      if (dir === 'forward') {
        // A fresh run from the start: the ordinary computer starts over too,
        // instead of staying stuck at the end of the previous run.
        if (timeRef.current === 0 && compare && normalRef.current.machine.pc > 0) {
          normalRef.current = newConventional(cloneState(s), logging);
        }
        index = s.pc;
        if (mode === 'strict') stepForward(s, program); else stepForwardHybrid(s as HybridState, program);
        timeRef.current += 1;
      } else {
        if (mode === 'strict') stepBackward(s, program); else stepBackwardHybrid(s as HybridState, program);
        index = s.pc;
        timeRef.current -= 1;
      }
    } catch {
      return false;
    }
    const diff = new Set<number>();
    for (let r = 0; r < 8; r++) if (before[r] !== s.regs[r]) diff.add(r);
    setChanged(diff);
    setLastIndex(index);
    setDirection(dir);
    if (dir === 'forward') { setLeftStart(true); setArrivedBack(false); }
    else if (timeRef.current === 0) setArrivedBack(true);
    return true;
  }, [compare, logging, mode, program]);

  const seek = useCallback((target: number) => {
    const t = Math.max(0, Math.min(length, Math.round(target)));
    let moved = false;
    while (timeRef.current < t && move('forward')) moved = true;
    while (timeRef.current > t && move('backward')) moved = true;
    if (moved) { syncNormal(); rerender(); }
  }, [length, move, rerender, syncNormal]);

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
    if (dir === 'forward' && timeRef.current >= length) return;
    if (dir === 'backward' && timeRef.current <= 0) return;
    setDirection(dir);
    setPlaying(dir);
  }, [length]);

  const pause = useCallback(() => setPlaying(null), []);

  const toggle = useCallback(() => {
    if (playing) { setPlaying(null); return; }
    play(timeRef.current >= length ? 'backward' : 'forward');
  }, [length, play, playing]);

  const setLogging = useCallback((on: boolean) => {
    if (!compare) return;
    setLoggingState(on);
    // Rebuild the ordinary computer from the start, found the reversible way:
    // copy the current state and run it backwards.
    const start = cloneState(stateRef.current);
    runBackward(start, program);
    normalRef.current = newConventional(start, on);
    syncNormal();
    rerender();
  }, [compare, program, rerender, syncNormal]);

  const load = useCallback((initial: State) => {
    if (timeRef.current !== 0) return;
    reset(initial);
    rerender();
  }, [rerender, reset]);

  const s = stateRef.current;
  const t = timeRef.current;
  const phase: Phase = playing
    ? playing
    : t === 0
      ? (arrivedBack && leftStart ? 'restored' : 'start')
      : t >= length ? 'end' : 'paused';

  return {
    asm, program, mode, state: s, pc: t, length,
    historyBytes: mode === 'hybrid' ? (s as HybridState).logBytesUsed : 0,
    normal: normalRef.current, compare,
    direction, playing, phase, lastIndex, changed,
    normalStuck: compare && normalRef.current.machine.pc > t,
    logging, setLogging, seek, step, play, pause, toggle, load,
  };
}
