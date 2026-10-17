import { useSyncExternalStore } from 'react';

/** Frame rate of the 3D scene, sampled twice a second, so the toggle can show it honestly. */
let fps = 0;
const listeners = new Set<() => void>();

export function reportFps(value: number) {
  fps = Math.round(value);
  listeners.forEach((l) => l());
}

export function useFps(): number {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => fps,
  );
}
