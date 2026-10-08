'use client';

import { useParams } from 'next/navigation';
import {
  useFetch, Loading, ErrorBox, PageShell, Crumbs, Metric, Panel, Table, Facts, StatusBadge, ProgressBar,
  L, fmtDate, fmtDateTime, fmtNum, fmtPct,
} from '@/components/portal';

export default function SectionPage() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/portal/section/${id}`);

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  const { section: s, metrics: m, instructors, students } = data;

  return (
    <PageShell>
      <div className="space-y-2">
        <Crumbs items={[
          { label: 'Overview', href: '/' },
          { label: 'Sections', href: '/browse/sections' },
          { label: s.name },
        ]} />
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-zinc-100">{s.name}</h1>
          <StatusBadge status={s.status} />
        </div>
        <p className="text-sm text-zinc-500">Section of {L.course(s.course_id, s.course)}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Students" value={fmtNum(m.students)} sub={`${fmtNum(m.students_active)} active · ${fmtNum(m.students_inactive)} inactive`} />
        <Metric label="Avg completion" value={fmtPct(m.avg_completion_pct)} sub={`${fmtNum(m.finished_all)} finished every assignment`} />
        <Metric label="Avg grade" value={fmtPct(m.avg_grade_pct)} />
        <Metric label="Instructors" value={fmtNum(instructors.length)} sub="On the course" />
      </div>

      <Panel title="Section details">
        <Facts items={[
          ['Created', fmtDate(s.created)],
          ['Starts', fmtDate(s.start_at)],
          ['Ends', fmtDate(s.end_at)],
        ]} />
      </Panel>

      <Panel title="Instructors" count={instructors.length}>
        <Table
          rows={instructors}
          columns={[
            { label: 'Name', render: r => L.person(r.user_id, r.name) },
            { label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { label: 'Last activity', render: r => fmtDateTime(r.last_activity), nowrap: true },
          ]}
        />
      </Panel>

      <Panel title="Students" count={students.length}>
        <Table
          rows={students}
          rowKey={r => r.enrollment_id}
          empty="No students are enrolled in this section."
          columns={[
            { label: 'Student', render: r => L.person(r.user_id, r.name) },
            { label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { label: 'Completion', render: r => <ProgressBar pct={r.completion_pct} label={`${r.completed_assignments} of ${r.total_assignments} assignments`} /> },
            { label: 'Grade', num: true, render: r => fmtPct(r.grade_pct) },
            { label: 'Hours active', num: true, render: r => fmtNum(r.hours_active) },
            { label: 'Enrolled', render: r => fmtDate(r.enrolled), nowrap: true },
            { label: 'Last activity', render: r => fmtDate(r.last_activity), nowrap: true },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
