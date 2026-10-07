import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fetchAll } from './api/backend.js';
import { Admin } from './components/Admin';
import { Movements } from './components/Movements';
import { Summary } from './components/Summary';
import { LoadError } from './components/States';
import { S } from './state.js';
import { quickTransition, springTransition, surfaceMotion } from './motion';
import { nextTabIndex } from './utils/tabs';
import { applyTheme, currentTheme, type Theme } from './theme';

type Tab = 'resumen' | 'movimientos' | 'admin';

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  {
    id: 'resumen',
    label: 'Resumen',
    icon: <><path d="M4 20v-5l5-5 4 3.5L20 6v14z" stroke="none" /><path d="M4 15l5-5 4 3.5L20 6" fill="none" /><path d="M4 20h16" /></>,
  },
  {
    id: 'movimientos',
    label: 'Movimientos',
    icon: <path d="M7.5 20V4.5M4 8l3.5-3.5L11 8M16.5 4v15.5M13 16l3.5 3.5L20 16" fill="none" />,
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" /><path d="M12 14.5v2" /></>,
  },
];

export function App() {
  const [tab, setTab] = useState<Tab>('resumen');
  const [, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trmCached, setTrmCached] = useState(false);
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const refresh = useCallback(async () => {
    const result = await fetchAll();
    setError(result.error || '');
    setTrmCached(result.trm.cached);
    setRevision(value => value + 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const retry = () => {
    setLoading(true);
    void refresh();
  };

  const loadError = error && !loading && (
    <LoadError message={error} hasData={S.historial.length > 0} onRetry={retry} />
  );

  const chooseTheme = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <img className="logo" src="/fondi.svg" width="32" height="32" alt="Fondi" />
          <span className="header-title">Fondi</span>
        </div>
        <nav className="header-nav" role="tablist" aria-label="Secciones">
          {tabs.map((item, index) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                className={`nav-btn${active ? ' active' : ''}`}
                role="tab"
                id={`nav-${item.id}`}
                aria-controls={`tab-${item.id}`}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={event => {
                  const next = nextTabIndex(index, event.key, tabs.length);
                  if (next === null) return;
                  event.preventDefault();
                  const nextTab = tabs[next];
                  setTab(nextTab.id);
                  document.getElementById(`nav-${nextTab.id}`)?.focus();
                }}
              >
                {active && <motion.span className="nav-active" layoutId="active-navigation" transition={springTransition} />}
                <svg className="nav-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {item.icon}
                </svg>
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="header-right">
          <div className="theme-toggle" role="group" aria-label="Tema">
            <button type="button" aria-pressed={theme === 'light'} aria-label="Tema claro" onClick={() => chooseTheme('light')}>
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
            <button type="button" aria-pressed={theme === 'dark'} aria-label="Tema oscuro" onClick={() => chooseTheme('dark')}>
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <motion.section id="tab-resumen" className={`tab-content${tab === 'resumen' ? ' active' : ''}`} role="tabpanel" aria-labelledby="nav-resumen" hidden={tab !== 'resumen'} variants={surfaceMotion} initial="hidden" animate={tab === 'resumen' ? 'visible' : 'hidden'} transition={quickTransition}>
          {loadError}
          {!(error && !S.historial.length) && <Summary loading={loading} trmCached={trmCached} onGoAdmin={() => setTab('admin')} />}
        </motion.section>
        <motion.section id="tab-movimientos" className={`tab-content${tab === 'movimientos' ? ' active' : ''}`} role="tabpanel" aria-labelledby="nav-movimientos" hidden={tab !== 'movimientos'} variants={surfaceMotion} initial="hidden" animate={tab === 'movimientos' ? 'visible' : 'hidden'} transition={quickTransition}>
          {loadError}
          {!(error && !S.historial.length) && <Movements loading={loading} />}
        </motion.section>
        <motion.section id="tab-admin" className={`tab-content${tab === 'admin' ? ' active' : ''}`} role="tabpanel" aria-labelledby="nav-admin" hidden={tab !== 'admin'} variants={surfaceMotion} initial="hidden" animate={tab === 'admin' ? 'visible' : 'hidden'} transition={quickTransition}>
          <Admin onRefresh={refresh} />
        </motion.section>
      </main>

    </>
  );
}
