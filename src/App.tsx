import { useCallback, useEffect, useState } from 'react';
import { fetchAll } from './api/backend.js';
import { S } from './state.js';
import { Admin } from './components/Admin';
import { Movements } from './components/Movements';
import { Summary } from './components/Summary';
import { nextTabIndex } from './utils/tabs';

type Tab = 'resumen' | 'movimientos' | 'admin';

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  {
    id: 'resumen',
    label: 'Resumen',
    icon: <><rect x="4" y="12" width="3.5" height="8" /><rect x="10.25" y="7" width="3.5" height="13" /><rect x="16.5" y="4" width="3.5" height="16" /></>,
  },
  {
    id: 'movimientos',
    label: 'Movimientos',
    icon: <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></>,
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: <><line x1="6" y1="4" x2="6" y2="20" /><circle cx="6" cy="9" r="2.2" fill="currentColor" stroke="none" /><line x1="12" y1="4" x2="12" y2="20" /><circle cx="12" cy="15" r="2.2" fill="currentColor" stroke="none" /><line x1="18" y1="4" x2="18" y2="20" /><circle cx="18" cy="7" r="2.2" fill="currentColor" stroke="none" /></>,
  },
];

export function App() {
  const [tab, setTab] = useState<Tab>('resumen');
  const [, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trmCached, setTrmCached] = useState(false);
  const [toast, setToast] = useState('');

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const trm = Number(S.trm || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
                <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  {item.icon}
                </svg>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="header-right">
          <div className="trm-status">
            <div className="trm-badge">TRM {trmCached ? '~' : ''}${trm || '—'}</div>
            {trmCached && <span className="trm-cache-warning" role="status">TRM cacheada</span>}
          </div>
        </div>
      </header>

      <main className="main">
        <section id="tab-resumen" className={`tab-content${tab === 'resumen' ? ' active' : ''}`} role="tabpanel" aria-labelledby="nav-resumen" hidden={tab !== 'resumen'}>
          {error && <div className="error-banner visible" role="alert">Error cargando datos: {error}</div>}
          <Summary loading={loading} />
        </section>
        <section id="tab-movimientos" className={`tab-content${tab === 'movimientos' ? ' active' : ''}`} role="tabpanel" aria-labelledby="nav-movimientos" hidden={tab !== 'movimientos'}>
          <Movements loading={loading} />
        </section>
        <section id="tab-admin" className={`tab-content${tab === 'admin' ? ' active' : ''}`} role="tabpanel" aria-labelledby="nav-admin" hidden={tab !== 'admin'}>
          <Admin onRefresh={refresh} onToast={setToast} />
        </section>
      </main>

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
