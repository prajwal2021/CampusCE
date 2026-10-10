'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Reporting from '@/components/Reporting';
import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import {
  useFetch, Loading, ErrorBox, PageShell, Crumbs, Metric, Panel, Table, StatusBadge,
  L, fmtNum, fmtPct,
} from '@/components/portal';

export default function GroupPage() {
  const { key } = useParams();
  const [view, setView] = useState('overview');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('view') === 'reporting') setView('reporting'); }, []);
  const switchView = (v) => {
    setView(v);
    const u = new URL(window.location.href);
    v === 'reporting' ? u.searchParams.set('view', 'reporting') : u.searchParams.delete('view');
    window.history.replaceState(null, '', u);
  };
  const { data, error, loading } = useFetch(`/portal/group/${key}`);

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  const { group: g, metrics: m, breakdown, top_courses, instructors, expected } = data;
  const q = `?group=${g.key}`;
  const viewAll = (type, label) => (
    <Link href={`/browse/${type}${q}`} className="text-xs text-accent hover:underline inline-flex items-center gap-1">
      {label} <ArrowRight className="w-3 h-3" />
    </Link>
  );

  return (
    <PageShell>
      <div className="space-y-2">
        <Crumbs items={[{ label: 'Overview', href: '/' }, { label: 'Programs', href: '/programs' }, { label: g.label }]} />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold text-zinc-100">{g.label}</h1>
          {g.key === 'cla' && (
            <div className="flex items-center rounded-lg border border-surface-4 bg-surface-2 p-0.5" role="group" aria-label="Dashboard view">
              {[{ v: 'overview', label: 'Overview' }, { v: 'reporting', label: 'Reporting' }].map(o => (
                <button key={o.v} onClick={() => switchView(o.v)} aria-pressed={view === o.v}
                  className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                    view === o.v ? 'bg-accent text-white' : 'text-zinc-400 hover:text-zinc-200')}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-sm text-zinc-500">{g.blurb}</p>
      </div>

      {view === 'reporting' && g.key === 'cla' ? <Reporting /> : (<>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        <Metric label="Courses" value={fmtNum(m.courses)} sub={`${fmtNum(m.courses_published)} published`} href={`/browse/courses${q}`} />
        <Metric label="Students" value={fmtNum(m.students)} sub={`${fmtNum(m.students_active)} active`} href={`/browse/students${q}`} />
        <Metric label="Instructors" value={fmtNum(m.instructors)} href={`/browse/instructors${q}`} />
        <Metric label="Sections" value={fmtNum(m.sections)} href={`/browse/sections${q}`} />
        <Metric label="Enrollments" value={fmtNum(m.enrollments)} href={`/browse/enrollments${q}`} />
        <Metric label="Assignments" value={fmtNum(m.assignments)} sub="Published" href={`/browse/assignments${q}`} />
        <Metric label="Avg completion" value={fmtPct(m.avg_completion_pct)} sub="Active students" />
      </div>

      {expected && (
        <Panel title="Expected courses" right={<span className="text-xs text-zinc-500 tabular-nums">{expected.filter(e => e.found).length} of {expected.length} loaded</span>}>
          <Table
            rows={expected}
            rowKey={r => r.sis}
            columns={[
              { label: 'Offering', render: r => (r.found ? L.course(r.course_id, r.name) : r.name), className: 'max-w-[520px]' },
              { label: 'Type', render: r => r.kind },
              { label: 'CampusCE SKU / SIS ID', render: r => <span className="font-mono text-xs">{r.sis}</span> },
              { label: 'Canvas course', num: true, render: r => r.canvas_id },
              { label: 'In our data', render: r => <span className={r.found ? 'badge-ok' : 'badge-warn'}>{r.found ? 'Loaded' : 'Not loaded yet'}</span> },
            ]}
          />
          {expected.some(e => !e.found) && (
            <p className="px-5 py-3 text-xs text-zinc-500 border-t border-surface-3">
              Courses marked Not loaded yet are not in the data. They appear after the next pull and push.
            </p>
          )}
        </Panel>
      )}

      <Panel title={g.breakdownTitle} count={breakdown.length}>
        <Table
          rows={breakdown}
          rowKey={r => r.label}
          columns={[
            { label: g.breakdownTitle.replace('By ', '').replace(/^./, c => c.toUpperCase()), render: r => r.label },
            { label: 'Courses', num: true, render: r => fmtNum(r.courses) },
            { label: 'Active students', num: true, render: r => fmtNum(r.students) },
          ]}
        />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Largest courses" right={viewAll('courses', 'View all courses')}>
          <Table
            rows={top_courses}
            rowKey={r => r.id}
            columns={[
              { label: 'Course', render: r => L.course(r.id, r.name), className: 'max-w-[300px]' },
              { label: 'Status', render: r => <StatusBadge status={r.status} /> },
              { label: 'Students', num: true, render: r => fmtNum(r.students) },
            ]}
          />
        </Panel>
        <Panel title="Instructors" right={viewAll('instructors', 'View all instructors')}>
          <Table
            rows={instructors}
            rowKey={r => r.user_id}
            empty="No active instructors in this program yet."
            columns={[
              { label: 'Name', render: r => L.person(r.user_id, r.name) },
              { label: 'Courses', num: true, render: r => fmtNum(r.courses) },
            ]}
          />
        </Panel>
      </div>
      </>)}
    </PageShell>
  );
}
