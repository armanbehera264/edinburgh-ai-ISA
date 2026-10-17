import { toWord, MAX_WORD } from './word.js';
import { validateInstr } from './validate.js';
/** Parse a single immediate value. Accepts decimal, hex (0x...), or signed decimal. */
function parseImm(text) {
    const t = text.trim();
    if (t === '')
        return { value: 0, error: 'empty immediate' };
    let sign = 1;
    let body = t;
    const m = /^([+-])(.+)$/.exec(t);
    if (m) {
        sign = m[1] === '+' ? 1 : -1;
        body = m[2].trim();
    }
    let num;
    if (/^0[xX][0-9a-fA-F]+$/.test(body)) {
        num = parseInt(body.slice(2), 16);
    }
    else if (/^\d+$/.test(body)) {
        num = parseInt(body, 10);
    }
    else {
        return { value: 0, error: `invalid immediate: ${text}` };
    }
    let value = sign * num;
    value = toWord(value);
    if (value > MAX_WORD) {
        return { value: 0, error: `immediate out of range: ${text}` };
    }
    return { value: value, error: null };
}
function parseReg(text) {
    const t = text.trim().toLowerCase();
    const m = /^r([0-7])$/.exec(t);
    if (!m)
        return { reg: null, error: `invalid register: ${text}` };
    return { reg: Number(m[1]), error: null };
}
function parseAmount(text) {
    const t = text.trim();
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) {
        return { amount: 0, error: `invalid rotation amount: ${text}` };
    }
    return { amount: n & 15, error: null };
}
export function assemble(source, options = {}) {
    const maxProgramLength = options.maxProgramLength ?? 0xffff;
    const errors = [];
    const rawLines = source.split(/\r?\n/);
    // First pass: expand REPEAT blocks into a flat list of { instruction text, original line }.
    const expanded = [];
    let i = 0;
    while (i < rawLines.length) {
        const line = rawLines[i];
        const lineNo = i + 1;
        const trimmed = line.trim();
        const repeatM = /^REPEAT\s+(\d+)\s*\{\s*$/i.exec(trimmed);
        if (repeatM) {
            const count = Number(repeatM[1]);
            i += 1;
            const block = [];
            let depth = 1;
            while (i < rawLines.length && depth > 0) {
                const inner = rawLines[i];
                const innerNo = i + 1;
                const innerTrimmed = inner.trim();
                if (/^REPEAT\s+\d+\s*\{\s*$/i.test(innerTrimmed)) {
                    depth += 1;
                    block.push({ text: inner, line: innerNo });
                }
                else if (/^\s*\}\s*$/i.test(innerTrimmed)) {
                    depth -= 1;
                    if (depth === 0)
                        break;
                    else
                        block.push({ text: inner, line: innerNo });
                }
                else {
                    block.push({ text: inner, line: innerNo });
                }
                i += 1;
            }
            if (depth > 0) {
                errors.push({ line: lineNo, instruction: trimmed, reason: 'unclosed REPEAT block' });
                i += 1;
                continue;
            }
            for (let rep = 0; rep < count; rep++) {
                for (const item of block) {
                    expanded.push(item);
                }
            }
            // Skip the closing brace consumed by the block scanner. Without this,
            // the outer loop parses it again as an unmatched `}`.
            i += 1;
        }
        else if (/^\s*\}\s*$/i.test(trimmed)) {
            errors.push({ line: lineNo, instruction: trimmed, reason: 'unexpected closing brace outside REPEAT' });
            i += 1;
        }
        else {
            expanded.push({ text: trimmed, line: lineNo });
            i += 1;
        }
    }
    // Second pass: parse each expanded line into an instruction.
    const program = [];
    for (const item of expanded) {
        const parsed = parseLine(item.text, item.line, options.contracts);
        if (parsed.error) {
            errors.push(parsed.error);
            continue;
        }
        const instr = parsed.instr;
        if (!instr)
            continue; // blank line or comment
        const vErr = validateInstr(instr, item.line);
        if (vErr) {
            errors.push({
                line: vErr.line ?? item.line,
                instruction: vErr.instruction,
                reason: vErr.reason,
            });
            continue;
        }
        program.push(instr);
    }
    if (program.length > maxProgramLength) {
        errors.push({
            line: 0,
            instruction: '(program)',
            reason: `expanded program length ${program.length} exceeds limit ${maxProgramLength}`,
        });
    }
    return {
        program,
        errors: errors,
        expandedLength: program.length,
    };
}
function parseLine(text, line, contracts) {
    // Strip comments (; or //).
    let body = text;
    const semi = body.indexOf(';');
    const dslash = body.indexOf('//');
    let cut = body.length;
    if (semi !== -1)
        cut = Math.min(cut, semi);
    if (dslash !== -1)
        cut = Math.min(cut, dslash);
    body = body.slice(0, cut).trim();
    if (body === '')
        return { instr: null, error: null };
    const opMatch = /^(\S+)(?:\s+(.*))?$/.exec(body);
    if (!opMatch)
        return { instr: null, error: null };
    const op = opMatch[1].toUpperCase();
    // Operands are comma-separated. Splitting only on whitespace left commas
    // attached to register names (for example `r2,`), causing valid programs
    // to be rejected as invalid registers.
    const args = opMatch[2] === undefined || opMatch[2].trim() === ''
        ? []
        : opMatch[2].split(',').map((arg) => arg.trim());
    const fail = (reason) => ({ instr: null, error: { line, instruction: text, reason } });
    try {
        switch (op) {
            case 'ADD':
            case 'SUB':
            case 'XOR': {
                if (args.length !== 2)
                    return fail(`${op} needs two register operands`);
                const rd = parseReg(args[0]);
                const rs = parseReg(args[1]);
                if (rd.error)
                    return fail(rd.error);
                if (rs.error)
                    return fail(rs.error);
                return { instr: { op, rd: rd.reg, rs: rs.reg }, error: null };
            }
            case 'ADDI':
            case 'SUBI': {
                if (args.length !== 2)
                    return fail(`${op} needs a register and an immediate`);
                const rd = parseReg(args[0]);
                const imm = parseImm(args[1]);
                if (rd.error)
                    return fail(rd.error);
                if (imm.error)
                    return fail(imm.error);
                return { instr: { op, rd: rd.reg, imm: imm.value }, error: null };
            }
            case 'NOT':
            case 'NEG': {
                if (args.length !== 1)
                    return fail(`${op} needs one register operand`);
                const rd = parseReg(args[0]);
                if (rd.error)
                    return fail(rd.error);
                return { instr: { op, rd: rd.reg }, error: null };
            }
            case 'ROL':
            case 'ROR': {
                if (args.length !== 2)
                    return fail(`${op} needs a register and an amount`);
                const rd = parseReg(args[0]);
                const amt = parseAmount(args[1]);
                if (rd.error)
                    return fail(rd.error);
                if (amt.error)
                    return fail(amt.error);
                return { instr: { op, rd: rd.reg, amount: amt.amount }, error: null };
            }
            case 'SWAP': {
                if (args.length !== 2)
                    return fail('SWAP needs two register operands');
                const ra = parseReg(args[0]);
                const rb = parseReg(args[1]);
                if (ra.error)
                    return fail(ra.error);
                if (rb.error)
                    return fail(rb.error);
                return { instr: { op: 'SWAP', ra: ra.reg, rb: rb.reg }, error: null };
            }
            case 'EXCH': {
                if (args.length !== 2)
                    return fail('EXCH needs a register and [register]');
                const rd = parseReg(args[0]);
                const m = /^\[(r[0-7])\]$/i.exec(args[1].trim());
                if (!m)
                    return fail('EXCH address must be [rN]');
                const ra = parseReg(m[1]);
                if (ra.error)
                    return fail(ra.error);
                if (rd.error)
                    return fail(rd.error);
                return { instr: { op: 'EXCH', rd: rd.reg, ra: ra.reg }, error: null };
            }
            case 'CADD':
            case 'CSUB': {
                if (args.length !== 3)
                    return fail(`${op} needs three register operands`);
                const rd = parseReg(args[0]);
                const rs = parseReg(args[1]);
                const rc = parseReg(args[2]);
                if (rd.error)
                    return fail(rd.error);
                if (rs.error)
                    return fail(rs.error);
                if (rc.error)
                    return fail(rc.error);
                return { instr: { op, rd: rd.reg, rs: rs.reg, rc: rc.reg }, error: null };
            }
            case 'CSWAP': {
                if (args.length !== 3)
                    return fail('CSWAP needs three register operands');
                const ra = parseReg(args[0]);
                const rb = parseReg(args[1]);
                const rc = parseReg(args[2]);
                if (ra.error)
                    return fail(ra.error);
                if (rb.error)
                    return fail(rb.error);
                if (rc.error)
                    return fail(rc.error);
                return { instr: { op: 'CSWAP', ra: ra.reg, rb: rb.reg, rc: rc.reg }, error: null };
            }
            default:
                return fail(`unknown instruction: ${op}`);
        }
    }
    catch (e) {
        return fail(`parse error: ${String(e)}`);
    }
}
//# sourceMappingURL=assemble.js.map