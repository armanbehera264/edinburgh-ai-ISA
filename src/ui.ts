import {
  assemble, AsmResult, Instr,
  stepForward, stepBackward, runForward, runBackward,
  makeInverseProgram, newState, cloneState, statesEqual,
  Word, add,
  BaselineState, newBaselineState, cloneBaseline, stepForwardBaseline,
  runForwardBaseline,
  gateXOR, gateNOT, gateSWAP, gateADD, gateCADD,
  toString,
} from './index.js';

/* ---------- DOM elements ---------- */
const asmEl = document.getElementById('asm') as HTMLTextAreaElement;
const demoSelectEl = document.getElementById('demo-select') as HTMLSelectElement;
const demoNoteEl = document.getElementById('demo-note') as HTMLDivElement;
const progEl = document.getElementById('prog') as HTMLDivElement;
const asmErrorsEl = document.getElementById('asm-errors') as HTMLDivElement;

const regsBodyEl = document.getElementById('regs-body') as HTMLTableSectionElement;
const pcEl = document.getElementById('pc') as HTMLSpanElement;
const pcNEl = document.getElementById('pcN') as HTMLSpanElement;
const dirEl = document.getElementById('dir') as HTMLSpanElement;

const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
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

const selInstrEl = document.getElementById('sel-instr') as HTMLDivElement;
const selInverseEl = document.getElementById('sel-inverse') as HTMLDivElement;
const valStatusEl = document.getElementById('val-status') as HTMLSpanElement;
const valDetailEl = document.getElementById('val-detail') as HTMLDivElement;
const btnRoundtrip = document.getElementById('btn-roundtrip') as HTMLButtonElement;
const rtResultEl = document.getElementById('rt-result') as HTMLDivElement;

const gNotEl = document.getElementById('g-not') as HTMLSpanElement;
const gCnotEl = document.getElementById('g-cnot') as HTMLSpanElement;
const gToffoliEl = document.getElementById('g-toffoli') as HTMLSpanElement;
const gFredkinEl = document.getElementById('g-fredkin') as HTMLSpanElement;
const gAncillaEl = document.getElementById('g-ancilla') as HTMLSpanElement;
const gNoteEl = document.getElementById('g-note') as HTMLDivElement;

/* ---------- Application state ---------- */
type DemoId = 'fibonacci' | 'copy' | 'custom';

type Demo = {
  source: string;
  note: string;
  initialize: () => ReturnType<typeof newState>;
};

const DEMOS: Record<Exclude<DemoId, 'custom'>, Demo> = {
  fibonacci: {
    source: `; Seed: r1 = 0, r2 = 1. Each pair is (F(n), F(n+1)).
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
    source: `; Seed: r1 = 42, r2 = 0. Copy into clean storage, then erase the copy.
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
  updateGateDisplay(null);

  asmEl.addEventListener('input', () => {
    activeDemo = 'custom';
    demoSelectEl.value = 'custom';
    demoNoteEl.textContent = 'Custom programs begin from an all-zero state. Use the Reset control to return to that state.';
    resetMachine();
    assembleAndRender();
    updateEnergy();
    updateGateDisplay(null);
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
    updateGateDisplay(null);
  });

  btnReset.addEventListener('click', () => {
    resetMachine();
    assembleAndRender();
    renderState();
    renderTimeline();
    updateEnergy();
    updateGateDisplay(null);
  });

  btnStepFwd.addEventListener('click', () => stepOne('forward'));
  btnStepBwd.addEventListener('click', () => stepOne('backward'));
  btnRunFwd.addEventListener('click', () => run('forward'));
  btnRunBwd.addEventListener('click', () => run('backward'));

  // `input` fires for mouse drag, keyboard arrows, and touch interaction.
  // Replaying from the entry state makes every selected PC boundary deterministic.
  scrubEl.addEventListener('input', applyScrub);

  btnRoundtrip.addEventListener('click', () => runRoundtripTest());

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

  // Render program listing
  progEl.innerHTML = '';
  const errors: string[] = [];
  for (let i = 0; i < program.length; i++) {
    const line = document.createElement('div');
    line.className = 'line';
    line.innerHTML = `
      <div class="idx">${i}</div>
      <div><span class="op">${program[i].op}</span> ${renderOperands(program[i])}</div>
    `;
    progEl.appendChild(line);
  }

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

function renderOperands(instr: Instr): string {
  switch (instr.op) {
    case 'ADD': case 'SUB': case 'XOR':
      return `r${instr.rd}, r${instr.rs}`;
    case 'ADDI': case 'SUBI':
      return `r${instr.rd}, ${instr.imm}`;
    case 'NOT': case 'NEG':
      return `r${instr.rd}`;
    case 'ROL': case 'ROR':
      return `r${instr.rd}, ${instr.amount}`;
    case 'SWAP':
      return `r${instr.ra}, r${instr.rb}`;
    case 'EXCH':
      return `r${instr.rd}, [r${instr.ra}]`;
    case 'CADD': case 'CSUB':
      return `r${instr.rd}, r${instr.rs}, r${instr.rc}`;
    case 'CSWAP':
      return `r${instr.ra}, r${instr.rb}, r${instr.rc}`;
    default:
      return '';
  }
}

/* ---------- Core stepping ---------- */
function stepOne(dir: 'forward' | 'backward'): void {
  if (program.length === 0) return;
  try {
    const before = new Uint16Array(state.regs);
    if (dir === 'forward') {
      stepForward(state, program);
    } else {
      stepBackward(state, program);
    }
    markChangedRegisters(before);
    steps += 1;
    direction = dir;
    renderState();
    renderTimeline();
    updateGateDisplay(getCurrentInstr());
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
    direction = dir;
    steps = 0; // steps not meaningful for a full run in this simple counter
    renderState();
    renderTimeline();
    updateGateDisplay(null);
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
  try {
    for (let i = 0; i < target && i < program.length; i++) {
      const before = new Uint16Array(state.regs);
      stepForward(state, program);
      markChangedRegisters(before);
    }
  } catch (e) {
    // ignore boundary
  }
  renderState();
  renderTimeline();
  updateGateDisplay(getCurrentInstr());
  updateEnergy();
}

function getCurrentInstr(): Instr | null {
  if (state.pc < 0 || state.pc >= program.length) return null;
  return program[state.pc];
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

  // Highlight current instruction line
  const lines = progEl.querySelectorAll('.line');
  lines.forEach((el, i) => {
    el.classList.toggle('current', i === state.pc);
  });
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

function updateGateDisplay(instr: Instr | null): void {
  if (!instr) {
    gNotEl.textContent = '—';
    gCnotEl.textContent = '—';
    gToffoliEl.textContent = '—';
    gFredkinEl.textContent = '—';
    gAncillaEl.textContent = 'garbage ancillas: —';
    gAncillaEl.className = 'badge';
    gNoteEl.textContent = 'No operation selected.';
    return;
  }

  let not = 0, cnot = 0, toffoli = 0, fredkin = 0;
  let ancillaDirty = false;
  let note = '';

  switch (instr.op) {
    case 'XOR': {
      const r = gateXOR(Number(instr.rd), Number(instr.rs));
      not = r.stats.not; cnot = r.stats.cnot;
      toffoli = r.stats.toffoli; fredkin = r.stats.fredkin;
      ancillaDirty = false;
      note = '16 parallel CNOTs: rs[i] → rd[i].';
      break;
    }
    case 'NOT': {
      const r = gateNOT(Number(instr.rd));
      not = r.stats.not;
      note = '16 NOT gates.';
      break;
    }
    case 'SWAP': {
      const r = gateSWAP(0, 0);
      cnot = r.stats.cnot * 3; // 3 CNOTs per bit × 16 bits
      note = '3 CNOTs per bit (a^=b; b^=a; a^=b).';
      break;
    }
    case 'ADD': case 'SUB': case 'ADDI': case 'SUBI': {
      const r = gateADD(0, 0);
      toffoli = r.stats.toffoli;
      ancillaDirty = r.ancillaDirty;
      note = 'Cuccaro ripple-carry adder; ancilla carry returns to 0.';
      break;
    }
    case 'CADD': case 'CSUB': {
      const r = gateCADD(0, 0, 0);
      toffoli = r.stats.toffoli;
      ancillaDirty = r.ancillaDirty;
      note = 'Compute–use–uncompute: controlled copy, add, uncompute.';
      break;
    }
    default:
      note = 'No gate-level mapping required (wiring or N/A).';
  }

  gNotEl.textContent = String(not);
  gCnotEl.textContent = String(cnot);
  gToffoliEl.textContent = String(toffoli);
  gFredkinEl.textContent = String(fredkin);
  const badge = ancillaDirty ? 'badge bad' : 'badge ok';
  gAncillaEl.className = badge;
  gAncillaEl.textContent = ancillaDirty
    ? 'garbage ancillas: DIRTY'
    : 'garbage ancillas: 0';
  gNoteEl.textContent = note;
}

/* ---------- Reversibility / round-trip test ---------- */
function runRoundtripTest(): void {
  const current = cloneState(state);
  const prog = program;
  try {
    // Forward to end
    const fwd = runForward(cloneState(current), prog);
    // Backward all the way
    const back = runBackward(fwd, prog);
    const ok = statesEqual(back, current);
    rtResultEl.textContent = ok
      ? `PASS: forward to pc=N then backward to pc=0 restored the initial state byte-for-byte.`
      : 'FAIL: round-trip did not restore state.';
    rtResultEl.style.color = ok ? 'var(--ok)' : 'var(--bad)';
  } catch (e) {
    rtResultEl.textContent = `Test error: ${String(e)}`;
    rtResultEl.style.color = 'var(--bad)';
  }
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
