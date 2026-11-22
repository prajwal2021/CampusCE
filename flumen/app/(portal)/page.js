'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Users, GraduationCap, CheckCircle2, TrendingUp, BookOpen, UserSquare2, ArrowRight, FileBarChart2, RefreshCw,
  Search, Layers, ListChecks,
} from 'lucide-react';
import { useFetch, Loading, ErrorBox, PageShell, StatusBadge, fmtNum, fmtDate, fmtDateTime, linkCls } from '@/components/portal';
import { Kpi, Delta, Sparkline, TrendChart, Bars, ShareBars, ReportCard } from '@/components/charts';
import { useScope } from '@/components/scope';
import { useChartColors } from '@/components/theme';

const CST = 'America/Chicago';
const day = (offset = 0) => { const d = new Date(Date.now() + offset * 86400000); return d.toLocaleDateString('en-CA', { timeZone: CST }); };

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: CST, hour: 'numeric', hour12: false }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function ago(iso) {
  if (!iso) return null;
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return 'less than an hour ago';
  if (h < 48) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

export default function Home() {
  const { scope } = useScope();
  const c = useChartColors();
  const summary = useFetch('/portal/summary');
  const all = useFetch('/portal/enrollments?grain=month');
  const recent = useFetch(`/portal/enrollments?grain=day&from=${day(-29)}&to=${day(0)}`);
  const latest = useFetch('/portal/list?type=enrollments&sort=enrolled&dir=desc&limit=8');

  if (summary.loading || all.loading) return <Loading />;
  if (summary.error || all.error) return <PageShell><ErrorBox message={summary.error || all.error} /></PageShell>;

  const s = summary.data;
  const e = all.data;
  const r = recent.data;
  const k = e.kpis;
  const trend = e.trend.slice(-18);
  const fresh = ago(s.data_as_of);
  const stale = s.data_as_of && Date.now() - new Date(s.data_as_of).getTime() > 24 * 3600000;

  return (
    <PageShell>
      {/* welcome */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">{greeting()}</h1>
          <p className="page-sub">
            Enrollments, completions and programs across {scope === 'ce' ? 'CampusCE courses' : 'every Canvas course'} at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {fresh && (
            <span title={`Last sync ${fmtDateTime(s.data_as_of)} CST`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${stale ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`}>
              <RefreshCw className="w-3.5 h-3.5" /> Data synced {fresh}
            </span>
          )}
          <Link href="/enrollments" className="btn-outline"><Users className="w-4 h-4" /> Enrollments</Link>
          <Link href="/reports" className="btn-primary"><FileBarChart2 className="w-4 h-4" /> Reports</Link>
        </div>
      </div>

      {/* headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
        <Kpi label="Enrollments" icon={Users} value={fmtNum(k.enrollments)} href="/enrollments"
          delta={r ? <Delta cur={r.kpis.enrollments} prev={r.previous?.enrollments} suffix="last 30 days" /> : null}
          sub={r ? `${fmtNum(r.kpis.enrollments)} new in the last 30 days` : null}
          spark={<Sparkline data={trend} k="enrollments" />} />
        <Kpi label="Students" icon={GraduationCap} value={fmtNum(s.students)} sub={`${fmtNum(s.students_active)} currently active`} href="/browse/students" />
        <Kpi label="Finished all assignments" icon={CheckCircle2} value={k.finished_rate === null ? '—' : `${k.finished_rate}%`}
          sub={`${fmtNum(k.finished_all)} enrollments · ${k.completion_rate ?? 0}% concluded in Canvas`} href="/reports?tab=completion" />
        <Kpi label="Avg assignment progress" icon={TrendingUp} value={k.avg_progress === null ? '—' : `${k.avg_progress}%`}
          sub="Published assignments turned in, per enrollment" href="/enrollments" />
        <Kpi label="Courses" icon={BookOpen} value={fmtNum(s.courses)} sub={`${fmtNum(s.courses_published)} published`} href="/browse/courses" />
        <Kpi label="Instructors" icon={UserSquare2} value={fmtNum(s.instructors)} sub={`${fmtNum(s.instructors_active)} active`} href="/browse/instructors" />
      </div>

      {/* trend + status */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ReportCard className="xl:col-span-2" title="Enrollments over time" subtitle="New enrollments and completions per month"
          dataAsOf={s.data_as_of} filters={scope === 'ce' ? 'CampusCE courses, all time' : 'All Canvas courses, all time'}
          right={<Link href="/reports" className="text-xs font-medium text-accent hover:underline hidden sm:inline">Open reports</Link>}
          table={{ columns: [
            { key: 'period', label: 'Month', fmt: v => new Date(v).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }) },
            { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completions', label: 'Completions', num: true },
          ], rows: e.trend }}>
          <TrendChart data={trend} grain="month" series={[{ key: 'enrollments', label: 'Enrollments' }, { key: 'completions', label: 'Completions' }]} height={300} />
        </ReportCard>

        <ReportCard title="Enrollment status" subtitle="Where every enrollment stands today" dataAsOf={s.data_as_of}
          table={{ columns: [{ key: 'label', label: 'Status' }, { key: 'value', label: 'Enrollments', num: true }], rows: e.by_status }}
          minH={240}
          footer={<span>{fmtNum(k.students)} students across {fmtNum(k.courses)} courses with enrollments.</span>}>
          <div className="pt-2"><ShareBars items={e.by_status} colors={[c.series[0], c.series[2], c.series[7], c.series[3]]} /></div>
        </ReportCard>
      </div>

      {/* programs + top courses */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ReportCard title="Enrollments by program" subtitle="Select a program to open it" dataAsOf={s.data_as_of}
          right={<Link href="/programs" className="text-xs font-medium text-accent hover:underline">All programs</Link>}
          table={{ columns: [{ key: 'label', label: 'Program' }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'students', label: 'Students', num: true }], rows: e.by_program }}>
          <Bars data={e.by_program} horizontal catWidth={190} labels height={Math.max(300, e.by_program.length * 70)}
            series={[{ key: 'enrollments', label: 'Enrollments' }, { key: 'completed', label: 'Completed' }]}
            onClick={d => { const k = d?.payload?.key || d?.key; if (k) window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/group/${k}`; }} />
        </ReportCard>

        <section className="card p-0 overflow-hidden flex flex-col">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div>
              <h3 className="section-title">Top courses</h3>
              <p className="text-xs text-zinc-500 mt-0.5">By enrollments, with the share who finished every assignment</p>
            </div>
            <Link href="/browse/courses" className="text-xs font-medium text-accent hover:underline">All courses</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup><col /><col className="w-[84px]" /><col className="w-[72px]" /><col className="w-[124px]" /></colgroup>
              <thead><tr>
                {['Course', 'Enrolled', 'Active', 'Finished all'].map((h, i) => (
                  <th key={h} className={`${i ? 'px-3' : 'px-5'} py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 bg-surface-1 border-y border-surface-4 ${i ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {e.by_course.slice(0, 8).map(row => (
                  <tr key={row.id} className="hover:bg-surface-3/50">
                    <td className="px-5 py-2.5 border-b border-surface-3 min-w-0">
                      <Link href={`/course/${row.id}`} className={`${linkCls} block truncate`} title={row.name}>{row.name}</Link>
                      {row.sku && <span className="text-[11px] font-mono text-zinc-500">{row.sku}</span>}
                    </td>
                    <td className="px-3 py-2.5 border-b border-surface-3 text-right tabular-nums text-zinc-300">{fmtNum(row.enrollments)}</td>
                    <td className="px-3 py-2.5 border-b border-surface-3 text-right tabular-nums text-zinc-300">{fmtNum(row.active)}</td>
                    <td className="pl-3 pr-5 py-2.5 border-b border-surface-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${row.finished_rate || 0}%`, background: c.series[0] }} /></div>
                        <span className="text-xs tabular-nums text-zinc-300 w-9 text-right">{row.finished_rate ?? 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {e.by_course.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-zinc-500">No enrollments yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* recent + shortcuts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="card p-0 overflow-hidden xl:col-span-2">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div>
              <h3 className="section-title">Latest enrollments</h3>
              <p className="text-xs text-zinc-500 mt-0.5">The most recent sign-ups in the data</p>
            </div>
            <Link href="/browse/enrollments?sort=enrolled" className="text-xs font-medium text-accent hover:underline">All enrollment records</Link>
          </div>
          <ul className="divide-y divide-surface-3 border-t border-surface-4">
            {(latest.data?.rows || []).map(row => (
              <li key={row.id} className="px-5 py-3 flex items-center gap-4 hover:bg-surface-3/40">
                <span className="w-9 h-9 rounded-full bg-accent/10 text-accent text-xs font-semibold flex items-center justify-center shrink-0">
                  {String(row.student || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    <Link href={`/person/${row.user_id}`} className={linkCls}>{row.student}</Link>
                    {row.ce_number && <span className="ml-2 text-[11px] font-mono text-zinc-500">{row.ce_number}</span>}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    <Link href={`/course/${row.course_id}`} className="hover:text-zinc-200">{row.course}</Link>
                  </p>
                </div>
                <StatusBadge status={row.status} />
                <span className="text-xs text-zinc-500 tabular-nums w-24 text-right hidden sm:block">{fmtDate(row.enrolled)}</span>
              </li>
            ))}
            {latest.loading && <li className="px-5 py-8 text-center text-sm text-zinc-500">Loading…</li>}
          </ul>
        </section>

        <section className="card">
          <h3 className="section-title">Jump to</h3>
          <p className="text-xs text-zinc-500 mt-0.5 mb-4">Common places to start</p>
          <div className="grid grid-cols-1 gap-2">
            {[
              { href: '/enrollments', icon: Users, title: 'Enrollment dashboard', text: 'Filter by date, program and course' },
              { href: '/reports', icon: FileBarChart2, title: 'Reports', text: 'Trends, comparisons and exports' },
              { href: '/browse/students', icon: Search, title: 'Find a student', text: 'By name or CampusCE number' },
              { href: '/programs', icon: Layers, title: 'Programs', text: 'CLA, microcertificates, CCFCS' },
              { href: '/browse/enrollments', icon: ListChecks, title: 'Enrollment records', text: 'Every enrollment, searchable' },
            ].map(l => (
              <Link key={l.href} href={l.href} className="group flex items-center gap-3 p-3 rounded-lg border border-surface-4 hover:border-accent/40 hover:bg-surface-3/40 transition-colors">
                <span className="w-9 h-9 rounded-lg bg-surface-1 border border-surface-4 flex items-center justify-center shrink-0"><l.icon className="w-4 h-4 text-accent" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-100">{l.title}</span>
                  <span className="block text-xs text-zinc-500">{l.text}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-zinc-500">
        {s.scope === 'ce'
          ? `Showing the ${fmtNum(s.courses)} courses created from CampusCE, out of ${fmtNum(s.courses_all)} in Canvas. Use “All Canvas” at the top right to include development, sandbox and migrated courses.`
          : `Showing all ${fmtNum(s.courses_all)} courses in Canvas.`}
        {s.data_as_of && ` Data as of ${fmtDateTime(s.data_as_of)} CST.`}
      </p>
    </PageShell>
  );
}
