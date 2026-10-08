'use client';

import { useParams } from 'next/navigation';
import {
  useFetch, Loading, ErrorBox, PageShell, Crumbs, Metric, Panel, Table, Facts, StatusBadge, ProgressBar,
  L, fmtDate, fmtDateTime, fmtNum, fmtPct,
} from '@/components/portal';

export default function CoursePage() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/portal/course/${id}`);

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  const { course: c, metrics: m, instructors, sections, assignments, students } = data;

  return (
    <PageShell>
      <div className="space-y-2">
        <Crumbs items={[{ label: 'Overview', href: '/' }, { label: 'Courses', href: '/browse/courses' }, { label: c.name }]} />
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-zinc-100">{c.name}</h1>
          <StatusBadge status={c.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Students" value={fmtNum(m.students)} sub={`${fmtNum(m.students_active)} active · ${fmtNum(m.students_inactive)} inactive · ${fmtNum(m.students_completed)} completed`} />
        <Metric label="Avg completion" value={fmtPct(m.avg_completion_pct)} sub={`${fmtNum(m.finished_all)} finished every assignment`} />
        <Metric label="Avg grade" value={fmtPct(m.avg_grade_pct)} sub="Current course score" />
        <Metric label="Instructors" value={fmtNum(m.instructors)} sub={`${fmtNum(m.sections)} section${m.sections === 1 ? '' : 's'}`} />
        <Metric label="Assignments" value={fmtNum(m.assignments_published)} sub={`${fmtNum(m.assignments)} including unpublished`} />
        <Metric label="Quizzes" value={fmtNum(m.quizzes)} />
        <Metric label="Graded submissions" value={fmtNum(m.graded_submissions)} />
        <Metric label="Awaiting grading" value={fmtNum(m.awaiting_grading)} />
      </div>

      <Panel title="Course details">
        <Facts items={[
          ['Course code', c.code],
          ['Account', c.account],
          ['Created', fmtDate(c.created)],
          ['Starts', fmtDate(c.start_at)],
          ['Ends', fmtDate(c.conclude_at)],
        ]} />
      </Panel>

      <Panel title="Instructors" count={instructors.length}>
        <Table
          rows={instructors}
          empty="No instructors are assigned yet."
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
          empty="No students are enrolled yet."
          columns={[
            { label: 'Student', render: r => L.person(r.user_id, r.name) },
            { label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { label: 'Section', render: r => r.section || '—' },
            { label: 'Completion', render: r => <ProgressBar pct={r.completion_pct} label={`${r.completed_assignments} of ${r.total_assignments} assignments`} /> },
            { label: 'Assignments', num: true, render: r => `${fmtNum(r.completed_assignments)} / ${fmtNum(r.total_assignments)}`, nowrap: true },
            { label: 'Grade', num: true, render: r => fmtPct(r.grade_pct) },
            { label: 'Hours active', num: true, render: r => fmtNum(r.hours_active) },
            { label: 'Enrolled', render: r => fmtDate(r.enrolled), nowrap: true },
            { label: 'Last activity', render: r => fmtDate(r.last_activity), nowrap: true },
          ]}
        />
      </Panel>

      <Panel title="Sections" count={sections.length}>
        <Table
          rows={sections}
          rowKey={r => r.id}
          columns={[
            { label: 'Section', render: r => L.section(r.id, r.name) },
            { label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { label: 'Active students', num: true, render: r => fmtNum(r.students) },
          ]}
        />
      </Panel>

      <Panel title="Assignments" count={assignments.length}>
        <Table
          rows={assignments}
          rowKey={r => r.id}
          empty="This course has no assignments yet."
          columns={[
            { label: 'Assignment', render: r => L.assignment(r.id, r.title) },
            { label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { label: 'Points', num: true, render: r => fmtNum(r.points) },
            { label: 'Due', render: r => fmtDate(r.due), nowrap: true },
            { label: 'Turned in', num: true, render: r => `${fmtNum(r.submissions)} / ${fmtNum(m.students)}`, nowrap: true },
            { label: 'Avg score', num: true, render: r => fmtNum(r.avg_score) },
          ]}
        />
      </Panel>
    </PageShell>
  );
}
