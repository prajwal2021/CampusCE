'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Layers, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const KEY = 'flumen_scope';
const PROGRAM_KEY = 'flumen_program';

/** Program choices for the top bar. The new Career Learning Academy is the default view. */
export const PROGRAMS = [
  { key: 'cla', label: 'Career Learning Academy (new)', short: 'Career Learning Academy' },
  { key: 'all', label: 'All programs', short: 'All programs' },
  { key: 'mc', label: 'Microcertificates', short: 'Microcertificates' },
  { key: 'ccfcs', label: 'CCFCS', short: 'CCFCS' },
  { key: 'other', label: 'Everything else', short: 'Everything else' },
];
export const DEFAULT_PROGRAM = 'cla';

const ScopeContext = createContext({ scope: 'ce', setScope: () => {}, program: DEFAULT_PROGRAM, setProgram: () => {}, ready: true });

export function ScopeProvider({ children }) {
  const [scope, setScopeState] = useState('ce');
  const [program, setProgramState] = useState(DEFAULT_PROGRAM);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'all') setScopeState('all');
      const p = localStorage.getItem(PROGRAM_KEY);
      if (PROGRAMS.some(x => x.key === p)) setProgramState(p);
    } catch {}
    setReady(true);
  }, []);

  const setScope = (s) => {
    setScopeState(s);
    try { localStorage.setItem(KEY, s); } catch {}
  };
  const setProgram = (p) => {
    const v = PROGRAMS.some(x => x.key === p) ? p : 'all';
    setProgramState(v);
    try { localStorage.setItem(PROGRAM_KEY, v); } catch {}
  };

  return <ScopeContext.Provider value={{ scope, setScope, program, setProgram, ready }}>{children}</ScopeContext.Provider>;
}

export const useScope = () => useContext(ScopeContext);

/** The program filter to send to the API: '' means every program. */
export const programParam = p => (p && p !== 'all' ? p : '');
export const programLabel = p => PROGRAMS.find(x => x.key === p)?.short || 'All programs';

export function ProgramSelect() {
  const { program, setProgram } = useScope();
  return (
    <label className="relative flex items-center shrink-0" title="Which program every page shows">
      <Layers className="absolute left-2.5 w-4 h-4 text-accent pointer-events-none" />
      <span className="sr-only">Program</span>
      <select value={program} onChange={e => setProgram(e.target.value)}
        className="appearance-none pl-8 pr-8 py-1.5 rounded-lg border border-surface-4 bg-surface-1 text-xs font-semibold text-zinc-100
                   hover:bg-surface-2 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 max-w-[230px] truncate">
        {PROGRAMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
    </label>
  );
}

export function ScopeToggle() {
  const { scope, setScope } = useScope();
  const opts = [
    { v: 'ce', label: 'CampusCE', hint: 'Courses created from CampusCE' },
    { v: 'all', label: 'All Canvas', hint: 'Every course in the Canvas extract, including development and sandbox courses' },
  ];
  return (
    <div className="flex items-center rounded-lg border border-surface-4 bg-surface-1 p-0.5 shrink-0" role="group" aria-label="Data scope">
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => setScope(o.v)}
          title={o.hint}
          aria-pressed={scope === o.v}
          className={clsx('px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
            scope === o.v ? 'bg-surface-2 text-zinc-100 shadow-card' : 'text-zinc-500 hover:text-zinc-200')}
        >{o.label}</button>
      ))}
    </div>
  );
}
