'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, User, BookOpen, CornerDownLeft } from 'lucide-react';
import clsx from 'clsx';
import { get } from '@/lib/api';

/** Top-bar search: people by name or CampusCE number, courses by name or SKU. Press / or Ctrl+K. */
export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ people: [], courses: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    const onKey = e => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    const onDown = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes({ people: [], courses: [] }); return; }
    setLoading(true);
    let live = true;
    const t = setTimeout(() => {
      get(`/portal/search?q=${encodeURIComponent(term)}`)
        .then(d => { if (live) { setRes(d); setSel(0); } })
        .catch(() => {})
        .finally(() => live && setLoading(false));
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const items = [
    ...res.people.map(p => ({ href: `/person/${p.id}`, icon: User, title: p.name, meta: [p.ce_number, p.roles].filter(Boolean).join(' · ') })),
    ...res.courses.map(c => ({ href: `/course/${c.id}`, icon: BookOpen, title: c.name, meta: [c.sku, c.status].filter(Boolean).join(' · ') })),
  ];
  const go = it => { setOpen(false); setQ(''); input.current?.blur(); router.push(it.href); };
  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && items[sel]) go(items[sel]);
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
  };

  const show = open && q.trim().length >= 2;
  return (
    <div className="relative w-full max-w-xl" ref={box}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
      <input ref={input} value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        placeholder="Search students, CampusCE #, courses or SKU…" aria-label="Search"
        className="w-full pl-9 pr-16 py-2 rounded-lg bg-surface-1 border border-surface-4 text-sm text-zinc-200 placeholder:text-zinc-500
                   focus:outline-none focus:bg-surface-2 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors" />
      <span className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center gap-1 text-[10px] text-zinc-500">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <kbd className="px-1.5 py-0.5 rounded border border-surface-4 bg-surface-2 font-sans">Ctrl K</kbd>}
      </span>
      {show && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 rounded-xl border border-surface-4 bg-surface-2 shadow-pop p-1.5 pop-in max-h-[420px] overflow-y-auto">
          {items.length === 0 && !loading && <p className="px-3 py-6 text-sm text-center text-zinc-500">No matches for “{q.trim()}”.</p>}
          {res.people.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">People</p>}
          {items.map((it, i) => (
            <div key={it.href}>
              {i === res.people.length && res.courses.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Courses</p>}
              <button onMouseEnter={() => setSel(i)} onClick={() => go(it)}
                className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left', sel === i ? 'bg-surface-3' : '')}>
                <span className="w-8 h-8 rounded-lg bg-surface-1 border border-surface-4 flex items-center justify-center shrink-0"><it.icon className="w-4 h-4 text-zinc-400" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-100 truncate">{it.title}</span>
                  {it.meta && <span className="block text-xs text-zinc-500 truncate font-mono">{it.meta}</span>}
                </span>
                {sel === i && <CornerDownLeft className="w-3.5 h-3.5 text-zinc-500" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
