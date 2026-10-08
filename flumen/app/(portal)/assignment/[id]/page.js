'use client';

import { useParams } from 'next/navigation';
import {
  useFetch, Loading, ErrorBox, PageShell, Crumbs, Metric, Panel, Table, Facts, StatusBadge,
  L, fmtDate, fmtDateTime, fmtNum,
} from '@/components/portal';

export default function AssignmentPage() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/portal/assignment/${id}`);

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  const { assignment: a, metrics: m, submissions } = data;

  return (
    <PageShell>
      <div className="space-y-2">
        <Crumbs items={[
          { label: 'Overview', href: '/' },
          { label: 'Assignments', href: '/browse/assignments' },
          { label: a.title },
        ]} />
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-zinc-100">{a.title}</h1>
          <StatusBadge status={a.status} />
        </div>
        <p className="text-sm text-zinc-500">In {L.course(a.course_id, a.course)}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Turned in" value={`${fmtNum(m.turned_in)} / ${fmtNum(m.students)}`} sub={`${fmtNum(m.not_submitted)} not submitted`} />
        <Metric label="Graded" value={fmtNum(m.graded)} sub={`${fmtNum(m.awaiting_grading)} awaiting grading`} />
        <Metric label="Average score" value={fmtNum(m.avg_score)} sub={a.points ? `out of ${fmtNum(a.points)}` : undefined} />
        <Metric label="High / low" value={m.high_score === null ? '—' : `${fmtNum(m.high_score)} / ${fmtNum(m.low_score)}`} />
      </div>

      <Panel title="Assignment details">
        <Facts items={[
          ['Points', fmtNum(a.points)],
          ['Due', fmtDateTime(a.due)],
          ['Opens', fmtDateTime(a.unlock_at)],
          ['Closes', fmtDateTime(a.lock_at)],
          ['Group', a.group_name],
          ['Submission type', a.submission_types ? String(a.submission_types).replace(/[{}"]/g, '').replace(/_/g, ' ').replace(/,/g, ', ') : null],
          ['Grading', a.grading_type ? String(a.grading_type).replace(/_/g, ' ') : null],
          ['Created', fmtDate(a.created)],
        ]} />
      </Panel>

      <Panel title="Student work" count={submissions.length}>
        <Table
          rows={submissions}
          rowKey={r => r.user_id}
          empty="No students are enrolled in this course."
          columns={[
            { label: 'Student', render: r => L.person(r.user_id, r.name) },
            { label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { label: 'Score', num: true, render: r => (r.score === null ? '—' : `${fmtNum(r.score)}${a.points ? ` / ${fmtNum(a.points)}` : ''}`), nowrap: true },
            { label: 'Grade', render: r => r.grade || '—' },
            { label: 'Type', render: r => (r.submission_type ? r.submission_type.replace(/_/g, ' ') : '—') },
            { label: 'Submitted', render: r => fmtDateTime(r.submitted_at), nowrap: true },
            { label: 'Graded', render: r => fmtDate(r.graded_at), nowrap: true },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
