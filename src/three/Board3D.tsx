/** 3D mode: the same two processors, as hardware on a tilted circuit board.
 *
 *  - Every bit is a real LED on the chip. Lit = 1.
 *  - Each step sends a light pulse along the gold traces from the source
 *    register, through the ALU, into the destination: amber forwards, and the
 *    same path in reverse, cyan, on rewind.
 *  - The ordinary chip wears a heat sink. Each overwrite throws sparks (one per
 *    destroyed bit) into it, and the fins glow hotter as bits are destroyed.
 *
 * Purely a view of the machine's state; it never touches the VM.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { INVERSE_OP, isStrictInstr, type Instr, type StrictInstr } from '../core/index.js';
import type { Direction, Phase } from '../machine/useMachine.js';
import { reportFps } from './fps.js';

const { damp } = THREE.MathUtils;
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const C = {
  forward: new THREE.Color('#ffb340'),
  backward: new THREE.Color('#5ac8fa'),
  restored: new THREE.Color('#30d158'),
  warm: new THREE.Color('#ffd28a'),
  loss: new THREE.Color('#ff7a1a'),
  off: new THREE.Color('#1b1b20'),
  dimOn: new THREE.Color('#4a3f2c'),
};

// Board layout (world units). The PCB top is y = 0.
const PCB = { w: 27, d: 11.5 };
const CHIP = { w: 11.4, d: 8.2, h: 0.5 };
const TOP = CHIP.h + 0.02;
const OURS_X = -6.6;
const NORMAL_X = 6.6;
const ledX = (c: number) => -4.85 + c * 0.36 + (c >= 8 ? 0.24 : 0);
const rowZ = (r: number) => -3.0 + r * 0.8;
const ROW_END = 1.2;
const BUS_IN = 1.55;
const BUS_OUT = 1.9;
const ALU = { x: 3.55, z: -0.2, w: 2.7, d: 2.4 };
const ALU_IN_Z = ALU.z - 0.45;
const ALU_OUT_Z = ALU.z + 0.45;

function tint(dir: Direction, phase: Phase): THREE.Color {
  if (phase === 'restored') return C.restored;
  return dir === 'backward' ? C.backward : C.forward;
}

/* ---------------- textures drawn locally (works offline) ---------------- */

function pcbTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = Math.round((W * PCB.d) / PCB.w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c1611';
  g.fillRect(0, 0, W, H);
  // traces: orthogonal runs with 45° doglegs, like real routing
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const len = 80 + rnd() * 260;
    const horiz = rnd() < 0.6;
    g.strokeStyle = `rgba(201, 164, 92, ${0.1 + rnd() * 0.12})`;
    g.lineWidth = 3 + rnd() * 3;
    g.beginPath();
    g.moveTo(x, y);
    if (horiz) { g.lineTo(x + len, y); g.lineTo(x + len + 30, y + 30); }
    else { g.lineTo(x, y + len); g.lineTo(x + 30, y + len + 30); }
    g.stroke();
    g.fillStyle = 'rgba(201, 164, 92, 0.35)';
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
  }
  // silkscreen
  const px = (wx: number) => ((wx + PCB.w / 2) / PCB.w) * W;
  const pz = (wz: number) => ((wz + PCB.d / 2) / PCB.d) * H;
  g.fillStyle = 'rgba(235, 235, 240, 0.55)';
  g.font = '600 34px ui-monospace, Menlo, monospace';
  g.fillText('U1  TENET · REVERSIBLE', px(OURS_X - CHIP.w / 2), pz(-CHIP.d / 2) - 22);
  g.fillText('U2  ORDINARY CPU', px(NORMAL_X - CHIP.w / 2), pz(-CHIP.d / 2) - 22);
  g.font = '600 26px ui-monospace, Menlo, monospace';
  g.fillStyle = 'rgba(235, 235, 240, 0.35)';
  g.fillText('TENET REV.A  ·  SAME PROGRAM, TWO PROCESSORS', px(-PCB.w / 2) + 40, H - 30);
  g.strokeStyle = 'rgba(235, 235, 240, 0.25)';
  g.lineWidth = 3;
  for (const cx of [OURS_X, NORMAL_X]) {
    g.strokeRect(px(cx - CHIP.w / 2) - 14, pz(-CHIP.d / 2) - 10, (CHIP.w / PCB.w) * W + 28, (CHIP.d / PCB.d) * H + 20);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeLabelCanvas(w = 512, h = 448) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { c, t };
}

let dot: THREE.CanvasTexture | null = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  return dot;
}

/* ---------------- camera, light, fps ---------------- */

/** Frames the board on load (and on "Reset view"); the user can then orbit it freely. */
function Rig({ resetKey }: { resetKey: number }) {
  const { camera, size } = useThree();
  const controls = useThree((st) => st.controls) as OrbitControlsImpl | null;
  const [dist, setDist] = useState(20);
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const aspect = size.width / size.height;
    // Fit the board's width (and its tilted depth) into view. Perspective makes
    // the near edge look bigger, so the flat-width fit is pulled in a little.
    const byWidth = (PCB.w / 2 + 0.3) / (Math.tan(half) * aspect);
    const byDepth = (PCB.d * 0.62) / Math.tan(half);
    const d = Math.max(byWidth, byDepth) * 0.8;
    const tilt = THREE.MathUtils.degToRad(52);
    cam.position.set(0, Math.sin(tilt) * d, Math.cos(tilt) * d);
    cam.lookAt(0, 0, 0.3);
    cam.updateProjectionMatrix();
    if (controls) { controls.target.set(0, 0, 0.3); controls.update(); }
    setDist(d);
  }, [camera, size, controls, resetKey]);
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      // The canvas is wide and short, so keep rotation gentle.
      rotateSpeed={0.32}
      zoomSpeed={0.6}
      minDistance={dist * 0.45}
      maxDistance={dist * 1.6}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
      target={[0, 0, 0.3]}
    />
  );
}

function FpsProbe() {
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.time += dt;
    if (a.time >= 0.5) { reportFps(a.frames / a.time); a.frames = 0; a.time = 0; }
  });
  return null;
}

/* ---------------- static hardware ---------------- */

function Pcb() {
  const tex = useMemo(pcbTexture, []);
  return (
    <mesh position={[0, -0.15, 0]} receiveShadow>
      <boxGeometry args={[PCB.w, 0.3, PCB.d]} />
      <meshStandardMaterial attach="material-0" color="#0a120e" />
      <meshStandardMaterial attach="material-1" color="#0a120e" />
      <meshStandardMaterial attach="material-2" map={tex} roughness={0.75} metalness={0.05} />
      <meshStandardMaterial attach="material-3" map={tex} color="#5f6b64" roughness={0.8} />
      <meshStandardMaterial attach="material-4" color="#0a120e" />
      <meshStandardMaterial attach="material-5" color="#0a120e" />
    </mesh>
  );
}

function Pins() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const per = 26;
  const count = per * 2 * 2;
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    let i = 0;
    for (const cx of [OURS_X, NORMAL_X]) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < per; k++) {
          o.position.set(cx - CHIP.w / 2 + 0.4 + k * ((CHIP.w - 0.8) / (per - 1)), 0.06, side * (CHIP.d / 2 + 0.22));
          o.updateMatrix();
          ref.current.setMatrixAt(i++, o.matrix);
        }
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.16, 0.08, 0.5]} />
      <meshStandardMaterial color="#d7b06a" metalness={0.9} roughness={0.28} />
    </instancedMesh>
  );
}

function Package({ x }: { x: number }) {
  return (
    <mesh position={[x, CHIP.h / 2, 0]} castShadow>
      <boxGeometry args={[CHIP.w, CHIP.h, CHIP.d]} />
      <meshStandardMaterial color="#17171b" roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

/** Gold bus traces on the chip surface. */
function Traces({ x }: { x: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const segs = useMemo(() => {
    const list: [number, number, number, number][] = [];
    for (let r = 0; r < 8; r++) {
      list.push([ROW_END, rowZ(r), BUS_IN, rowZ(r)]);
      list.push([BUS_OUT, rowZ(r), ROW_END + 0.05, rowZ(r)]);
    }
    list.push([BUS_IN, rowZ(0), BUS_IN, rowZ(7)]);
    list.push([BUS_OUT, rowZ(0), BUS_OUT, rowZ(7)]);
    list.push([BUS_IN, ALU_IN_Z, ALU.x - ALU.w / 2, ALU_IN_Z]);
    list.push([BUS_OUT, ALU_OUT_Z, ALU.x - ALU.w / 2, ALU_OUT_Z]);
    return list;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    segs.forEach(([x1, z1, x2, z2], i) => {
      const len = Math.hypot(x2 - x1, z2 - z1) + 0.05;
      o.position.set(x + (x1 + x2) / 2, TOP, (z1 + z2) / 2);
      o.rotation.set(0, -Math.atan2(z2 - z1, x2 - x1), 0);
      o.scale.set(len, 1, 1);
      o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [segs, x]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, segs.length]}>
      <boxGeometry args={[1, 0.02, 0.06]} />
      <meshStandardMaterial color="#b8924f" metalness={0.8} roughness={0.35} />
    </instancedMesh>
  );
}

/* ---------------- live parts ---------------- */

/** 8 registers × 16 bits of LEDs, plus a soft halo on every lit one. */
function Leds({ x, regs, color, dim }: { x: number; regs: Uint16Array; color: THREE.Color; dim: boolean }) {
  const leds = useRef<THREE.InstancedMesh>(null!);
  const halos = useRef<THREE.InstancedMesh>(null!);
  const level = useRef(new Float32Array(128)); // eased brightness per LED
  const tmp = useMemo(() => new THREE.Color(), []);
  const o = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 16; c++) {
        const i = r * 16 + c;
        o.position.set(x + ledX(c), TOP + 0.03, rowZ(r));
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(1);
        o.updateMatrix();
        leds.current.setMatrixAt(i, o.matrix);
        leds.current.setColorAt(i, C.off);
      }
    }
    leds.current.instanceMatrix.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x]);

  useFrame((_, dt) => {
    for (let r = 0; r < 8; r++) {
      const v = regs[r];
      for (let c = 0; c < 16; c++) {
        const i = r * 16 + c;
        const on = (v >> (15 - c)) & 1;
        level.current[i] = reduceMotion ? on : damp(level.current[i], on, 22, dt);
        const k = level.current[i];
        tmp.copy(C.off).lerp(dim ? C.dimOn : color, k);
        leds.current.setColorAt(i, tmp);
        o.position.set(x + ledX(c), TOP + 0.06, rowZ(r));
        o.rotation.set(-Math.PI / 2, 0, 0);
        o.scale.setScalar(dim ? 0 : k * 0.85);
        o.updateMatrix();
        halos.current.setMatrixAt(i, o.matrix);
      }
    }
    leds.current.instanceColor!.needsUpdate = true;
    halos.current.instanceMatrix.needsUpdate = true;
    (halos.current.material as THREE.MeshBasicMaterial).color.lerp(color, 1 - Math.exp(-6 * dt));
  });

  return (
    <>
      <instancedMesh ref={leds} args={[undefined, undefined, 128]}>
        <cylinderGeometry args={[0.13, 0.13, 0.06, 16]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, 128]} frustumCulled={false}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial map={dotTexture()} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** Row highlight under the register that just changed. */
function RowGlow({ x, hot, color }: { x: number; hot: ReadonlySet<number>; color: THREE.Color }) {
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame((_, dt) => {
    for (let r = 0; r < 8; r++) {
      const m = mats.current[r];
      if (!m) continue;
      m.opacity = damp(m.opacity, hot.has(r) ? 0.28 : 0, hot.has(r) ? 30 : 5, dt);
      m.color.copy(color);
    }
  });
  return (
    <>
      {Array.from({ length: 8 }, (_, r) => (
        <mesh key={r} position={[x + (ledX(0) + ledX(15)) / 2, TOP + 0.005, rowZ(r)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ledX(15) - ledX(0) + 0.55, 0.62]} />
          <meshBasicMaterial ref={(m) => { if (m) mats.current[r] = m; }} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** The ALU block with the current operation printed on top. */
function Alu({ x, op, sub, color, logged }: { x: number; op: string; sub: string; color: THREE.Color; logged: boolean }) {
  const { c, t } = useMemo(() => makeLabelCanvas(), []);
  const edge = useRef<THREE.MeshBasicMaterial>(null!);
  useEffect(() => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#0e0e11';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.font = '600 40px ui-monospace, Menlo, monospace';
    g.fillText('ALU', 28, 62);
    g.fillStyle = logged ? '#ff7a1a' : '#ededef';
    g.font = '700 150px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.fillText(op, c.width / 2, c.height / 2 + 60);
    if (sub) {
      g.font = '500 40px ui-monospace, Menlo, monospace';
      g.fillStyle = logged ? '#ff7a1a' : '#5ac8fa';
      g.fillText(sub, c.width / 2, c.height - 40);
    }
    g.textAlign = 'left';
    t.needsUpdate = true;
  }, [c, t, op, sub, logged]);
  useFrame((_, dt) => { edge.current.color.lerp(logged ? C.loss : color, 1 - Math.exp(-8 * dt)); });
  return (
    <group position={[x + ALU.x, TOP, ALU.z]}>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ALU.w + 0.12, ALU.d + 0.12]} />
        <meshBasicMaterial ref={edge} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ALU.w, ALU.d]} />
        <meshBasicMaterial map={t} toneMapped={false} />
      </mesh>
    </group>
  );
}

function routePoints(from: number, to: number): THREE.Vector3[] {
  const y = TOP + 0.12;
  return [
    [ROW_END, rowZ(from)], [BUS_IN, rowZ(from)], [BUS_IN, ALU_IN_Z], [ALU.x, ALU_IN_Z],
    [ALU.x, ALU_OUT_Z], [BUS_OUT, ALU_OUT_Z], [BUS_OUT, rowZ(to)], [ROW_END, rowZ(to)],
  ].map(([px, pz]) => new THREE.Vector3(px, y, pz));
}

function routeFor(i: Instr): [number, number] {
  switch (i.op) {
    case 'ADD': case 'SUB': case 'XOR': case 'CADD': case 'CSUB': case 'MOV': case 'AND': return [i.rs, i.rd];
    case 'SWAP': case 'CSWAP': return [i.ra, i.rb];
    case 'STORE': return [i.rs, i.rs];
    case 'JNZ': return [i.rc, i.rc];
    default: return [i.rd, i.rd];
  }
}

/** A light pulse travelling the wires an instruction uses. */
function Pulse({ x, instr, stepKey, reverse, color }: { x: number; instr: Instr | null; stepKey: number; reverse: boolean; color: THREE.Color }) {
  const head = useRef<THREE.Mesh>(null!);
  const halo = useRef<THREE.Sprite>(null!);
  const st = useRef({ t: 1, pts: [] as THREE.Vector3[], lens: [] as number[], total: 0 });

  useEffect(() => {
    if (!instr) return;
    const [a, b] = routeFor(instr);
    const pts = routePoints(a, b);
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    st.current = { t: 0, pts, lens, total: lens[lens.length - 1] };
  }, [instr, stepKey]);

  useFrame((_, dt) => {
    const s = st.current;
    s.t = Math.min(1, s.t + dt / 0.32);
    const visible = s.t < 1 && s.pts.length > 0;
    head.current.visible = visible;
    halo.current.visible = visible;
    if (!visible) return;
    const f = reverse ? 1 - s.t : s.t;
    const d = f * s.total;
    let i = 1;
    while (i < s.lens.length - 1 && s.lens[i] < d) i++;
    const seg = (d - s.lens[i - 1]) / Math.max(1e-6, s.lens[i] - s.lens[i - 1]);
    head.current.position.lerpVectors(s.pts[i - 1], s.pts[i], seg).add(new THREE.Vector3(x, 0, 0));
    halo.current.position.copy(head.current.position);
    (halo.current.material as THREE.SpriteMaterial).color.copy(color);
  });

  return (
    <>
      <mesh ref={head} visible={false}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <sprite ref={halo} scale={[1.4, 1.4, 1]} visible={false}>
        <spriteMaterial map={dotTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </>
  );
}

/* ---------------- the ordinary chip's heat sink + sparks ---------------- */

const SPARKS = 480;

class SparkPool {
  pos = new Float32Array(SPARKS * 3);
  vel = new Float32Array(SPARKS * 3);
  life = new Float32Array(SPARKS);
  next = 0;
  /** One spark per destroyed bit, flying from the register into the heat sink. */
  burst(x: number, z: number, target: THREE.Vector3, count: number) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % SPARKS;
      const sx = x + ledX(Math.floor(Math.random() * 16));
      this.pos.set([sx, TOP + 0.1, z], i * 3);
      const tx = target.x + (Math.random() - 0.5) * 1.6;
      const tz = target.z + (Math.random() - 0.5) * 1.6;
      const dur = 0.55 + Math.random() * 0.25;
      this.vel.set([(tx - sx) / dur, 2.6 + Math.random() * 1.2, (tz - z) / dur], i * 3);
      this.life[i] = 1;
    }
  }
}

function HeatSink({ x, heat }: { x: number; heat: number }) {
  // One material for every fin, so the whole sink heats up together.
  const fin = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#55555d', metalness: 0.9, roughness: 0.32, emissive: new THREE.Color('#ff5a10'), emissiveIntensity: 0.05,
  }), []);
  useFrame((_, dt) => {
    fin.emissiveIntensity = damp(fin.emissiveIntensity, 0.05 + heat * 0.9, 4, dt);
  });
  const fins = 8;
  return (
    <group position={[x + ALU.x, TOP, ALU.z]}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[ALU.w + 0.2, 0.12, ALU.d + 0.2]} />
        <meshStandardMaterial color="#3a3a42" metalness={0.85} roughness={0.35} />
      </mesh>
      {Array.from({ length: fins }, (_, i) => (
        <mesh key={i} material={fin} position={[-ALU.w / 2 + 0.15 + i * ((ALU.w - 0.3) / (fins - 1)), 0.7, 0]}>
          <boxGeometry args={[0.07, 1.2, ALU.d]} />
        </mesh>
      ))}
    </group>
  );
}

function Sparks({ pool }: { pool: SparkPool }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const { pos, vel, life } = pool;
    for (let i = 0; i < SPARKS; i++) {
      if (life[i] <= 0) { o.scale.setScalar(0); }
      else {
        life[i] -= dt / 0.75;
        vel[i * 3 + 1] -= 7 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(TOP, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        o.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        o.scale.setScalar(Math.max(0, life[i]) * 1.2);
      }
      o.updateMatrix();
      mesh.current.setMatrixAt(i, o.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SPARKS]} frustumCulled={false}>
      <sphereGeometry args={[0.05, 6, 6]} />
      <meshBasicMaterial color="#ffb340" toneMapped={false} />
    </instancedMesh>
  );
}

/* ---------------- the board ---------------- */

interface Props {
  ours: Uint16Array;
  normal: Uint16Array;
  hot: ReadonlySet<number>;
  instr: Instr | null;
  normalInstr: Instr | null;
  stepKey: number;
  normalPc: number;
  direction: Direction;
  playing: boolean;
  phase: Phase;
  stuck: boolean;
  heat: number;
}

function Scene(p: Props & { resetKey: number }) {
  const color = tint(p.direction, p.phase);
  const backward = p.direction === 'backward';
  const logged = p.instr !== null && !isStrictInstr(p.instr);
  const op = !p.instr ? '—' : backward && !logged ? INVERSE_OP[(p.instr as StrictInstr).op] : p.instr.op;
  const sub = !p.instr ? '' : logged ? (backward ? 'restored from log' : 'saved to log') : backward ? `undoing ${p.instr.op}` : '';

  // Sparks: when the ordinary chip moves forward, each register it overwrote
  // throws its 16 old bits into the heat sink.
  const pool = useMemo(() => new SparkPool(), []);
  const prev = useRef({ regs: Uint16Array.from(p.normal), pc: p.normalPc });
  useEffect(() => {
    const before = prev.current;
    if (p.normalPc > before.pc) {
      const target = new THREE.Vector3(NORMAL_X + ALU.x, 0, ALU.z);
      for (let r = 0; r < 8; r++) {
        if (p.normal[r] !== before.regs[r]) pool.burst(NORMAL_X, rowZ(r), target, 16);
      }
    }
    prev.current = { regs: Uint16Array.from(p.normal), pc: p.normalPc };
  }, [p.normal, p.normalPc, pool]);

  return (
    <>
      <Rig resetKey={p.resetKey} />
      <FpsProbe />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-6, 14, 8]} intensity={1.6} />
      <directionalLight position={[10, 6, -6]} intensity={0.4} />
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={1.6} position={[0, 8, 4]} scale={[30, 6, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={0.6} position={[-10, 3, 6]} scale={[8, 4, 1]} />
      </Environment>

      <Pcb />
      <Pins />

      {/* U1: ours */}
      <Package x={OURS_X} />
      <Traces x={OURS_X} />
      <RowGlow x={OURS_X} hot={p.hot} color={color} />
      <Leds x={OURS_X} regs={p.ours} color={color} dim={false} />
      <Alu x={OURS_X} op={op} sub={sub} color={color} logged={logged} />
      <Pulse x={OURS_X} instr={p.instr} stepKey={p.stepKey} reverse={backward} color={logged ? C.loss : color} />

      {/* U2: the ordinary CPU */}
      <Package x={NORMAL_X} />
      <Traces x={NORMAL_X} />
      <Leds x={NORMAL_X} regs={p.normal} color={C.warm} dim={p.stuck} />
      <Pulse x={NORMAL_X} instr={p.normalInstr} stepKey={p.normalPc} reverse={false} color={C.loss} />
      <HeatSink x={NORMAL_X} heat={p.heat} />
      <Sparks pool={pool} />
    </>
  );
}

export function Board3D(p: Props) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="scene" style={{ height: 'clamp(220px, 17.5vw, 252px)' }}>
      <Canvas dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 200, position: [0, 20, 20] }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <color attach="background" args={['#070908']} />
        <Scene {...p} resetKey={resetKey} />
      </Canvas>
      <div className="scene-hint">drag to rotate · scroll to zoom</div>
      <button className="btn scene-reset" onClick={() => setResetKey((k) => k + 1)}>Reset view</button>
    </div>
  );
}
