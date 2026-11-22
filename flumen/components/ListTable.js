'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, ArrowUp, ArrowDown, X } from 'lucide-react';
import clsx from 'clsx';
import { get } from '@/lib/api';
import { useScope } from '@/components/scope';
import { StatusBadge, fmtDate, fmtNum, linkCls } from '@/components/portal';
import { ExportMenu } from '@/components/charts';
import { downloadCSV, downloadExcel, downloadPDF } from '@/lib/export';

const PAGE = 50;
const KIND = { course: 'course', person: 'person', section: 'section', assignment: 'assignment' };

/**
 * Searchable, sortable, infinitely scrolling list backed by /api/portal/list.
 * extra: additional query string (date range, course...) appended to every request.
 */
export default function ListTable({ type, group = '', extra = '', initialSort = null, initialDir = 'asc', onMeta, header, filtersLabel }) {
  const { scope } = useScope();
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [dir, setDir] = useState(initialDir);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const gen = useRef(0);
  const sentinel = useRef(null);

  const url = useCallback((offset, limit, qq, st, so, di, exp = false) =>
    `/portal/list?type=${encodeURIComponent(type)}&offset=${offset}&limit=${limit}` +
    `&q=${encodeURIComponent(qq)}&status=${encodeURIComponent(st)}&group=${encodeURIComponent(group)}&scope=${scope}` +
    (so ? `&sort=${so}&dir=${di}` : '') + (extra ? `&${extra}` : '') + (exp ? '&export=1' : ''), [type, group, scope, extra]);

  useEffect(() => {
    const id = ++gen.current;
    setLoading(true);
    const t = setTimeout(() => {
      get(url(0, PAGE, q, status, sort, dir))
        .then(d => {
          if (id !== gen.current) return;
          setMeta(d); setRows(d.rows); setTotal(d.total); setError(null);
          onMeta?.(d);
          if (!sort) { setSort(d.sort); setDir(d.dir); }
        })
        .catch(e => id === gen.current && setError(e.message))
        .finally(() => id === gen.current && setLoading(false));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, q, status, sort, dir]);

  const loadMore = useCallback(async () => {
    if (more || loading || rows.length >= total) return;
    const id = gen.current;
    setMore(true);
    try {
      const d = await get(url(rows.length, PAGE, q, status, sort, dir));
      if (id === gen.current) setRows(r => [...r, ...d.rows]);
    } catch (e) { setError(e.message); }
    finally { setMore(false); }
  }, [more, loading, rows.length, total, url, q, status, sort, dir]);

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

  const cols = meta?.columns || [];
  const link = meta?.link;
  const title = meta?.title || type;

  /* exports fetch every matching row (up to 5,000), not just the loaded page */
  const exportTable = async () => {
    const d = await get(url(0, 5000, q, status, sort, dir, true));
    return {
      columns: cols.map(c => ({ key: c.key, label: c.label, num: c.num, fmt: c.date ? v => (v ? fmtDate(v) : '') : undefined })),
      rows: d.rows,
    };
  };
  const label = [filtersLabel, q && `Search “${q}”`, status && `Status: ${meta?.statuses?.find(s => s.value === status)?.label}`].filter(Boolean).join(' · ');

  const cell = (c, r, ci) => {
    const v = r[c.key];
    if (c.badge) return <StatusBadge status={v} />;
    if (c.date) return fmtDate(v);
    if (c.num) return fmtNum(v);
    if (v === null || v === undefined || v === '') return <span className="text-zinc-600">—</span>;
    if (c.mono) return <span className="font-mono text-xs text-zinc-300">{v}</span>;
    if (c.programLink && r.program_key) return <Link href={`/group/${r.program_key}`} className="badge-info hover:bg-accent/20">{v}</Link>;
    if (c.courseLink && r.course_id) return <Link href={`/course/${r.course_id}`} className={linkCls}>{v}</Link>;
    if (ci === 0 && link) return <Link href={`/${KIND[link.kind]}/${r[link.key]}`} className={linkCls}>{v}</Link>;
    return v;
  };

  return (
    <section className="card p-0 overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-surface-4">
        {header}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`}
            className="input pl-9 pr-8 bg-surface-1" aria-label={`Search ${title}`} />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" aria-label="Clear search">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {meta?.statuses?.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {[{ value: '', label: 'All' }, ...meta.statuses].map(s => (
              <button key={s.value} onClick={() => setStatus(s.value)}
                className={clsx('chip', status === s.value ? 'bg-accent/10 border-accent/40 text-accent' : 'border-surface-4 text-zinc-400 hover:text-zinc-200 hover:bg-surface-3')}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500 tabular-nums whitespace-nowrap">{loading && !meta ? '' : `${fmtNum(total)} ${q || status ? 'matching' : 'total'}`}</span>
          {meta && (
            <ExportMenu
              onExcel={async () => downloadExcel({ title, sheets: [{ title, table: await exportTable() }], filters: label })}
              onCSV={async () => downloadCSV({ title, table: await exportTable(), filters: label })}
              onPDF={async () => downloadPDF({ title, reports: [{ title, subtitle: `${fmtNum(total)} records`, table: await exportTable() }], filters: label })}
            />
          )}
        </div>
      </div>

      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} onClick={() => toggleSort(c.key)}
                  className={clsx('px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider bg-surface-1 border-b border-surface-4 whitespace-nowrap cursor-pointer select-none hover:text-zinc-300',
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
              <tr key={`${r.id ?? i}-${i}`} className="hover:bg-accent/[0.03] transition-colors">
                {cols.map((c, ci) => (
                  <td key={c.key} className={clsx('px-4 py-2.5 border-b border-surface-3 text-zinc-300',
                    c.num ? 'text-right tabular-nums' : 'text-left max-w-[520px] truncate', (c.date || c.mono) && 'whitespace-nowrap')}
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
        <div ref={sentinel} className="sticky left-0 h-10 flex items-center justify-center text-xs text-zinc-600">
          {(loading && !meta) || more ? <Loader2 className="w-4 h-4 animate-spin text-accent" />
            : rows.length > 0 && rows.length >= total ? `All ${fmtNum(total)} shown` : ''}
        </div>
      </div>
      {error && <p className="px-4 pb-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}
