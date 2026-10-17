import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CipherView, type ViewMode } from './views/CipherView.js';
import { PlaygroundView } from './views/PlaygroundView.js';
import { ClaudeView, type CompiledProgram } from './views/ClaudeView.js';
import { FormulaView } from './views/FormulaView.js';
import { Limits } from './ui/Limits.js';
import { useFps } from './three/fps.js';
import { Eye, Rewind } from './ui/icons.js';

type Tab = 'cipher' | 'playground' | 'claude' | 'formula';

const VIEW_KEY = 'no-delete:view';
function loadView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'tiles' || v === '3d' ? v : 'chip';
  } catch { return 'chip'; }
}
function saveView(v: ViewMode) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode: fine */ }
}

export function App() {
  const [tab, setTab] = useState<Tab>('cipher');
  const [inspector, setInspector] = useState(false);
  const [limits, setLimits] = useState(false);
  const [view, setViewState] = useState<ViewMode>(loadView);
  const [compiled, setCompiled] = useState<CompiledProgram | null>(null);
  const fps = useFps();

  const setView = (v: ViewMode) => { setViewState(v); saveView(v); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'Escape') { setLimits(false); setInspector(false); }
      if (e.key === 'i' || e.key === 'I') setInspector((v) => !v);
      if (e.key === 'l' || e.key === 'L') setLimits((v) => !v);
      if (e.key === '1') setTab('cipher');
      if (e.key === '2') setTab('playground');
      if (e.key === '3') setTab('claude');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'cipher', label: 'Secret message' },
    { id: 'playground', label: 'Playground' },
    { id: 'claude', label: 'Ask Claude' },
    ...(compiled ? [{ id: 'formula' as Tab, label: compiled.expression }] : []),
  ];
  const machineTab = tab !== 'claude';

  return (
    <div className="app">
      <div className="backdrop" aria-hidden>
        <div className="orb a" />
        <div className="orb b" />
        <div className="grid" />
        <div className="noise" />
      </div>

      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark"><Rewind size={16} /></span>
          No Delete <small>· a reversible computer</small>
        </div>
        <div className="segmented" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {tab === t.id && <motion.span layoutId="tab-pill" className="pill" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} />}
              {t.label}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          {tab === 'cipher' && (
            <div className="mode-toggle" role="group" aria-label="Display mode">
              <button aria-pressed={view === 'tiles'} onClick={() => setView('tiles')}>Tiles</button>
              <button aria-pressed={view === 'chip'} onClick={() => setView('chip')}>Chip</button>
              <button aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button>
              {view === '3d' && fps > 0 && <span className={`fps${fps < 50 ? ' low' : ''}`} title="3D frame rate">{fps} fps</span>}
            </div>
          )}
          <button className="btn" aria-pressed={limits} onClick={() => setLimits(true)} title="What's real, what's theoretical, what's cached (L)">
            Limits <span className="kbd">L</span>
          </button>
          {machineTab && (
            <button className="btn" aria-pressed={inspector} onClick={() => setInspector((v) => !v)}>
              <Eye size={15} />Look inside <span className="kbd">I</span>
            </button>
          )}
        </div>
      </nav>

      {tab === 'cipher' && <CipherView inspector={inspector} closeInspector={() => setInspector(false)} view={view} />}
      {tab === 'playground' && <PlaygroundView inspector={inspector} closeInspector={() => setInspector(false)} />}
      {tab === 'claude' && <ClaudeView onRun={(p) => { setCompiled(p); setTab('formula'); }} />}
      {tab === 'formula' && compiled && (
        <FormulaView key={compiled.source} program={compiled} inspector={inspector} closeInspector={() => setInspector(false)} />
      )}

      <AnimatePresence>{limits && <Limits onClose={() => setLimits(false)} />}</AnimatePresence>
    </div>
  );
}
