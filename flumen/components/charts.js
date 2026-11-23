'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LabelList, Cell,
} from 'recharts';
import { Download, FileSpreadsheet, FileText, Table2, BarChart3, ChevronDown, Loader2, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { useChartColors } from '@/components/theme';
import { downloadCSV, downloadExcel, downloadPDF } from '@/lib/export';

/* ---------- formatting ---------- */

const CST = 'America/Chicago';
export const fmtN = n => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
export function fmtPeriod(v, grain = 'month', long = false) {
  if (!v) return '';
  const d = new Date(v);
  const o = { timeZone: 'UTC' };
  if (grain === 'year') return String(d.getUTCFullYear());
  if (grain === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (grain === 'month') return d.toLocaleDateString('en-US', { ...o, month: 'short', year: long ? 'numeric' : '2-digit' });
  return d.toLocaleDateString('en-US', { ...o, month: 'short', day: 'numeric', ...(long ? { year: 'numeric' } : {}) });
}
export const pctChange = (cur, prev) => (prev ? Math.round((1000 * (cur - prev)) / prev) / 10 : null);

/* ---------- export registry (for "Export all") ---------- */

const Registry = createContext(null);

export function ReportRegistry({ children }) {
  const items = useRef(new Map());
  const api = useRef({
    register: (id, get) => { items.current.set(id, get); return () => items.current.delete(id); },
    all: () => [...items.current.values()].map(g => g()).filter(Boolean),
  });
  return <Registry.Provider value={api.current}>{children}</Registry.Provider>;
}
export const useRegistry = () => useContext(Registry);

/* ---------- menus ---------- */

export function ExportMenu({ onPDF, onExcel, onCSV, label = 'Export', compact = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } catch (e) { console.error(e); alert('Export failed: ' + e.message); } finally { setBusy(null); setOpen(false); }
  };
  const item = (kind, Icon, text, fn) => fn && (
    <button onClick={() => run(kind, fn)} disabled={!!busy}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-surface-3 hover:text-zinc-100 rounded-md disabled:opacity-50">
      {busy === kind ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <Icon className="w-4 h-4 text-zinc-500" />}
      {text}
    </button>
  );
  return (
    <div className="relative" ref={ref} data-no-export>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={clsx('inline-flex items-center gap-1.5 rounded-lg border border-surface-4 text-zinc-300 hover:bg-surface-3 hover:text-zinc-100 transition-colors',
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm font-medium')}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-48 z-40 rounded-lg border border-surface-4 bg-surface-2 shadow-pop p-1 pop-in">
          {item('pdf', FileText, 'PDF report', onPDF)}
          {item('xlsx', FileSpreadsheet, 'Excel workbook', onExcel)}
          {item('csv', Table2, 'CSV file', onCSV)}
        </div>
      )}
    </div>
  );
}

/* ---------- report card ---------- */

/**
 * A titled chart with a Chart/Table switch and exports. table: { columns, rows } is the data behind the
 * chart, shown in table view and written to the exports.
 */
export function ReportCard({ title, subtitle, table, filters, dataAsOf, children, className, right, minH = 300, footer }) {
  const [view, setView] = useState('chart');
  const chartRef = useRef(null);
  const reg = useRegistry();
  const id = useId();
  const latest = useRef(null);
  latest.current = { title, subtitle, table, node: chartRef.current };
  useEffect(() => reg?.register(id, () => (latest.current.table ? { ...latest.current, node: chartRef.current } : null)), [reg, id]);

  const pdf = () => downloadPDF({ title, reports: [{ title, subtitle, node: chartRef.current, table }], filters, dataAsOf });
  const xlsx = () => downloadExcel({ title, sheets: [{ title, table }], filters, dataAsOf });
  const csv = () => downloadCSV({ title, table, filters, dataAsOf });

  return (
    <section className={clsx('card p-0 flex flex-col', className)}>
      <div className="px-5 pt-4 pb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="section-title">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {table && (
            <div className="flex items-center rounded-lg border border-surface-4 p-0.5" role="group" aria-label="View">
              {[['chart', BarChart3, 'Chart'], ['table', Table2, 'Table']].map(([v, Icon, label]) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} title={`${label} view`}
                  className={clsx('p-1.5 rounded-md transition-colors', view === v ? 'bg-surface-3 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200')}>
                  <Icon className="w-3.5 h-3.5" /><span className="sr-only">{label}</span>
                </button>
              ))}
            </div>
          )}
          {table && <ExportMenu compact onPDF={pdf} onExcel={xlsx} onCSV={csv} />}
        </div>
      </div>
      <div className="px-3 pb-4 flex-1" style={{ minHeight: minH }}>
        <div ref={chartRef} className={clsx('bg-surface-2 h-full px-2', view !== 'chart' && 'hidden')}>{children}</div>
        {view === 'table' && table && <DataTable table={table} />}
      </div>
      {footer && <div className="px-5 py-3 border-t border-surface-3 text-xs text-zinc-500">{footer}</div>}
    </section>
  );
}

export function DataTable({ table, max = 400 }) {
  if (!table.rows.length) return <Empty />;
  return (
    <div className="overflow-auto max-h-[420px] mx-2 rounded-lg border border-surface-3">
      <table className="w-full text-sm">
        <thead className="sticky top-0">
          <tr>{table.columns.map(c => (
            <th key={c.key} className={clsx('px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 bg-surface-1 border-b border-surface-4 whitespace-nowrap', c.num ? 'text-right' : 'text-left')}>{c.label}</th>
          ))}</tr>
        </thead>
        <tbody>
          {table.rows.slice(0, max).map((r, i) => (
            <tr key={i} className="hover:bg-surface-3/50">
              {table.columns.map(c => {
                const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
                return <td key={c.key} className={clsx('px-3 py-2 border-b border-surface-3 text-zinc-300', c.num && 'text-right tabular-nums')}>
                  {c.link && r[c.link.key] ? <Link href={c.link.href(r)} className="font-medium text-zinc-100 hover:text-accent">{v}</Link> : (v ?? '—')}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ text = 'No data for these filters.' }) {
  return <div className="h-full min-h-[200px] flex items-center justify-center text-sm text-zinc-500">{text}</div>;
}

/* ---------- chart pieces ---------- */

function TipBox({ active, payload, label, labelFmt, valueFmt = fmtN }) {
  const c = useChartColors();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 shadow-pop text-xs" style={{ background: c.tipBg, borderColor: c.tipBorder }}>
      <p className="font-semibold mb-1" style={{ color: c.tipLabel }}>{labelFmt ? labelFmt(label) : label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.payload?.fill }} />
          <span style={{ color: c.muted }}>{p.name}</span>
          <span className="ml-auto pl-4 font-semibold tabular-nums" style={{ color: c.text }}>{valueFmt(p.value, p.dataKey)}</span>
        </div>
      ))}
    </div>
  );
}

const axis = c => ({ stroke: c.axis, fontSize: 11, tickLine: false, axisLine: false });

/* Category ticks: one truncated line down the side, or up to two short lines under columns. */
function SideTick({ x, y, payload, width, fill }) {
  const max = Math.max(8, Math.floor((width - 10) / 7.2));
  const s = String(payload.value ?? '');
  const t = s.length > max ? s.slice(0, max - 1) + '…' : s;
  return <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={11} fill={fill}><title>{s}</title>{t}</text>;
}
function UnderTick({ x, y, payload, fill, perLine = 14 }) {
  const words = String(payload.value ?? '').split(' ');
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > perLine && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return (
    <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill={fill}>
      {lines.slice(0, 2).map((l, i) => <tspan key={i} x={x} dy={i ? 13 : 0}>{i === 1 && lines.length > 2 ? l + '…' : l}</tspan>)}
    </text>
  );
}
const legendStyle = c => ({ fontSize: 12, color: c.muted, paddingTop: 8 });

/** Time series. series: [{ key, label, slot?, color? }]; kind: 'area' | 'line' | 'bar'. */
export function TrendChart({ data, series, grain = 'month', kind: wanted = 'area', height = 280, stacked = false, valueFmt }) {
  const c = useChartColors();
  if (!data?.length) return <Empty />;
  // a line through two or three points reads as a cliff; columns are honest for short histories
  const kind = data.length <= 6 ? 'bar' : wanted;
  const color = i => series[i].color || c.series[series[i].slot ?? i];
  const common = { data, margin: { top: 10, right: 12, left: -8, bottom: 0 } };
  const x = <XAxis dataKey="period" tickFormatter={v => fmtPeriod(v, grain)} {...axis(c)} minTickGap={24} />;
  const y = <YAxis {...axis(c)} allowDecimals={false} width={48} tickFormatter={valueFmt || fmtN} />;
  const grid = <CartesianGrid stroke={c.grid} vertical={false} />;
  const tip = <Tooltip content={<TipBox labelFmt={v => fmtPeriod(v, grain, true)} valueFmt={valueFmt} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />;
  const legend = series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle(c)} /> : null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === 'bar' ? (
        <BarChart {...common} barGap={2}>
          {grid}{x}{y}
          <Tooltip content={<TipBox labelFmt={v => fmtPeriod(v, grain, true)} valueFmt={valueFmt} />} cursor={{ fill: c.grid, opacity: 0.5 }} />
          {legend}
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(i)} radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={36} stroke={c.surface} strokeWidth={stacked ? 1 : 0} />)}
        </BarChart>
      ) : kind === 'line' ? (
        <LineChart {...common}>
          {grid}{x}{y}{tip}{legend}
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(i)} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />)}
        </LineChart>
      ) : (
        <AreaChart {...common}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color(i)} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color(i)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {grid}{x}{y}{tip}{legend}
          {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(i)} strokeWidth={2} fill={`url(#g-${s.key})`} stackId={stacked ? 'a' : undefined} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />)}
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

/**
 * Category bars. series: [{ key, label }]. horizontal lays categories down the side (good for long names).
 * colorBy: 'series' (default) or 'category' when a single series should give each bar its own identity.
 */
export function Bars({ data, category = 'label', series, horizontal = false, stacked = false, height, valueFmt, labels = false, catWidth = 180, onClick }) {
  const c = useChartColors();
  if (!data?.length) return <Empty />;
  const h = height || (horizontal ? Math.max(180, data.length * (series.length > 1 && !stacked ? 44 : 34) + 40) : 280);
  const perLine = Math.min(22, Math.max(8, Math.floor((70 / Math.max(1, data.length)) * 1.6)));
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} barGap={2} barCategoryGap={horizontal ? '22%' : '28%'}
        margin={{ top: 10, right: labels ? 40 : 12, left: horizontal ? 4 : -8, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (<>
          <XAxis type="number" {...axis(c)} allowDecimals={false} tickFormatter={valueFmt || fmtN} />
          <YAxis type="category" dataKey={category} {...axis(c)} width={catWidth} interval={0} tick={<SideTick width={catWidth} fill={c.axis} />} />
        </>) : (<>
          <XAxis dataKey={category} {...axis(c)} interval={0} height={36} tick={<UnderTick fill={c.axis} perLine={perLine} />} />
          <YAxis {...axis(c)} allowDecimals={false} width={48} tickFormatter={valueFmt || fmtN} />
        </>)}
        <Tooltip content={<TipBox valueFmt={valueFmt} />} cursor={{ fill: c.grid, opacity: 0.45 }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle(c)} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || c.series[s.slot ?? i]} stackId={stacked ? 'a' : undefined}
            radius={stacked && i < series.length - 1 ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 22 : 44}
            stroke={c.surface} strokeWidth={stacked ? 1 : 0} onClick={onClick} cursor={onClick ? 'pointer' : undefined}>
            {labels && !stacked && <LabelList dataKey={s.key} position={horizontal ? 'right' : 'top'} formatter={valueFmt || fmtN} style={{ fill: c.muted, fontSize: 11 }} />}
            {s.cellColors && data.map((d, di) => <Cell key={di} fill={s.cellColors(d, di, c)} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Tiny trend line for KPI cards. */
export function Sparkline({ data, k, height = 36 }) {
  const c = useChartColors();
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.series[0]} stopOpacity={0.25} />
            <stop offset="100%" stopColor={c.series[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={k} stroke={c.series[0]} strokeWidth={1.5} fill={`url(#sp-${k})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Change against the previous period, with an icon so it never relies on colour alone. */
export function Delta({ cur, prev, invert = false, suffix = 'vs previous period' }) {
  const d = pctChange(cur, prev);
  if (d === null) return <span className="text-xs text-zinc-500">{prev === 0 && cur > 0 ? `New ${suffix}` : ' '}</span>;
  const up = d > 0, flat = d === 0;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={clsx('inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-md',
        good === null ? 'bg-surface-3 text-zinc-400' : good ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
        <Icon className="w-3 h-3" />{Math.abs(d)}%
      </span>
      <span className="text-zinc-500">{suffix}</span>
    </span>
  );
}

/** Headline number card. */
export function Kpi({ label, value, sub, icon: Icon, delta, spark, href }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-zinc-500">{label}</p>
        {Icon && <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center"><Icon className="w-4 h-4" /></span>}
      </div>
      <p className="text-[28px] leading-none font-semibold text-zinc-100 tabular-nums tracking-tight mt-2">{value}</p>
      <div className="mt-2 min-h-[20px]">{delta || (sub && <p className="text-xs text-zinc-500">{sub}</p>)}</div>
      {delta && sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
      {spark && <div className="mt-2 -mx-1">{spark}</div>}
    </>
  );
  const cls = 'card-sm block transition-all';
  return href
    ? <Link href={href} className={clsx(cls, 'hover:border-accent/50 hover:shadow-pop hover:-translate-y-0.5')}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Horizontal share bars, for a handful of categories (status, recency...). */
export function ShareBars({ items, total, colors }) {
  const c = useChartColors();
  const sum = total ?? items.reduce((s, i) => s + (i.value || 0), 0);
  if (!sum) return <Empty />;
  return (
    <div className="space-y-3.5 px-2 pt-1">
      {items.map((it, i) => {
        const pct = sum ? (100 * (it.value || 0)) / sum : 0;
        return (
          <div key={it.label}>
            <div className="flex items-baseline justify-between text-sm mb-1.5">
              <span className="text-zinc-300 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors?.[i] || c.series[i] }} />{it.label}</span>
              <span className="tabular-nums"><span className="font-semibold text-zinc-100">{fmtN(it.value)}</span><span className="text-zinc-500 text-xs ml-1.5">{pct.toFixed(1)}%</span></span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors?.[i] || c.series[i] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
