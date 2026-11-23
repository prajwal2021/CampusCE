'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, X } from 'lucide-react';
import clsx from 'clsx';
import { useScope, programParam } from '@/components/scope';

const CST = 'America/Chicago';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: CST });
const shift = (iso, days) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export const PRESETS = [
  { key: 'all', label: 'All time', range: () => [null, null], grain: 'month' },
  { key: '30d', label: 'Last 30 days', range: () => [shift(today(), -29), today()], grain: 'day' },
  { key: '90d', label: 'Last 90 days', range: () => [shift(today(), -89), today()], grain: 'week' },
  { key: '6m', label: 'Last 6 months', range: () => [shift(today(), -182), today()], grain: 'week' },
  { key: '12m', label: 'Last 12 months', range: () => [shift(today(), -364), today()], grain: 'month' },
  { key: 'ytd', label: 'Year to date', range: () => [today().slice(0, 4) + '-01-01', today()], grain: 'month' },
  { key: 'custom', label: 'Custom range', range: null },
];
export const GRAIN_LABEL = { day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };

/**
 * Filter state lives in the URL so a filtered view can be bookmarked or shared. The program is the
 * top-bar program (Career Learning Academy by default), shared by every page.
 */
export function useFilters(defaults = {}) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { scope, program, setProgram } = useScope();

  const f = useMemo(() => {
    const preset = sp.get('range') || defaults.range || 'all';
    const p = PRESETS.find(x => x.key === preset) || PRESETS[0];
    const [from, to] = p.range ? p.range() : [sp.get('from'), sp.get('to')];
    return {
      range: p.key, from: from || '', to: to || '',
      grain: sp.get('grain') || p.grain || 'month',
      group: programParam(program), course: sp.get('course') || '',
      compare: sp.get('compare') || 'prev',
      tests: sp.get('tests') === 'include',
    };
  }, [sp, defaults.range, program]);

  const set = useCallback((patch) => {
    const next = new URLSearchParams(sp.toString());
    if (patch.range && patch.range !== 'custom') { next.delete('from'); next.delete('to'); if (!('grain' in patch)) next.delete('grain'); }
    if (patch.range === 'custom') { next.set('from', f.from || shift(today(), -89)); next.set('to', f.to || today()); }
    if ('group' in patch) {
      if (patch.group !== f.group) next.delete('course');
      setProgram(patch.group || 'all');
    }
    next.delete('group');
    for (const [k, v] of Object.entries(patch)) if (k !== 'group') v ? next.set(k, v) : next.delete(k);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  }, [sp, router, path, f, setProgram]);

  const { ready } = useScope();
  const query = useMemo(() => {
    const p = new URLSearchParams({ scope, grain: f.grain, compare: f.compare });
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    if (f.group) p.set('group', f.group);
    if (f.course) p.set('course', f.course);
    if (f.tests) p.set('tests', 'include');
    return p.toString();
  }, [scope, f]);

  return { f, set, query, scope, ready };
}

/** Human-readable filter summary for exports and subtitles. */
export function describe(f, { programs = [], courses = [], scope } = {}) {
  const parts = [];
  const preset = PRESETS.find(p => p.key === f.range);
  parts.push(f.from || f.to ? `${f.from || 'start'} to ${f.to || 'today'}` : 'All time');
  if (preset && preset.key !== 'custom' && preset.key !== 'all') parts[0] = `${preset.label} (${parts[0]})`;
  if (f.group) parts.push(programs.find(p => p.key === f.group)?.label || f.group);
  if (f.course) { const c = courses.find(x => String(x.id) === String(f.course)); parts.push(c ? c.name : `Course ${f.course}`); }
  parts.push(scope === 'all' ? 'All Canvas courses' : 'CampusCE courses');
  parts.push(f.tests ? 'Test enrollments included' : 'Test enrollments excluded');
  return parts.join(' · ');
}

export function FilterBar({ f, set, programs = [], courses = [], showGrain = true, showCourse = true, showCompare = false, showTests = true, right }) {
  const active = f.group !== 'cla' || f.course || f.range !== 'all' || f.tests;
  return (
    <div className="card-sm flex flex-wrap items-end gap-3 py-3">
      <Field label="Date range">
        <div className="flex items-center gap-2">
          <select className="select" value={f.range} onChange={e => set({ range: e.target.value })}>
            {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {f.range === 'custom' && (
            <div className="flex items-center gap-1.5">
              <CalendarRange className="w-4 h-4 text-zinc-500" />
              <input type="date" className="select py-[7px]" value={f.from} max={f.to || undefined} onChange={e => set({ from: e.target.value })} aria-label="From" />
              <span className="text-zinc-500 text-sm">to</span>
              <input type="date" className="select py-[7px]" value={f.to} min={f.from || undefined} onChange={e => set({ to: e.target.value })} aria-label="To" />
            </div>
          )}
        </div>
      </Field>
      {showGrain && (
        <Field label="Interval">
          <select className="select" value={f.grain} onChange={e => set({ grain: e.target.value })}>
            {Object.entries(GRAIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      )}
      <Field label="Program">
        <select className="select w-[200px]" value={f.group} onChange={e => set({ group: e.target.value })}>
          <option value="">All programs</option>
          {programs.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </Field>
      {showCourse && (
        <Field label="Course">
          <select className="select w-[260px]" value={f.course} onChange={e => set({ course: e.target.value })}>
            <option value="">All courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}{c.sku ? ` (${c.sku})` : ''}</option>)}
          </select>
        </Field>
      )}
      {showCompare && (
        <Field label="Compare with">
          <select className="select" value={f.compare} onChange={e => set({ compare: e.target.value })}>
            <option value="prev">Previous period</option>
            <option value="yoy">Same period last year</option>
          </select>
        </Field>
      )}
      {showTests && (
        <Field label="Test enrollments">
          <select className="select" value={f.tests ? 'include' : ''} onChange={e => set({ tests: e.target.value })}
            title="CampusCE test accounts and enrollments marked on the Drops page">
            <option value="">Excluded</option>
            <option value="include">Included</option>
          </select>
        </Field>
      )}
      {active && (
        <button onClick={() => set({ range: 'all', group: 'cla', course: '', grain: '', tests: '' })}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-200 px-2 py-2">
          <X className="w-3.5 h-3.5" /> Reset
        </button>
      )}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={clsx('inline-flex items-center rounded-lg border border-surface-4 bg-surface-1 p-0.5', className)} role="group">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={clsx('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            value === o.value ? 'bg-surface-2 text-zinc-100 shadow-card' : 'text-zinc-500 hover:text-zinc-200')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
