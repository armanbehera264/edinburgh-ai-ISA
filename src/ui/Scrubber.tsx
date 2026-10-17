import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface Mark { at: number; label?: string }

interface Props {
  value: number;
  max: number;
  marks?: Mark[];
  onSeek(target: number): void;
  onScrubStart?(): void;
  startLabel?: string;
  endLabel?: string;
}

/** The timeline. It tracks the pointer 1:1 and every position it passes
 * through is a real step of the machine, forwards or backwards. */
export function Scrubber({ value, max, marks = [], onSeek, onScrubStart, startLabel, endLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = max === 0 ? 0 : (value / max) * 100;

  const targetAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(f * max);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onScrubStart?.();
    onSeek(targetAt(e.clientX));
  };
  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) onSeek(targetAt(e.clientX));
  };
  const up = () => setDragging(false);

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = Math.max(1, Math.round(max / 10));
    const map: Record<string, number> = {
      ArrowLeft: value - 1, ArrowRight: value + 1, PageDown: value - big, PageUp: value + big, Home: 0, End: max,
    };
    if (e.key in map) {
      e.preventDefault();
      e.stopPropagation();
      onScrubStart?.();
      onSeek(map[e.key]);
    }
  };

  return (
    <div
      ref={ref}
      className={`scrubber${dragging ? ' dragging' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="Execution timeline"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`Step ${value} of ${max}`}
      onPointerDown={down}
      onPointerMove={moveTo}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
      <div className="ticks">
        {Array.from({ length: max + 1 }, (_, i) => {
          const mark = marks.find((m) => m.at === i);
          if (!mark && max > 160 && i % Math.ceil(max / 160) !== 0) return null;
          return (
            <div key={i} className={`tick${mark ? ' major' : ''}`} style={{ left: `${(i / Math.max(1, max)) * 100}%` }}>
              {mark?.label && <span className="tick-label">{mark.label}</span>}
            </div>
          );
        })}
      </div>
      <div className="thumb" style={{ left: `${pct}%` }} />
      {(startLabel || endLabel) && (
        <div className="ends" style={{ top: 'auto', bottom: -14 }}>
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      )}
    </div>
  );
}
