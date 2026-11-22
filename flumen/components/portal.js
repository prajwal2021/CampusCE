'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useScope } from '@/components/scope';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, ChevronRight, ArrowLeft } from 'lucide-react';
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

export function useFetch(rawPath) {
  const { scope } = useScope();
  const path = rawPath.startsWith('/portal/') ? `${rawPath}${rawPath.includes('?') ? '&' : '?'}scope=${scope}` : rawPath;
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    // keep showing the previous data while the next request loads, so filters don't blank the page
    setState(s => ({ data: s.data, error: null, loading: true }));
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
        <Link href={back} className="text-sm text-accent hover:underline mt-2 inline-block">Back to home</Link>
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

export function BackButton({ fallback = '/' }) {
  const router = useRouter();
  const goBack = () => (window.history.length > 1 ? router.back() : router.push(fallback));
  return (
    <button
      onClick={goBack}
      className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-lg border border-surface-4 text-sm text-zinc-300
                 hover:bg-surface-3 hover:text-zinc-100 transition-colors shrink-0"
      aria-label="Go back"
    >
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  );
}

export function Crumbs({ items }) {
  const parent = [...items].reverse().find(i => i.href)?.href || '/';
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <BackButton fallback={parent} />
      <nav className="flex items-center gap-1.5 text-sm text-zinc-500 flex-wrap min-w-0" aria-label="Breadcrumb">
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
            {it.href ? <Link href={it.href} className="hover:text-zinc-200 truncate">{it.label}</Link>
                     : <span className="text-zinc-300 truncate">{it.label}</span>}
          </span>
        ))}
      </nav>
    </div>
  );
}

export function Metric({ label, value, sub, href }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="metric-label">{label}</p>
        {href && <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />}
      </div>
      <p className="metric-value mt-2">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </>
  );
  const base = 'card-sm block relative overflow-hidden';
  return href
    ? <Link href={href} className={clsx(base, 'group hover:border-accent/50 hover:-translate-y-0.5 hover:shadow-pop transition-all duration-200')}>
        {body}
      </Link>
    : <div className={base}>{body}</div>;
}

export function Panel({ title, count, right, children }) {
  return (
    <section className="card p-0 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-surface-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {count !== undefined && <span className="px-2 py-0.5 rounded-full bg-surface-1 text-xs text-zinc-500 tabular-nums">{fmtNum(count)}</span>}
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
              <th key={i} className={clsx('px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 bg-surface-1 border-b border-surface-4 whitespace-nowrap',
                c.num ? 'text-right' : 'text-left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r) : ri} className="hover:bg-accent/[0.04] transition-colors">
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

export const linkCls = 'font-medium text-zinc-100 hover:text-accent hover:underline underline-offset-2';

export const L = {
  course: (id, text) => <Link href={`/course/${id}`} className={linkCls}>{text}</Link>,
  person: (id, text) => <Link href={`/person/${id}`} className={linkCls}>{text}</Link>,
  section: (id, text) => <Link href={`/section/${id}`} className={linkCls}>{text}</Link>,
  assignment: (id, text) => <Link href={`/assignment/${id}`} className={linkCls}>{text}</Link>,
};

export function PageShell({ children }) {
  return <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">{children}</div>;
}

/** Page title row: title, optional description and actions on the right. */
export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent mb-1">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-sub max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Shows a CampusCE number (or other ID) in a compact mono pill. */
export function IdPill({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-surface-4 bg-surface-1 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono font-semibold text-zinc-100">{value}</span>
    </span>
  );
}

export function Facts({ items }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-x-6 gap-y-3 px-5 py-4">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-zinc-500">{k}</dt>
          <dd className="text-sm text-zinc-200 mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
