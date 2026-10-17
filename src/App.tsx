import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CipherView, type ViewMode } from './views/CipherView.js';
import { PlaygroundView } from './views/PlaygroundView.js';
import { Limits } from './ui/Limits.js';
import { useFps } from './three/fps.js';
import { Eye } from './ui/icons.js';

type Tab = 'message' | 'playground';

const VIEW_KEY = 'tenet:view';
function loadView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'chip' ? 'chip' : '3d'; } catch { return '3d'; }
}
function saveView(v: ViewMode) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode: fine */ }
}

export function App() {
  const [tab, setTab] = useState<Tab>('message');
  const [inspector, setInspector] = useState(false);
  const [limits, setLimits] = useState(false);
  const [view, setViewState] = useState<ViewMode>(loadView);
  const fps = useFps();
  const setView = (v: ViewMode) => { setViewState(v); saveView(v); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'Escape') { setLimits(false); setInspector(false); }
      if (e.key === 'i' || e.key === 'I') setInspector((v) => !v);
      if (e.key === 'l' || e.key === 'L') setLimits((v) => !v);
      if (e.key === '1') setTab('message');
      if (e.key === '2') setTab('playground');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'message', label: 'Demo' },
    { id: 'playground', label: 'Playground' },
  ];

  return (
    <div className="app">
      <nav className="topbar">
        <div className="brand" title="TENET reads the same forwards and backwards. So do its programs.">
          {/* The middle N is the mirror point of the palindrome; it takes the colour of time's direction. */}
          <span className="wordmark">TE<span className="mid">N</span>ET</span>
          <span className="silk">a computer that runs in reverse</span>
        </div>
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {tab === t.id && <motion.span layoutId="tab-underline" className="underline" transition={{ type: 'spring', bounce: 0, duration: 0.35 }} />}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          {tab === 'message' && (
            <>
              {view === '3d' && fps > 0 && <span className={`fps${fps < 50 ? ' low' : ''}`} title="3D frame rate">{fps} fps</span>}
              <div className="seg" role="group" aria-label="Board view">
                <button aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button>
                <button aria-pressed={view === 'chip'} onClick={() => setView('chip')}>Flat</button>
              </div>
            </>
          )}
          <button className="btn" aria-pressed={limits} onClick={() => setLimits(true)} title="What's real, what's theoretical, what's simplified">
            Limits <span className="kbd">L</span>
          </button>
          <button className="btn" aria-pressed={inspector} onClick={() => setInspector((v) => !v)}>
            <Eye size={14} />Look inside <span className="kbd">I</span>
          </button>
        </div>
      </nav>

      {tab === 'message' && <CipherView inspector={inspector} closeInspector={() => setInspector(false)} view={view} />}
      {tab === 'playground' && <PlaygroundView inspector={inspector} closeInspector={() => setInspector(false)} />}

      <AnimatePresence>{limits && <Limits onClose={() => setLimits(false)} />}</AnimatePresence>
    </div>
  );
}
