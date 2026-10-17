import { useEffect, useRef, useState } from 'react';
import { INVERSE_OP, type InstrBody } from '../core/index.js';
import type { Direction } from '../machine/useMachine.js';

/** A processor drawn as hardware: 8 registers of 16 bit-lights each, wired
 * through two buses into an arithmetic unit. Each step sends a pulse along the
 * wires it uses: forwards in amber, backwards (the same wires, reversed) in cyan.
 * The "normal" variant has a heat sink: bits it overwrites spark off into it. */

const W = 600;
const H = 228;
const ROW_Y0 = 38;
const ROW_DY = 20;
const LED_X0 = 72;
const LED_DX = 14.2;
const LED_R = 4.4;
const ROW_END = 352;
const BUS_IN = 368;
const BUS_OUT = 382;
const ALU = { x: 404, y: 86, w: 112, h: 64 };
const ALU_IN_Y = ALU.y + ALU.h / 2 - 7;
const ALU_OUT_Y = ALU.y + ALU.h / 2 + 7;

const rowY = (r: number) => ROW_Y0 + r * ROW_DY;
const ledX = (b: number) => LED_X0 + b * LED_DX + (b >= 8 ? 6 : 0);

/** Wire route for one data movement: source register → ALU → destination register. */
function route(from: number, to: number): string {
  const ys = rowY(from);
  const yd = rowY(to);
  return `M${ROW_END},${ys} H${BUS_IN} V${ALU_IN_Y} H${ALU.x + ALU.w / 2} V${ALU_OUT_Y} H${BUS_OUT} V${yd} H${ROW_END}`;
}

function routesFor(i: InstrBody): string[] {
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR': return [route(i.rs, i.rd)];
    case 'CADD': case 'CSUB': return [route(i.rs, i.rd)];
    case 'SWAP': case 'CSWAP': return [route(i.ra, i.rb), route(i.rb, i.ra)];
    case 'EXCH': return [route(i.rd, i.rd)];
    default: return [route(i.rd, i.rd)];
  }
}

interface Spark { id: number; x: number; y: number; dx: number; dy: number; born: number }

interface Props {
  variant: 'ours' | 'normal';
  regs: Uint16Array;
  hot: ReadonlySet<number>;
  /** The instruction that just ran (or was just undone), if any. */
  instr: InstrBody | null;
  /** Changes every step so the pulse animation restarts. */
  stepKey: string;
  direction: Direction;
  /** Normal chip only: fraction of the heat gauge filled, 0–1. */
  heat?: number;
  /** Normal chip only: its program counter, used to spark on each overwrite. */
  pc?: number;
  dim?: boolean;
  logBytes?: number | null;
}

let sparkId = 0;

export function ChipSvg({ variant, regs, hot, instr, stepKey, direction, heat = 0, pc = 0, dim = false, logBytes = null }: Props) {
  const normal = variant === 'normal';

  // Sparks: when the normal chip moves forward, every register it overwrote
  // throws its old bits into the heat sink.
  const [sparks, setSparks] = useState<Spark[]>([]);
  const prev = useRef({ pc, regs: Uint16Array.from(regs) });
  useEffect(() => {
    if (!normal) return;
    const before = prev.current;
    if (pc > before.pc) {
      const now = performance.now();
      const fresh: Spark[] = [];
      for (let r = 0; r < 8; r++) {
        if (regs[r] === before.regs[r]) continue;
        for (let k = 0; k < 8; k++) {
          const x = ledX(k * 2 + (Math.random() < 0.5 ? 0 : 1));
          const y = rowY(r);
          fresh.push({ id: sparkId++, x, y, dx: 556 - x + (Math.random() - 0.5) * 18, dy: 118 - y + (Math.random() - 0.5) * 70, born: now });
        }
      }
      if (fresh.length) setSparks((old) => [...old.filter((s) => now - s.born < 700), ...fresh].slice(-220));
    }
    prev.current = { pc, regs: Uint16Array.from(regs) };
  }, [normal, pc, regs]);
  useEffect(() => {
    if (!sparks.length) return;
    const t = setTimeout(() => setSparks((old) => old.filter((s) => performance.now() - s.born < 700)), 750);
    return () => clearTimeout(t);
  }, [sparks]);

  const shown = instr && (direction === 'backward' && !normal ? { ...instr, op: INVERSE_OP[instr.op] } as InstrBody : instr);
  const routes = instr ? routesFor(instr) : [];
  const backward = direction === 'backward' && !normal;

  return (
    <svg className={`chip-svg ${variant}${dim ? ' dim' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${normal ? 'Normal' : 'Reversible'} processor with 8 registers`}>
      <defs>
        <linearGradient id={`pkg-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24242c" />
          <stop offset="1" stopColor="#141419" />
        </linearGradient>
        <linearGradient id="pin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b8893c" />
          <stop offset="0.5" stopColor="#f3d28a" />
          <stop offset="1" stopColor="#a87a30" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* pins */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = 34 + i * 21;
        return (
          <g key={i}>
            <rect x={x} y={4} width={9} height={12} rx={1.5} fill="url(#pin)" />
            <rect x={x} y={H - 16} width={9} height={12} rx={1.5} fill="url(#pin)" />
          </g>
        );
      })}

      {/* package */}
      <rect x={14} y={14} width={W - 28} height={H - 28} rx={14} fill={`url(#pkg-${variant})`} stroke="rgba(255,255,255,0.10)" />
      <rect x={15} y={15} width={W - 30} height={1.5} rx={1} fill="rgba(255,255,255,0.10)" />
      <circle cx={30} cy={30} r={4} fill="rgba(255,255,255,0.08)" />

      {/* static traces */}
      <g className="traces">
        {Array.from({ length: 8 }, (_, r) => (
          <g key={r}>
            <path d={`M${ROW_END},${rowY(r)} H${BUS_IN}`} />
            <path d={`M${BUS_OUT},${rowY(r) + 0.01} H${ROW_END + 4}`} style={{ opacity: 0.5 }} />
          </g>
        ))}
        <path d={`M${BUS_IN},${rowY(0)} V${rowY(7)}`} />
        <path d={`M${BUS_OUT},${rowY(0)} V${rowY(7)}`} />
        <path d={`M${BUS_IN},${ALU_IN_Y} H${ALU.x}`} />
        <path d={`M${BUS_OUT},${ALU_OUT_Y} H${ALU.x}`} />
      </g>

      {/* registers */}
      {Array.from({ length: 8 }, (_, r) => {
        const v = regs[r];
        const isHot = hot.has(r);
        return (
          <g key={r} className={`reg-row${isHot ? ' hot' : ''}`}>
            <rect x={30} y={rowY(r) - 8.5} width={ROW_END - 22} height={17} rx={5} className="row-bg" />
            <text x={40} y={rowY(r) + 3.8} className="reg-name">r{r}</text>
            {Array.from({ length: 16 }, (_, b) => {
              const on = (v >> (15 - b)) & 1;
              return <circle key={b} cx={ledX(b)} cy={rowY(r)} r={LED_R} className={on ? 'led on' : 'led'} />;
            })}
            <text x={ROW_END - 6} y={rowY(r) + 3.8} className="reg-hex" textAnchor="end">
              {v.toString(16).padStart(4, '0').toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* the moving data: route glow + travelling pulse */}
      {routes.map((d, i) => (
        <g key={`${stepKey}-${i}`}>
          <path d={d} className="route" />
          <path d={d} pathLength={100} className={`pulse ${backward ? 'back' : 'fwd'}`} filter="url(#glow)" />
        </g>
      ))}

      {/* arithmetic unit */}
      <g className={`alu${instr ? ' busy' : ''}`}>
        <rect x={ALU.x} y={ALU.y} width={ALU.w} height={ALU.h} rx={9} />
        <text x={ALU.x + 10} y={ALU.y + 15} className="alu-label">ALU</text>
        <text x={ALU.x + ALU.w / 2} y={ALU.y + ALU.h / 2 + 9} className="alu-op" textAnchor="middle">
          {shown ? shown.op : '—'}
        </text>
        {backward && instr && (
          <text x={ALU.x + ALU.w / 2} y={ALU.y + ALU.h - 7} className="alu-sub" textAnchor="middle">undoing {instr.op}</text>
        )}
      </g>

      {normal ? (
        <g className="sink">
          {/* heat sink fins + gauge */}
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={532} y={52 + i * 22} width={36} height={12} rx={3} />
          ))}
          <rect x={574} y={50} width={6} height={134} rx={3} className="gauge" />
          <rect x={574} y={50 + 134 * (1 - heat)} width={6} height={134 * heat} rx={3} className="gauge-fill" />
          <text x={550} y={42} className="engrave" textAnchor="middle">HEAT</text>
          {logBytes !== null && (
            <g>
              <rect x={ALU.x} y={ALU.y + ALU.h + 12} width={ALU.w} height={26} rx={6} className="log-ram" />
              <text x={ALU.x + ALU.w / 2} y={ALU.y + ALU.h + 29} className="log-text" textAnchor="middle">LOG {logBytes} B</text>
            </g>
          )}
          {sparks.map((s) => (
            <circle
              key={s.id}
              cx={s.x}
              cy={s.y}
              r={2}
              className="spark"
              style={{ ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` }}
            />
          ))}
        </g>
      ) : (
        <g>
          <text x={W - 34} y={H - 26} className="engrave" textAnchor="end">NO-DELETE 16 · REVERSIBLE</text>
          <text x={ALU.x + ALU.w / 2} y={ALU.y + ALU.h + 28} className="zero-heat" textAnchor="middle">0 bits destroyed</text>
        </g>
      )}
      {normal && <text x={W - 34} y={H - 26} className="engrave" textAnchor="end">ORDINARY CPU</text>}
    </svg>
  );
}
