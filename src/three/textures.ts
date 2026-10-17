import * as THREE from 'three';

/** Glyphs are drawn to canvas textures locally (no font download, works offline). */
const glyphs = new Map<string, THREE.CanvasTexture>();

export function glyphTexture(ch: string): THREE.CanvasTexture {
  const hit = glyphs.get(ch);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 240;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 150px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif';
  g.fillText(ch, 96, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  glyphs.set(ch, t);
  return t;
}

let dot: THREE.CanvasTexture | null = null;

/** Soft round sprite for particles. */
export function dotTexture(): THREE.CanvasTexture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  return dot;
}

export const COLORS = {
  forward: new THREE.Color('#ffb340'),
  backward: new THREE.Color('#64d2ff'),
  restored: new THREE.Color('#30d158'),
  plain: new THREE.Color('#f5f5f7'),
  shard: new THREE.Color('#ff9f0a'),
};
