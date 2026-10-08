'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import {
  useFetch, Loading, ErrorBox, PageShell, Crumbs, Metric, Panel, Table, StatusBadge,
  L, fmtNum, fmtPct,
} from '@/components/portal';

export default function GroupPage() {
  const { key } = useParams();
  const { data, error, loading } = useFetch(`/portal/group/${key}`);

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  const { group: g, metrics: m, breakdown, top_courses, instructors } = data;
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
        <h1 className="text-2xl font-semibold text-zinc-100">{g.label}</h1>
        <p className="text-sm text-zinc-500">{g.blurb}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        <Metric label="Courses" value={fmtNum(m.courses)} sub={`${fmtNum(m.courses_published)} published`} href={`/browse/courses${q}`} />
        <Metric label="Students" value={fmtNum(m.students)} sub={`${fmtNum(m.students_active)} active`} href={`/browse/students${q}`} />
        <Metric label="Instructors" value={fmtNum(m.instructors)} href={`/browse/instructors${q}`} />
        <Metric label="Sections" value={fmtNum(m.sections)} href={`/browse/sections${q}`} />
        <Metric label="Enrollments" value={fmtNum(m.enrollments)} href={`/browse/enrollments${q}`} />
        <Metric label="Assignments" value={fmtNum(m.assignments)} sub="Published" href={`/browse/assignments${q}`} />
        <Metric label="Avg completion" value={fmtPct(m.avg_completion_pct)} sub="Active students" />
      </div>

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
    </PageShell>
  );
}
