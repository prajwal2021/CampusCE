'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useFetch, Loading, ErrorBox, PageShell, Crumbs, Metric, Panel, Table, StatusBadge, ProgressBar,
  L, linkCls, fmtDate, fmtDateTime, fmtNum, fmtPct,
} from '@/components/portal';

export default function PersonPage() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/portal/person/${id}`);

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  const { person: p, metrics: m, taking, teaching, submissions } = data;
  const isInstructor = teaching.length > 0;
  const isStudent = taking.length > 0;

  return (
    <PageShell>
      <div className="space-y-2">
        <Crumbs items={[
          { label: 'Overview', href: '/' },
          { label: isStudent || !isInstructor ? 'Students' : 'Instructors', href: isStudent || !isInstructor ? '/browse/students' : '/browse/instructors' },
          { label: p.name },
        ]} />
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-zinc-100">{p.name}</h1>
          {isStudent && <span className="badge-info">Student</span>}
          {isInstructor && <span className="badge-info">Instructor</span>}
        </div>
        <p className="text-sm text-zinc-500">In Canvas since {fmtDate(p.first_seen)}</p>
      </div>

      {isStudent && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Courses" value={fmtNum(m.courses_taking)} sub={`${fmtNum(m.courses_active)} active · ${fmtNum(m.courses_completed)} completed · ${fmtNum(m.courses_inactive)} inactive`} />
          <Metric label="Avg completion" value={fmtPct(m.avg_completion_pct)} sub="Across their courses" />
          <Metric label="Avg grade" value={fmtPct(m.avg_grade_pct)} sub="Current course scores" />
          <Metric label="Assignments done" value={fmtNum(m.submitted_assignments)} sub={`${fmtNum(m.graded_assignments)} graded`} />
        </div>
      )}
      {!isStudent && isInstructor && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Courses teaching" value={fmtNum(m.courses_teaching)} />
          <Metric label="Active students" value={fmtNum(teaching.reduce((s, r) => s + Number(r.students), 0))} sub="Across their courses" />
        </div>
      )}

      {isStudent && (
        <Panel title="Enrolled in" count={taking.length}>
          <Table
            rows={taking}
            rowKey={r => r.enrollment_id}
            columns={[
              { label: 'Course', render: r => L.course(r.course_id, r.course), className: 'max-w-[320px]' },
              { label: 'Section', render: r => (r.section_id ? L.section(r.section_id, r.section) : '—'), className: 'max-w-[220px]' },
              { label: 'Professor', render: r => (r.instructors?.length
                  ? r.instructors.map((t, i) => (
                      <span key={t.user_id}>{i > 0 && ', '}<Link href={`/person/${t.user_id}`} className={linkCls}>{t.name}</Link></span>))
                  : '—') },
              { label: 'Status', render: r => <StatusBadge status={r.status} /> },
              { label: 'Completion', render: r => <ProgressBar pct={r.completion_pct} label={`${r.completed_assignments} of ${r.total_assignments} assignments`} /> },
              { label: 'Grade', num: true, render: r => fmtPct(r.current_grade) },
              { label: 'Hours active', num: true, render: r => fmtNum(r.hours_active) },
              { label: 'Enrolled', render: r => fmtDate(r.enrolled), nowrap: true },
              { label: 'Last activity', render: r => fmtDate(r.last_activity), nowrap: true },
            ]}
          />
        </Panel>
      )}

      {isInstructor && (
        <Panel title="Teaching" count={teaching.length}>
          <Table
            rows={teaching}
            rowKey={r => r.enrollment_id}
            columns={[
              { label: 'Course', render: r => L.course(r.course_id, r.course), className: 'max-w-[360px]' },
              { label: 'Section', render: r => (r.section_id ? L.section(r.section_id, r.section) : '—'), className: 'max-w-[220px]' },
              { label: 'Status', render: r => <StatusBadge status={r.status} /> },
              { label: 'Active students', num: true, render: r => fmtNum(r.students) },
              { label: 'Assignments', num: true, render: r => fmtNum(r.assignments) },
              { label: 'Since', render: r => fmtDate(r.since), nowrap: true },
              { label: 'Last activity', render: r => fmtDateTime(r.last_activity), nowrap: true },
            ]}
          />
        </Panel>
      )}

      {isStudent && (
        <Panel title="Recent assignment work" count={submissions.length}>
          <Table
            rows={submissions}
            rowKey={r => `${r.assignment_id}-${r.submitted_at}`}
            empty="No submitted work yet."
            columns={[
              { label: 'Assignment', render: r => L.assignment(r.assignment_id, r.title), className: 'max-w-[320px]' },
              { label: 'Course', render: r => L.course(r.course_id, r.course), className: 'max-w-[280px]' },
              { label: 'Status', render: r => <StatusBadge status={r.status} /> },
              { label: 'Score', num: true, render: r => (r.score === null ? '—' : `${fmtNum(r.score)} / ${fmtNum(r.points)}`), nowrap: true },
              { label: 'Submitted', render: r => fmtDateTime(r.submitted_at), nowrap: true },
              { label: 'Graded', render: r => fmtDate(r.graded_at), nowrap: true },
            ]}
          />
        </Panel>
      )}

      {!isStudent && !isInstructor && (
        <p className="text-sm text-zinc-500">No course activity is linked to this person.</p>
      )}
    </PageShell>
  );
}
