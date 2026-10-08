'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { get } from '@/lib/api';
import { Search, Loader2, ArrowUp, ArrowDown, X } from 'lucide-react';
import clsx from 'clsx';
import {
  PageShell, Crumbs, ErrorBox, StatusBadge, fmtDate, fmtNum, linkCls,
} from '@/components/portal';

const PAGE = 50;
const KIND = { course: 'course', person: 'person', section: 'section', assignment: 'assignment' };

function Browse() {
  const { type } = useParams();
  const sp = useSearchParams();
  const group = sp.get('group') || '';

  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState(null);
  const [dir, setDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const gen = useRef(0);
  const sentinel = useRef(null);

  const url = useCallback((offset, qq, st, so, di) =>
    `/portal/list?type=${encodeURIComponent(type)}&offset=${offset}&limit=${PAGE}` +
    `&q=${encodeURIComponent(qq)}&status=${encodeURIComponent(st)}&group=${encodeURIComponent(group)}` +
    (so ? `&sort=${so}&dir=${di}` : ''), [type, group]);

  /* first page, restarted whenever search / filter / sort change */
  useEffect(() => {
    const id = ++gen.current;
    setLoading(true);
    const t = setTimeout(() => {
      get(url(0, q, status, sort, dir))
        .then(d => {
          if (id !== gen.current) return;
          setMeta(d); setRows(d.rows); setTotal(d.total); setError(null);
          if (!sort) { setSort(d.sort); setDir(d.dir); }
        })
        .catch(e => id === gen.current && setError(e.message))
        .finally(() => id === gen.current && setLoading(false));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [url, q, status, sort, dir]);

  const loadMore = useCallback(async () => {
    if (more || loading || rows.length >= total) return;
    const id = gen.current;
    setMore(true);
    try {
      const d = await get(url(rows.length, q, status, sort, dir));
      if (id === gen.current) setRows(r => [...r, ...d.rows]);
    } catch (e) { setError(e.message); }
    finally { setMore(false); }
  }, [more, loading, rows.length, total, url, q, status, sort, dir]);

  /* infinite scroll */
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(es => es[0].isIntersecting && loadMore(), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const toggleSort = (key) => {
    if (sort === key) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir('asc'); }
  };

  if (error && !meta) return <PageShell><ErrorBox message={error} /></PageShell>;

  const cols = meta?.columns || [];
  const link = meta?.link;

  const cell = (c, r, ci) => {
    const v = r[c.key];
    if (c.badge) return <StatusBadge status={v} />;
    if (c.date) return fmtDate(v);
    if (c.num) return fmtNum(v);
    if (v === null || v === undefined || v === '') return <span className="text-zinc-600">—</span>;
    if (c.courseLink && r.course_id) return <Link href={`/course/${r.course_id}`} className={linkCls}>{v}</Link>;
    if (ci === 0 && link) return <Link href={`/${KIND[link.kind]}/${r[link.key]}`} className={linkCls}>{v}</Link>;
    return v;
  };

  return (
    <PageShell>
      <div className="space-y-2">
        <Crumbs items={[
          { label: 'Overview', href: '/' },
          ...(meta?.group ? [{ label: meta.group.label, href: `/group/${meta.group.key}` }] : []),
          { label: meta?.title || type },
        ]} />
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold text-zinc-100">
            {meta?.title || type}
            {meta?.group && <span className="text-zinc-500 font-normal text-lg"> · {meta.group.label}</span>}
          </h1>
          <p className="text-sm text-zinc-500 tabular-nums">
            {loading && !meta ? '' : `${fmtNum(total)} ${q || status ? 'matching' : 'total'}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            id="search"
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={`Search ${(meta?.title || type).toLowerCase()}…`}
            className="w-full pl-9 pr-8 py-2 bg-surface-2 border border-surface-4 rounded-lg text-sm text-zinc-200
                       placeholder:text-zinc-600 focus:outline-none focus:border-accent/50"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" aria-label="Clear search">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {meta?.statuses?.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {[{ value: '', label: 'All' }, ...meta.statuses].map(s => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  status === s.value ? 'bg-accent/15 border-accent/40 text-accent' : 'border-surface-4 text-zinc-400 hover:text-zinc-200 hover:bg-surface-3')}
              >{s.label}</button>
            ))}
          </div>
        )}
        {group && (
          <Link href={`/browse/${type}`} className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1">
            <X className="w-3 h-3" /> Show all programs
          </Link>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}
                    className={clsx('px-4 py-2.5 text-xs font-medium uppercase tracking-wider bg-surface-1 border-b border-surface-4 whitespace-nowrap cursor-pointer select-none hover:text-zinc-300',
                      c.num ? 'text-right' : 'text-left', sort === c.key ? 'text-accent' : 'text-zinc-500')}>
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sort === c.key && (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={clsx(loading && meta && 'opacity-50 transition-opacity')}>
              {rows.map((r, i) => (
                <tr key={`${r.id ?? i}-${i}`} className="hover:bg-surface-3/40 transition-colors">
                  {cols.map((c, ci) => (
                    <td key={c.key} className={clsx('px-4 py-2.5 border-b border-surface-3 text-zinc-300',
                      c.num ? 'text-right tabular-nums' : 'text-left max-w-[380px] truncate')}
                      title={typeof r[c.key] === 'string' ? r[c.key] : undefined}>
                      {cell(c, r, ci)}
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={cols.length || 1} className="px-5 py-12 text-center text-sm text-zinc-500">
                  Nothing matches. Try a different search or status.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div ref={sentinel} className="h-10 flex items-center justify-center text-xs text-zinc-600">
          {(loading && !meta) || more ? <Loader2 className="w-4 h-4 animate-spin text-accent" />
            : rows.length > 0 && rows.length >= total ? `All ${fmtNum(total)} shown` : ''}
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </PageShell>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={null}>
      <Browse />
    </Suspense>
  );
}
