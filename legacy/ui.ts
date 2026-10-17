import {
  assemble, AsmResult, Instr,
  stepForward, stepBackward, runForward, runBackward,
  newState,
  Word, add,
  BaselineState, newBaselineState, cloneBaseline, stepForwardBaseline,
  runForwardBaseline,
} from './index.js';

/* ---------- DOM elements ---------- */
const asmEl = document.getElementById('asm') as HTMLTextAreaElement;
const executionMarkerEl = document.getElementById('execution-marker') as HTMLDivElement;
const demoSelectEl = document.getElementById('demo-select') as HTMLSelectElement;
const demoNoteEl = document.getElementById('demo-note') as HTMLDivElement;
const asmErrorsEl = document.getElementById('asm-errors') as HTMLDivElement;

const regsBodyEl = document.getElementById('regs-body') as HTMLTableSectionElement;
const pcEl = document.getElementById('pc') as HTMLSpanElement;
const pcNEl = document.getElementById('pcN') as HTMLSpanElement;
const dirEl = document.getElementById('dir') as HTMLSpanElement;

const btnCompile = document.getElementById('btn-compile') as HTMLButtonElement;
const btnStepFwd = document.getElementById('btn-step-fwd') as HTMLButtonElement;
const btnStepBwd = document.getElementById('btn-step-bwd') as HTMLButtonElement;
const btnRunFwd = document.getElementById('btn-run-fwd') as HTMLButtonElement;
const btnRunBwd = document.getElementById('btn-run-bwd') as HTMLButtonElement;
const scrubEl = document.getElementById('scrub') as HTMLInputElement;
const scrubValEl = document.getElementById('scrub-val') as HTMLSpanElement;
const stepsEl = document.getElementById('steps') as HTMLSpanElement;
const logBytesEl = document.getElementById('logbytes') as HTMLSpanElement;
const flip16LogEl = document.getElementById('flip16log') as HTMLSpanElement;
const energyStepsEl = document.getElementById('energy-steps') as HTMLSpanElement;
const erasedEl = document.getElementById('erased') as HTMLSpanElement;
const energyEl = document.getElementById('energy') as HTMLSpanElement;

/* ---------- Application state ---------- */
type DemoId = 'fibonacci' | 'copy' | 'custom';

type Demo = {
  source: string;
  note: string;
  initialize: () => ReturnType<typeof newState>;
};

const DEMOS: Record<Exclude<DemoId, 'custom'>, Demo> = {
  fibonacci: {
    source: `# Seed: r1 = 0, r2 = 1. Each pair is (F(n), F(n+1)).
REPEAT 8 {
  ADD  r1, r2
  SWAP r1, r2
}`,
    note: 'Starts at r1 = 0 and r2 = 1. Step forward to watch consecutive Fibonacci values move through r1 and r2.',
    initialize: () => {
      const s = newState();
      s.regs[1] = 0;
      s.regs[2] = 1;
      return s;
    },
  },
  copy: {
    source: `# Seed: r1 = 42, r2 = 0. Copy into clean storage, then erase the copy.
XOR r2, r1
XOR r2, r1`,
    note: 'Starts at r1 = 42 and r2 = 0. The first XOR creates a reversible copy; the second uncomputes it back to zero.',
    initialize: () => {
      const s = newState();
      s.regs[1] = 42;
      return s;
    },
  },
};

let activeDemo: DemoId = 'fibonacci';
let program: Instr[] = [];
let programSourceLines: number[] = [];
let activeSourceLine: number | null = null;
let state = initialState();
let baseline = newBaselineState();
let steps = 0;
let direction = 'forward'; // 'forward' | 'backward'
let changedRegisters = new Set<number>();
const MEM_WATCH_ADDRS = [0x0000, 0x0010, 0x00ff, 0xffff];

/* ---------- Initialization ---------- */
function init(): void {
  assembleAndRender();
  renderState();
  renderTimeline();
  updateEnergy();

  asmEl.addEventListener('input', () => {
    activeDemo = 'custom';
    demoSelectEl.value = 'custom';
    demoNoteEl.textContent = 'Custom programs begin from an all-zero state. Use the Reset control to return to that state.';
    resetMachine();
    assembleAndRender();
    updateEnergy();
  });

  demoSelectEl.addEventListener('change', () => {
    const selected = demoSelectEl.value as DemoId;
    if (selected === 'custom') {
      activeDemo = 'custom';
      demoNoteEl.textContent = 'Custom programs begin from an all-zero state. Use the Reset control to return to that state.';
    } else {
      activeDemo = selected;
      const demo = DEMOS[selected];
      asmEl.value = demo.source;
      demoNoteEl.textContent = demo.note;
    }
    resetMachine();
    assembleAndRender();
    updateEnergy();
  });

  btnCompile.addEventListener('click', () => {
    resetMachine();
    assembleAndRender();
    renderState();
    renderTimeline();
    updateEnergy();
  });

  btnStepFwd.addEventListener('click', () => stepOne('forward'));
  btnStepBwd.addEventListener('click', () => stepOne('backward'));
  btnRunFwd.addEventListener('click', () => run('forward'));
  btnRunBwd.addEventListener('click', () => run('backward'));

  // `input` fires for mouse drag, keyboard arrows, and touch interaction.
  // Replaying from the entry state makes every selected PC boundary deterministic.
  scrubEl.addEventListener('input', applyScrub);
  asmEl.addEventListener('scroll', renderExecutionMarker);

}

function initialState(): ReturnType<typeof newState> {
  if (activeDemo === 'custom') return newState();
  return DEMOS[activeDemo].initialize();
}

function resetMachine(): void {
  state = initialState();
  baseline = newBaselineState();
  steps = 0;
  direction = 'forward';
  changedRegisters.clear();
  activeSourceLine = null;
}

function markChangedRegisters(before: Uint16Array): void {
  changedRegisters = new Set<number>();
  for (let r = 0; r < state.regs.length; r++) {
    if (before[r] !== state.regs[r]) changedRegisters.add(r);
  }
}

/* ---------- Assembler ---------- */
function assembleAndRender(): void {
  const result: AsmResult = assemble(asmEl.value);
  program = result.program;
  programSourceLines = result.sourceLines;
  const errors: string[] = [];
  // Show assembler errors
  asmErrorsEl.innerHTML = '';
  if (result.errors.length) {
    for (const err of result.errors) {
      const div = document.createElement('div');
      div.className = 'err-line';
      div.textContent = `line ${err.line}: ${err.instruction} — ${err.reason}`;
      asmErrorsEl.appendChild(div);
    }
  }

  pcNEl.textContent = String(program.length);
  scrubEl.max = String(program.length);
  scrubEl.value = '0';
  scrubValEl.textContent = '0';
  renderState();
  renderTimeline();
}

/* ---------- Core stepping ---------- */
function stepOne(dir: 'forward' | 'backward'): void {
  if (program.length === 0) return;
  try {
    const before = new Uint16Array(state.regs);
    const executedIndex = dir === 'forward' ? state.pc : state.pc - 1;
    if (dir === 'forward') {
      stepForward(state, program);
    } else {
      stepBackward(state, program);
    }
    markChangedRegisters(before);
    activeSourceLine = programSourceLines[executedIndex] ?? null;
    steps += 1;
    direction = dir;
    renderState();
    renderTimeline();
    updateEnergy();
  } catch (e) {
    // Boundary error — just update display, don't crash.
    renderTimeline();
  }
}

function run(dir: 'forward' | 'backward'): void {
  if (program.length === 0) return;
  try {
    const before = new Uint16Array(state.regs);
    if (dir === 'forward') {
      runForward(state, program);
    } else {
      runBackward(state, program);
    }
    markChangedRegisters(before);
    activeSourceLine = dir === 'forward'
      ? (programSourceLines[program.length - 1] ?? null)
      : (programSourceLines[0] ?? null);
    direction = dir;
    steps = 0; // steps not meaningful for a full run in this simple counter
    renderState();
    renderTimeline();
    updateEnergy();
  } catch (e) {
    renderTimeline();
  }
}

function applyScrub(): void {
  const target = Number(scrubEl.value);
  scrubValEl.textContent = String(target);
  // Reset to entry and replay forward to the target boundary.
  state = initialState();
  baseline = newBaselineState();
  steps = target;
  direction = 'forward';
  changedRegisters.clear();
  activeSourceLine = null;
  try {
    for (let i = 0; i < target && i < program.length; i++) {
      const before = new Uint16Array(state.regs);
      stepForward(state, program);
      markChangedRegisters(before);
      activeSourceLine = programSourceLines[i] ?? null;
    }
  } catch (e) {
    // ignore boundary
  }
  renderState();
  renderTimeline();
  updateEnergy();
}

/* ---------- Rendering ---------- */
function renderState(): void {
  // Register watch table
  regsBodyEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    const row = document.createElement('tr');
    row.className = changedRegisters.has(r) ? 'changed' : '';
    const val = Number(state.regs[r]);
    row.innerHTML = `
      <td class="name">r${r}</td>
      <td class="dec">${val}</td>
    `;
    regsBodyEl.appendChild(row);
  }

  pcEl.textContent = String(state.pc);
  pcEl.className = state.pc >= program.length ? 'hi' : '';
  pcNEl.textContent = String(program.length);
  dirEl.textContent = direction;

  renderExecutionMarker();
}

function renderExecutionMarker(): void {
  if (activeSourceLine === null) {
    executionMarkerEl.style.display = 'none';
    return;
  }

  const styles = getComputedStyle(asmEl);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const paddingTop = Number.parseFloat(styles.paddingTop);
  const lineIndex = activeSourceLine - 1;
  executionMarkerEl.style.top = `${paddingTop + lineIndex * lineHeight - asmEl.scrollTop}px`;
  executionMarkerEl.style.height = `${lineHeight}px`;
  executionMarkerEl.style.display = 'block';
}

function renderTimeline(): void {
  stepsEl.textContent = String(steps);
  const progLen = program.length;
  const pcPct = progLen === 0 ? 0 : Math.round((state.pc / progLen) * 100);
  // Keep the slider aligned with stepping, running, and direct scrubbing.
  scrubEl.max = String(progLen);
  scrubEl.value = String(state.pc);
  scrubValEl.textContent = String(state.pc);
}

function updateEnergy(): void {
  // This comparison is tied to the current program position, rather than to
  // UI clicks. It stays meaningful after running backward or using the slider.
  const executedInstructions = state.pc;
  const bits = executedInstructions * 16;
  const T = 300;
  const k = 1.380649e-23;
  const ln2 = 0.69314718056;
  const joulesPerBit = k * T * ln2;
  const total = bits * joulesPerBit;

  energyStepsEl.textContent = String(executedInstructions);
  erasedEl.textContent = `${bits} bits`;
  energyEl.textContent = bits === 0
    ? '0 J'
    : total.toExponential(3) + ' J';
}

/* ---------- Start ---------- */
init();
