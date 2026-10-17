import {
  assemble, AssemblyMode, AsmResult, Instr, HybridState, newHybridState,
  stepForwardHybrid, stepBackwardHybrid, runForwardHybrid, runBackwardHybrid,
} from './index.js';

/* ---------- DOM elements ---------- */
const asmEl = document.getElementById('asm') as HTMLTextAreaElement;
const executionMarkerEl = document.getElementById('execution-marker') as HTMLDivElement;
const demoSelectEl = document.getElementById('demo-select') as HTMLSelectElement;
const modeSelectEl = document.getElementById('compile-mode') as HTMLSelectElement;
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
const scrubNoteEl = document.getElementById('scrub-note') as HTMLDivElement;
const stepsEl = document.getElementById('steps') as HTMLSpanElement;
const logBytesEl = document.getElementById('logbytes') as HTMLSpanElement;
const logRecordsEl = document.getElementById('log-records') as HTMLSpanElement;
const energyStepsEl = document.getElementById('energy-steps') as HTMLSpanElement;
const erasedEl = document.getElementById('erased') as HTMLSpanElement;
const energyEl = document.getElementById('energy') as HTMLSpanElement;

type DemoId = 'fibonacci' | 'copy' | 'hybrid' | 'branch' | 'custom';
type Demo = { source: string; note: string; mode: AssemblyMode; initialize: () => HybridState };

const DEMOS: Record<Exclude<DemoId, 'custom'>, Demo> = {
  fibonacci: {
    source: `# Seed: r1 = 0, r2 = 1. Each pair is (F(n), F(n+1)).
REPEAT 8 {
  ADD  r1, r2
  SWAP r1, r2
}`,
    note: 'Strict mode: each instruction has a mathematical inverse. Step forward to watch consecutive Fibonacci values move through r1 and r2.',
    mode: 'strict',
    initialize: () => { const s = newHybridState(); s.regs[2] = 1; return s; },
  },
  copy: {
    source: `# Seed: r1 = 42, r2 = 0. Copy into clean storage, then erase the copy.
XOR r2, r1
XOR r2, r1`,
    note: 'Strict mode: r2 begins clean, so XOR can copy r1 and then uncompute the copy without any log.',
    mode: 'strict',
    initialize: () => { const s = newHybridState(); s.regs[1] = 42; return s; },
  },
  hybrid: {
    source: `# Hybrid mode records only the overwritten information needed to undo each line.
ADDI  r1, 12
MOV   r2, r1
SHL   r2, 1
STORE [r0], r2
LOAD  r3, [r0]
AND   r3, r1
SHR   r3, 2`,
    note: 'Hybrid mode: MOV, shifts, memory overwrite, LOAD, and AND append small undo records. Step backward restores their exact prior values.',
    mode: 'hybrid',
    initialize: () => newHybridState(),
  },
  branch: {
    source: `# A logged branch remembers the actual next PC so reverse execution follows the same path.
ADDI r1, 3
loop:
  SUBI r1, 1
  JNZ  r1, loop`,
    note: 'Hybrid mode: JNZ records the control-flow decision. Run forward to count down, then run backward to return to r1 = 0.',
    mode: 'hybrid',
    initialize: () => newHybridState(),
  },
};

let activeDemo: DemoId = 'fibonacci';
let program: Instr[] = [];
let programSourceLines: number[] = [];
let activeSourceLine: number | null = null;
let state = initialState();
let steps = 0;
let direction = 'forward';
let changedRegisters = new Set<number>();

function init(): void {
  assembleAndRender();
  renderState();
  renderTimeline();
  updateEnergy();

  asmEl.addEventListener('input', () => {
    activeDemo = 'custom';
    demoSelectEl.value = 'custom';
    demoNoteEl.textContent = 'Custom programs start from all-zero registers and memory. ADDI/SUBI can establish register values from zero.';
    compileFromEditor();
  });
  modeSelectEl.addEventListener('change', compileFromEditor);
  demoSelectEl.addEventListener('change', () => {
    const selected = demoSelectEl.value as DemoId;
    activeDemo = selected;
    if (selected === 'custom') {
      demoNoteEl.textContent = 'Custom programs start from all-zero registers and memory. ADDI/SUBI can establish register values from zero.';
    } else {
      const demo = DEMOS[selected];
      asmEl.value = demo.source;
      modeSelectEl.value = demo.mode;
      demoNoteEl.textContent = demo.note;
    }
    compileFromEditor();
  });
  btnCompile.addEventListener('click', compileFromEditor);
  btnStepFwd.addEventListener('click', () => stepOne('forward'));
  btnStepBwd.addEventListener('click', () => stepOne('backward'));
  btnRunFwd.addEventListener('click', () => run('forward'));
  btnRunBwd.addEventListener('click', () => run('backward'));
  scrubEl.addEventListener('input', applyScrub);
  asmEl.addEventListener('scroll', renderExecutionMarker);
}

function initialState(): HybridState {
  return activeDemo === 'custom' ? newHybridState() : DEMOS[activeDemo].initialize();
}

function resetMachine(): void {
  state = initialState();
  steps = 0;
  direction = 'forward';
  changedRegisters.clear();
  activeSourceLine = null;
}

function compileFromEditor(): void {
  resetMachine();
  assembleAndRender();
  renderState();
  renderTimeline();
  updateEnergy();
}

function markChangedRegisters(before: Uint16Array): void {
  changedRegisters = new Set<number>();
  for (let r = 0; r < state.regs.length; r += 1) {
    if (before[r] !== state.regs[r]) changedRegisters.add(r);
  }
}

function assembleAndRender(): void {
  const mode = modeSelectEl.value as AssemblyMode;
  const result: AsmResult = assemble(asmEl.value, { mode });
  program = result.program;
  programSourceLines = result.sourceLines;
  asmErrorsEl.innerHTML = '';
  for (const err of result.errors) {
    const div = document.createElement('div');
    div.className = 'err-line';
    div.textContent = `line ${err.line}: ${err.instruction} — ${err.reason}`;
    asmErrorsEl.appendChild(div);
  }
  pcNEl.textContent = String(program.length);
}

function backwardsExecutedIndex(): number {
  const record = state.undoLog[state.undoLog.length - 1];
  return record && record.pcAfter === state.pc ? record.pcBefore : state.pc - 1;
}

function stepOne(dir: 'forward' | 'backward'): void {
  if (program.length === 0) return;
  try {
    const before = new Uint16Array(state.regs);
    const executedIndex = dir === 'forward' ? state.pc : backwardsExecutedIndex();
    if (dir === 'forward') stepForwardHybrid(state, program);
    else stepBackwardHybrid(state, program);
    markChangedRegisters(before);
    activeSourceLine = programSourceLines[executedIndex] ?? null;
    steps += 1;
    direction = dir;
  } catch {
    // Boundary and safety-limit errors leave the last valid state visible.
  }
  renderState();
  renderTimeline();
  updateEnergy();
}

function run(dir: 'forward' | 'backward'): void {
  if (program.length === 0) return;
  try {
    const before = new Uint16Array(state.regs);
    if (dir === 'forward') runForwardHybrid(state, program);
    else runBackwardHybrid(state, program);
    markChangedRegisters(before);
    activeSourceLine = null;
    direction = dir;
  } catch (error) {
    asmErrorsEl.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'err-line';
    div.textContent = error instanceof Error ? error.message : String(error);
    asmErrorsEl.appendChild(div);
  }
  renderState();
  renderTimeline();
  updateEnergy();
}

function canScrub(): boolean {
  return !program.some((instruction) => instruction.op === 'JNZ');
}

function applyScrub(): void {
  if (!canScrub()) return;
  const target = Number(scrubEl.value);
  state = initialState();
  steps = target;
  direction = 'forward';
  changedRegisters.clear();
  activeSourceLine = null;
  try {
    for (let i = 0; i < target && i < program.length; i += 1) {
      const before = new Uint16Array(state.regs);
      stepForwardHybrid(state, program);
      markChangedRegisters(before);
      activeSourceLine = programSourceLines[i] ?? null;
    }
  } catch { /* the compiled static program has a valid replay path */ }
  renderState();
  renderTimeline();
  updateEnergy();
}

function renderState(): void {
  regsBodyEl.innerHTML = '';
  for (let r = 0; r < 8; r += 1) {
    const row = document.createElement('tr');
    row.className = changedRegisters.has(r) ? 'changed' : '';
    row.innerHTML = `<td class="name">r${r}</td><td class="dec">${Number(state.regs[r])}</td>`;
    regsBodyEl.appendChild(row);
  }
  pcEl.textContent = String(state.pc);
  pcEl.className = state.pc >= program.length ? 'hi' : '';
  pcNEl.textContent = String(program.length);
  dirEl.textContent = direction;
  renderExecutionMarker();
}

function renderExecutionMarker(): void {
  if (activeSourceLine === null) { executionMarkerEl.style.display = 'none'; return; }
  const styles = getComputedStyle(asmEl);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const paddingTop = Number.parseFloat(styles.paddingTop);
  executionMarkerEl.style.top = `${paddingTop + (activeSourceLine - 1) * lineHeight - asmEl.scrollTop}px`;
  executionMarkerEl.style.height = `${lineHeight}px`;
  executionMarkerEl.style.display = 'block';
}

function renderTimeline(): void {
  const scrubbable = canScrub();
  scrubEl.disabled = !scrubbable;
  scrubEl.max = String(program.length);
  scrubEl.value = String(Math.min(Math.max(state.pc, 0), program.length));
  scrubValEl.textContent = String(state.pc);
  scrubNoteEl.textContent = scrubbable
    ? 'Choose an instruction boundary. The machine is reset and replayed to that point.'
    : 'Scrubbing is disabled for branching programs because a PC boundary alone does not identify a unique execution history.';
  stepsEl.textContent = String(steps);
  logBytesEl.textContent = `${state.logBytesUsed} / ${state.logByteLimit}`;
  logRecordsEl.textContent = String(state.undoLog.length);
}

function updateEnergy(): void {
  // A strict operation discards no architectural information. Logged operations
  // preserve theirs in the undo log, so its current occupancy is the useful UI metric.
  const loggedBytes = state.logBytesUsed;
  const savedBits = loggedBytes * 8;
  const temperature = 300;
  const landauerPerBit = 1.380649e-23 * temperature * 0.69314718056;
  energyStepsEl.textContent = String(steps);
  erasedEl.textContent = `${savedBits} bits retained`;
  energyEl.textContent = savedBits === 0 ? '0 J' : (savedBits * landauerPerBit).toExponential(3) + ' J';
}

init();
