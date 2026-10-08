'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

/* ---------- formatting ---------- */

const CST = 'America/Chicago';

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: CST, month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: CST, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
export const fmtNum = n => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
export const fmtPct = n => (n === null || n === undefined ? '—' : `${Number(n)}%`);

/* ---------- data loading ---------- */

export function useFetch(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState({ data: null, error: null, loading: true });
    get(path)
      .then(data => live && setState({ data, error: null, loading: false }))
      .catch(e => live && setState({ data: null, error: e.message, loading: false }));
    return () => { live = false; };
  }, [path]);
  return state;
}

export function Loading() {
  return (
    <div className="flex justify-center py-24">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );
}

export function ErrorBox({ message, back = '/' }) {
  return (
    <div className="card flex items-start gap-3 border-red-500/30 bg-red-500/5 max-w-xl">
      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-red-300">{message}</p>
        <Link href={back} className="text-sm text-accent hover:underline mt-2 inline-block">Back to overview</Link>
      </div>
    </div>
  );
}

/* ---------- small building blocks ---------- */

const GOOD = ['Active', 'Published', 'Graded', 'Completed', 'Concluded'];
const WAIT = ['Submitted', 'Pending review', 'Invited'];
const BAD = ['Inactive', 'Unpublished', 'Not submitted'];

export function StatusBadge({ status }) {
  if (!status) return <span className="text-zinc-600">—</span>;
  const cls = GOOD.includes(status) ? 'badge-ok' : WAIT.includes(status) ? 'badge-info' : BAD.includes(status) ? 'badge-warn' : 'badge-info';
  return <span className={cls}>{status}</span>;
}

export function ProgressBar({ pct, label }) {
  if (pct === null || pct === undefined) return <span className="text-zinc-600">—</span>;
  const v = Math.max(0, Math.min(100, Number(pct)));
  const color = v >= 80 ? 'bg-emerald-500' : v >= 40 ? 'bg-accent' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2.5 min-w-[130px]" title={label}>
      <div className="flex-1 h-1.5 bg-surface-4 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs text-zinc-300 tabular-nums w-9 text-right">{v}%</span>
    </div>
  );
}

export function Crumbs({ items }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-zinc-500 flex-wrap" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          {it.href ? <Link href={it.href} className="hover:text-zinc-200 truncate">{it.label}</Link>
                   : <span className="text-zinc-300 truncate">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Metric({ label, value, sub, href }) {
  const body = (
    <>
      <p className="metric-label">{label}</p>
      <p className="metric-value mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </>
  );
  const base = 'card-sm block';
  return href
    ? <Link href={href} className={clsx(base, 'hover:border-accent/50 hover:bg-surface-3/60 transition-colors')}>{body}</Link>
    : <div className={base}>{body}</div>;
}

export function Panel({ title, count, right, children }) {
  return (
    <section className="card p-0 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-surface-4 flex items-center gap-3">
        <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
        {count !== undefined && <span className="text-xs text-zinc-500 tabular-nums">{fmtNum(count)}</span>}
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

/** Simple table. columns: [{ label, render(row), num?, className? }] */
export function Table({ columns, rows, empty = 'Nothing to show.', rowKey }) {
  if (!rows || rows.length === 0) return <p className="px-5 py-8 text-sm text-zinc-500 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={clsx('px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500 bg-surface-1 border-b border-surface-4 whitespace-nowrap',
                c.num ? 'text-right' : 'text-left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r) : ri} className="hover:bg-surface-3/40 transition-colors">
              {columns.map((c, i) => (
                <td key={i} className={clsx('px-4 py-2.5 border-b border-surface-3 text-zinc-300',
                  c.num ? 'text-right tabular-nums' : 'text-left', c.nowrap && 'whitespace-nowrap', c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const linkCls = 'text-zinc-100 hover:text-accent hover:underline underline-offset-2';

export const L = {
  course: (id, text) => <Link href={`/course/${id}`} className={linkCls}>{text}</Link>,
  person: (id, text) => <Link href={`/person/${id}`} className={linkCls}>{text}</Link>,
  section: (id, text) => <Link href={`/section/${id}`} className={linkCls}>{text}</Link>,
  assignment: (id, text) => <Link href={`/assignment/${id}`} className={linkCls}>{text}</Link>,
};

export function PageShell({ children }) {
  return <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-6">{children}</div>;
}

export function Facts({ items }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 px-5 py-4">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-zinc-500">{k}</dt>
          <dd className="text-sm text-zinc-200 mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
