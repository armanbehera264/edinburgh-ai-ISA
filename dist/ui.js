import { assemble, stepForward, stepBackward, runForward, runBackward, newState, cloneState, statesEqual, newBaselineState, gateXOR, gateNOT, gateSWAP, gateADD, gateCADD, } from './index.js';
/* ---------- DOM elements ---------- */
const asmEl = document.getElementById('asm');
const progEl = document.getElementById('prog');
const asmErrorsEl = document.getElementById('asm-errors');
const regsBodyEl = document.getElementById('regs-body');
const pcEl = document.getElementById('pc');
const pcNEl = document.getElementById('pcN');
const dirEl = document.getElementById('dir');
const btnReset = document.getElementById('btn-reset');
const btnStepFwd = document.getElementById('btn-step-fwd');
const btnStepBwd = document.getElementById('btn-step-bwd');
const btnRunFwd = document.getElementById('btn-run-fwd');
const btnRunBwd = document.getElementById('btn-run-bwd');
const scrubEl = document.getElementById('scrub');
const scrubValEl = document.getElementById('scrub-val');
const stepsEl = document.getElementById('steps');
const logBytesEl = document.getElementById('logbytes');
const flip16LogEl = document.getElementById('flip16log');
const erasedEl = document.getElementById('erased');
const tempEl = document.getElementById('temp');
const energyEl = document.getElementById('energy');
const selInstrEl = document.getElementById('sel-instr');
const selInverseEl = document.getElementById('sel-inverse');
const valStatusEl = document.getElementById('val-status');
const valDetailEl = document.getElementById('val-detail');
const btnRoundtrip = document.getElementById('btn-roundtrip');
const rtResultEl = document.getElementById('rt-result');
const gNotEl = document.getElementById('g-not');
const gCnotEl = document.getElementById('g-cnot');
const gToffoliEl = document.getElementById('g-toffoli');
const gFredkinEl = document.getElementById('g-fredkin');
const gAncillaEl = document.getElementById('g-ancilla');
const gNoteEl = document.getElementById('g-note');
/* ---------- Application state ---------- */
let program = [];
let state = newState();
let baseline = newBaselineState();
let steps = 0;
let direction = 'forward'; // 'forward' | 'backward'
const MEM_WATCH_ADDRS = [0x0000, 0x0010, 0x00ff, 0xffff];
/* ---------- Initialization ---------- */
function init() {
    assembleAndRender();
    renderState();
    renderTimeline();
    updateEnergy();
    updateGateDisplay(null);
    asmEl.addEventListener('input', assembleAndRender);
    btnReset.addEventListener('click', () => {
        state = newState();
        baseline = newBaselineState();
        steps = 0;
        direction = 'forward';
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
    tempEl.addEventListener('input', updateEnergy);
}
/* ---------- Assembler ---------- */
function assembleAndRender() {
    const result = assemble(asmEl.value);
    program = result.program;
    // Render program listing
    progEl.innerHTML = '';
    const errors = [];
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
function renderOperands(instr) {
    switch (instr.op) {
        case 'ADD':
        case 'SUB':
        case 'XOR':
            return `r${instr.rd}, r${instr.rs}`;
        case 'ADDI':
        case 'SUBI':
            return `r${instr.rd}, ${instr.imm}`;
        case 'NOT':
        case 'NEG':
            return `r${instr.rd}`;
        case 'ROL':
        case 'ROR':
            return `r${instr.rd}, ${instr.amount}`;
        case 'SWAP':
            return `r${instr.ra}, r${instr.rb}`;
        case 'EXCH':
            return `r${instr.rd}, [r${instr.ra}]`;
        case 'CADD':
        case 'CSUB':
            return `r${instr.rd}, r${instr.rs}, r${instr.rc}`;
        case 'CSWAP':
            return `r${instr.ra}, r${instr.rb}, r${instr.rc}`;
        default:
            return '';
    }
}
/* ---------- Core stepping ---------- */
function stepOne(dir) {
    if (program.length === 0)
        return;
    try {
        if (dir === 'forward') {
            stepForward(state, program);
        }
        else {
            stepBackward(state, program);
        }
        steps += 1;
        direction = dir;
        renderState();
        renderTimeline();
        updateGateDisplay(getCurrentInstr());
        updateEnergy();
    }
    catch (e) {
        // Boundary error — just update display, don't crash.
        renderTimeline();
    }
}
function run(dir) {
    if (program.length === 0)
        return;
    try {
        if (dir === 'forward') {
            runForward(state, program);
        }
        else {
            runBackward(state, program);
        }
        direction = dir;
        steps = 0; // steps not meaningful for a full run in this simple counter
        renderState();
        renderTimeline();
        updateGateDisplay(null);
        updateEnergy();
    }
    catch (e) {
        renderTimeline();
    }
}
function applyScrub() {
    const target = Number(scrubEl.value);
    scrubValEl.textContent = String(target);
    // Reset to entry and replay forward to the target boundary.
    state = newState();
    baseline = newBaselineState();
    steps = target;
    direction = 'forward';
    try {
        for (let i = 0; i < target && i < program.length; i++) {
            stepForward(state, program);
        }
    }
    catch (e) {
        // ignore boundary
    }
    renderState();
    renderTimeline();
    updateGateDisplay(getCurrentInstr());
    updateEnergy();
}
function getCurrentInstr() {
    if (state.pc < 0 || state.pc >= program.length)
        return null;
    return program[state.pc];
}
/* ---------- Rendering ---------- */
function renderState() {
    // Register watch table
    regsBodyEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        const row = document.createElement('tr');
        row.className = state.pc === r ? 'pc' : '';
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
function renderTimeline() {
    stepsEl.textContent = String(steps);
    const progLen = program.length;
    const pcPct = progLen === 0 ? 0 : Math.round((state.pc / progLen) * 100);
    // Keep the slider aligned with stepping, running, and direct scrubbing.
    scrubEl.max = String(progLen);
    scrubEl.value = String(state.pc);
    scrubValEl.textContent = String(state.pc);
}
function updateGateDisplay(instr) {
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
            not = r.stats.not;
            cnot = r.stats.cnot;
            toffoli = r.stats.toffoli;
            fredkin = r.stats.fredkin;
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
        case 'ADD':
        case 'SUB':
        case 'ADDI':
        case 'SUBI': {
            const r = gateADD(0, 0);
            toffoli = r.stats.toffoli;
            ancillaDirty = r.ancillaDirty;
            note = 'Cuccaro ripple-carry adder; ancilla carry returns to 0.';
            break;
        }
        case 'CADD':
        case 'CSUB': {
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
function runRoundtripTest() {
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
    }
    catch (e) {
        rtResultEl.textContent = `Test error: ${String(e)}`;
        rtResultEl.style.color = 'var(--bad)';
    }
}
function updateEnergy() {
    const bits = steps; // rough proxy: one write per step
    const T = Number(tempEl.value) || 300;
    const k = 1.380649e-23;
    const ln2 = 0.69314718056;
    const joulesPerBit = k * T * ln2;
    const total = bits * joulesPerBit;
    erasedEl.textContent = String(bits);
    energyEl.textContent = bits === 0
        ? '0 J (no bits erased yet)'
        : total.toExponential(3) + ' J';
}
/* ---------- Start ---------- */
init();
//# sourceMappingURL=ui.js.map