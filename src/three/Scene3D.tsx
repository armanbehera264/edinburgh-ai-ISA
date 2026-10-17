/** Optional 3D mode for the Secret-message screen.
 *
 *  - Our computer: 16 glass cards that physically flip (a rotation, which can be
 *    undone) when their byte changes, in the direction time is running.
 *    Particles stream forward in amber, or back in cyan on rewind.
 *  - Normal computer: cards don't flip, they get overwritten. The old bits
 *    crumble into shards that fall away and never come back.
 *
 * Purely a view: it reads the machine's state and never touches the VM.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { glyphFor } from '../programs/cipher.js';
import { COLORS, dotTexture, glyphTexture } from './textures.js';
import { reportFps } from './fps.js';
import type { Direction, Phase } from '../machine/useMachine.js';

const CARD_W = 1;
const CARD_H = 1.25;
const CARD_D = 0.14;
const GAP = 0.14;
const PAIR_GAP = 0.24;
const ROW_W = 16 * CARD_W + 15 * GAP + 7 * PAIR_GAP;
const { damp } = THREE.MathUtils;
const NORMAL_SCALE = 0.72;
const INK = new THREE.Color();

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function cardX(i: number): number {
  return -ROW_W / 2 + CARD_W / 2 + i * (CARD_W + GAP) + Math.floor(i / 2) * PAIR_GAP;
}

function tintFor(dir: Direction, phase: Phase): THREE.Color {
  if (phase === 'restored') return COLORS.restored;
  return dir === 'backward' ? COLORS.backward : COLORS.forward;
}

// Pointer position over the whole window, so the hidden text input on top of
// the canvas doesn't block the parallax.
const pointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
}

/* ---------------- shared pieces ---------------- */

function FitCamera({ height, yOffset = 0, rowScale = 1 }: { height: number; yOffset?: number; rowScale?: number }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const aspect = size.width / size.height;
    // Leave room on both sides so the parallax tilt never clips the end cards.
    const byWidth = ((ROW_W / 2) * rowScale + 1.1) / (Math.tan(half) * aspect);
    const byHeight = (height / 2) / Math.tan(half);
    cam.position.set(0, yOffset, Math.max(byWidth, byHeight) + CARD_D);
    cam.lookAt(0, yOffset, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, height, yOffset, rowScale]);
  return null;
}

function Parallax({ children, strength = 1 }: { children: React.ReactNode; strength?: number }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    g.current.rotation.y = damp(g.current.rotation.y, pointer.x * 0.022 * strength, 3, dt);
    g.current.rotation.x = damp(g.current.rotation.x, pointer.y * 0.07 * strength, 3, dt);
  });
  return <group ref={g}>{children}</group>;
}

function Lights({ tint }: { tint: THREE.Color }) {
  const key = useRef<THREE.PointLight>(null!);
  useFrame((_, dt) => { key.current.color.lerp(tint, 1 - Math.exp(-5 * dt)); });
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 6, 10]} intensity={1.3} />
      <pointLight ref={key} position={[0, -1.2, 3.5]} intensity={6} distance={14} />
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={2.2} position={[0, 5, -4]} scale={[24, 2, 1]} />
        <Lightformer intensity={0.9} position={[-8, 0, 5]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer intensity={0.6} position={[8, -2, 5]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
      </Environment>
    </>
  );
}

function FpsProbe() {
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.time += dt;
    if (a.time >= 0.5) {
      reportFps(a.frames / a.time);
      a.frames = 0;
      a.time = 0;
    }
  });
  return null;
}

/* ---------------- a card ---------------- */

interface CardProps {
  index: number;
  byte: number;
  hot: boolean;
  scrambled: boolean;
  tint: THREE.Color;
  sign: 1 | -1;
  /** flip = reversible rotation; overwrite = old value is replaced in place */
  mode: 'flip' | 'overwrite';
  dim?: boolean;
}

function Card({ index, byte, hot, scrambled, tint, sign, mode, dim = false }: CardProps) {
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.MeshPhysicalMaterial>(null!);
  const faceA = useRef<THREE.MeshBasicMaterial>(null!);
  const faceB = useRef<THREE.MeshBasicMaterial>(null!);
  const st = useRef({ angle: 0, target: 0, byte, glow: 0, pop: 1 });

  const upFace = () => {
    const k = Math.round(st.current.target / Math.PI);
    return ((k % 2) + 2) % 2 === 0 ? faceA.current : faceB.current;
  };

  useLayoutEffect(() => {
    faceA.current.map = glyphTexture(glyphFor(byte));
    faceA.current.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = st.current;
    if (s.byte === byte) return;
    s.byte = byte;
    if (mode === 'flip') s.target += Math.PI * sign;
    else s.pop = 0.6;
    const face = upFace();
    face.map = glyphTexture(glyphFor(byte));
    face.needsUpdate = true;
    s.glow = 1;
  }, [byte, mode, sign]);

  useFrame((_, dt) => {
    const s = st.current;
    s.angle = reduceMotion ? s.target : damp(s.angle, s.target, 13, dt);
    s.glow = damp(s.glow, hot ? 0.85 : 0, hot ? 18 : 3, dt);
    s.pop = damp(s.pop, 1, 9, dt);
    group.current.rotation.x = s.angle;
    group.current.scale.setScalar(s.pop);
    body.current.emissive.copy(tint);
    body.current.emissiveIntensity = s.glow * 0.22;
    // Tinted, but kept light enough to read against the lit card.
    const ink = scrambled ? INK.copy(COLORS.plain).lerp(tint, 0.55) : COLORS.plain;
    for (const f of [faceA.current, faceB.current]) {
      f.color.lerp(ink, 1 - Math.exp(-8 * dt));
      f.opacity = damp(f.opacity, dim ? 0.3 : 1, 6, dt);
    }
  });

  const fw = CARD_W * 0.88;
  const fh = CARD_H * 0.88;
  return (
    <group position={[cardX(index), 0, 0]}>
      <group ref={group}>
        <RoundedBox args={[CARD_W, CARD_H, CARD_D]} radius={0.1} smoothness={3}>
          <meshPhysicalMaterial ref={body} color="#121217" roughness={0.32} metalness={0.15} clearcoat={1} clearcoatRoughness={0.25} />
        </RoundedBox>
        <mesh position={[0, 0, CARD_D / 2 + 0.003]}>
          <planeGeometry args={[fw, fh]} />
          <meshBasicMaterial ref={faceA} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -CARD_D / 2 - 0.003]} rotation={[Math.PI, 0, 0]}>
          <planeGeometry args={[fw, fh]} />
          <meshBasicMaterial ref={faceB} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------------- particles: the arrow of time ---------------- */

function TimeStream({ sign, active, tint }: { sign: 1 | -1; active: boolean; tint: THREE.Color }) {
  const N = 520;
  const geo = useRef<THREE.BufferGeometry>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const vel = useRef(0);
  const { positions, speeds } = useMemo(() => {
    const p = new Float32Array(N * 3);
    const s = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * (ROW_W + 3);
      p[i * 3 + 1] = (Math.random() - 0.5) * CARD_H * 1.9;
      p[i * 3 + 2] = -0.4 - Math.random() * 1.6;
      s[i] = 0.35 + Math.random() * 1.15;
    }
    return { positions: p, speeds: s };
  }, []);

  useFrame((_, dt) => {
    vel.current = damp(vel.current, active ? sign * 7.5 : sign * 0.35, 4, dt);
    const arr = geo.current.attributes.position.array as Float32Array;
    const half = (ROW_W + 3) / 2;
    for (let i = 0; i < N; i++) {
      let x = arr[i * 3] + vel.current * speeds[i] * dt;
      if (x > half) x -= half * 2;
      else if (x < -half) x += half * 2;
      arr[i * 3] = x;
    }
    geo.current.attributes.position.needsUpdate = true;
    mat.current.color.lerp(tint, 1 - Math.exp(-6 * dt));
    mat.current.opacity = damp(mat.current.opacity, active ? 0.95 : 0.3, 4, dt);
  });

  if (reduceMotion) return null;
  return (
    <points>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={mat}
        size={0.11}
        map={dotTexture()}
        transparent
        opacity={0.3}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

/* ---------------- shards: bits that are gone for good ---------------- */

const POOL = 768;

class ShardPool {
  pos = new Float32Array(POOL * 3);
  vel = new Float32Array(POOL * 3);
  spin = new Float32Array(POOL * 3);
  life = new Float32Array(POOL);
  next = 0;

  /** One shard per destroyed bit. */
  burst(x: number, y: number, count: number) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % POOL;
      this.pos.set([x + (Math.random() - 0.5) * CARD_W * 0.8, y + (Math.random() - 0.5) * CARD_H * 0.8, 0.1], i * 3);
      this.vel.set([(Math.random() - 0.5) * 2.2, 0.6 + Math.random() * 1.6, 0.6 + Math.random() * 1.8], i * 3);
      this.spin.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.life[i] = 1;
    }
  }
}

function Shards({ pool }: { pool: ShardPool }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const { pos, vel, spin, life } = pool;
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) {
        dummy.scale.setScalar(0);
      } else {
        life[i] -= dt / 1.5;
        vel[i * 3 + 1] -= 7 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        dummy.rotation.set(spin[i * 3] * life[i] * 3, spin[i * 3 + 1] * life[i] * 3, spin[i * 3 + 2]);
        dummy.scale.setScalar(Math.max(0, life[i]));
      }
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <boxGeometry args={[0.09, 0.09, 0.09]} />
      <meshStandardMaterial color={COLORS.shard} emissive={COLORS.shard} emissiveIntensity={0.6} roughness={0.4} />
    </instancedMesh>
  );
}

/* ---------------- the two scenes ---------------- */

interface OursProps {
  bytes: number[];
  hotRegs: ReadonlySet<number>;
  scrambled: boolean;
  direction: Direction;
  playing: boolean;
  phase: Phase;
}

export function OursScene({ bytes, hotRegs, scrambled, direction, playing, phase }: OursProps) {
  const tint = tintFor(direction, phase);
  const sign = direction === 'backward' ? -1 : 1;
  return (
    <div className="scene" style={{ height: 'clamp(100px, 8.6vw, 126px)' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 26, near: 0.1, far: 200, position: [0, 0, 40] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <FitCamera height={CARD_H * 1.7} />
        <Lights tint={tint} />
        <FpsProbe />
        <Parallax>
          <TimeStream sign={sign} active={playing} tint={tint} />
          {bytes.map((b, i) => (
            <Card
              key={i}
              index={i}
              byte={b}
              hot={hotRegs.has(Math.floor(i / 2))}
              scrambled={scrambled}
              tint={tint}
              sign={sign}
              mode="flip"
            />
          ))}
        </Parallax>
      </Canvas>
    </div>
  );
}

interface NormalProps {
  bytes: number[];
  pc: number;
  scrambled: boolean;
  stuck: boolean;
}

export function NormalScene({ bytes, pc, scrambled, stuck }: NormalProps) {
  const pool = useMemo(() => new ShardPool(), []);
  const prev = useRef({ bytes, pc });

  // When the normal computer moves forward, every register it overwrote
  // crumbles: one shard per destroyed bit.
  useEffect(() => {
    const before = prev.current;
    if (pc > before.pc) {
      for (let r = 0; r < 8; r++) {
        const changed = bytes[2 * r] !== before.bytes[2 * r] || bytes[2 * r + 1] !== before.bytes[2 * r + 1];
        if (changed) {
          pool.burst(cardX(2 * r), 0, 8);
          pool.burst(cardX(2 * r + 1), 0, 8);
        }
      }
    }
    prev.current = { bytes, pc };
  }, [bytes, pc, pool]);

  return (
    <div className="scene" style={{ height: 'clamp(64px, 5.6vw, 82px)' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 26, near: 0.1, far: 200, position: [0, 0, 40] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <FitCamera height={CARD_H * 1.5} yOffset={-0.25} rowScale={NORMAL_SCALE} />
        <Lights tint={COLORS.shard} />
        <Parallax strength={0.5}>
          <group scale={NORMAL_SCALE}>
          {bytes.map((b, i) => (
            <Card
              key={i}
              index={i}
              byte={b}
              hot={false}
              scrambled={scrambled}
              tint={COLORS.shard}
              sign={1}
              mode="overwrite"
              dim={stuck}
            />
          ))}
          <Shards pool={pool} />
          </group>
        </Parallax>
      </Canvas>
    </div>
  );
}
