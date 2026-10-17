import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
});

export const Rewind = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
);
export const Play = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
);
export const PlayBack = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none"><path d="M16 5.5v13a1 1 0 0 1-1.5.86L4.1 12.86a1 1 0 0 1 0-1.72l10.4-6.5A1 1 0 0 1 16 5.5Z" /></svg>
);
export const Pause = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4.5" height="14" rx="1.2" /><rect x="13.5" y="5" width="4.5" height="14" rx="1.2" /></svg>
);
export const StepBack = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 5v14" /><path d="m18 6-8 6 8 6V6Z" fill="currentColor" /></svg>
);
export const StepFwd = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M18 5v14" /><path d="m6 6 8 6-8 6V6Z" fill="currentColor" /></svg>
);
export const ToStart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></svg>
);
export const ToEnd = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m13 17 5-5-5-5" /><path d="m6 17 5-5-5-5" /></svg>
);
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} strokeWidth={3} {...p}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Cross = ({ size, ...p }: P) => (
  <svg {...base(size)} strokeWidth={3} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Lock = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const Chip = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" /></svg>
);
export const Eye = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const Close = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Spark = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} fill="currentColor" stroke="none"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>
);
export const Arrow = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Flame = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 22c4 0 7-2.7 7-7 0-3.5-2.4-6-4-8-.4 2-1.6 3.3-3 4 0-3-1.5-6.3-4-9 0 4-5 6.7-5 13 0 4.3 3 7 9 7Z" /></svg>
);
