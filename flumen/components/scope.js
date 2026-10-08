'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import clsx from 'clsx';

const KEY = 'flumen_scope';
const ScopeContext = createContext({ scope: 'ce', setScope: () => {} });

export function ScopeProvider({ children }) {
  const [scope, setScopeState] = useState('ce');

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === 'all') setScopeState('all'); } catch {}
  }, []);

  const setScope = (s) => {
    setScopeState(s);
    try { localStorage.setItem(KEY, s); } catch {}
  };

  return <ScopeContext.Provider value={{ scope, setScope }}>{children}</ScopeContext.Provider>;
}

export const useScope = () => useContext(ScopeContext);

export function ScopeToggle() {
  const { scope, setScope } = useScope();
  const opts = [
    { v: 'ce', label: 'CampusCE', hint: 'Courses created from CampusCE' },
    { v: 'all', label: 'All Canvas', hint: 'Every course in the Canvas extract, including development and sandbox courses' },
  ];
  return (
    <div className="flex items-center rounded-lg border border-surface-4 bg-surface-2 p-0.5 shrink-0" role="group" aria-label="Data scope">
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => setScope(o.v)}
          title={o.hint}
          aria-pressed={scope === o.v}
          className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
            scope === o.v ? 'bg-accent text-white' : 'text-zinc-400 hover:text-zinc-200')}
        >{o.label}</button>
      ))}
    </div>
  );
}
