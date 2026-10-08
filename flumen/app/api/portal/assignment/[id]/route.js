import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { SUBMISSION_LABEL } from '@/lib/portal-queries';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    if (!Number.isSafeInteger(id)) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const a = await q(
      `SELECT a.id, a.title, CASE a.workflow_state WHEN 'published' THEN 'Published' ELSE 'Unpublished' END AS status,
              a.points_possible AS points, a.due_at AS due, a.unlock_at, a.lock_at, a.grading_type,
              a.submission_types, a.created_at AS created, c.id AS course_id, c.name AS course, g.name AS group_name
       FROM dbo.canvas_assignments a
       JOIN dbo.canvas_courses c ON c.id = a.context_id AND a.context_type = 'Course'
       LEFT JOIN dbo.canvas_assignment_groups g ON g.id = a.assignment_group_id
       WHERE a.id = $1 AND a.workflow_state <> 'deleted'`, [id]);
    if (a.rows.length === 0) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const subs = await q(
      `SELECT u.id AS user_id, u.name, ${SUBMISSION_LABEL('s')} AS status, s.submission_type, s.submitted_at,
              s.score, s.grade, s.graded_at, s.attempt
       FROM dbo.canvas_enrollments e
       JOIN dbo.canvas_users u ON u.id = e.user_id
       LEFT JOIN dbo.canvas_submissions s ON s.user_id = e.user_id AND s.assignment_id = $1 AND s.workflow_state <> 'deleted'
       WHERE e.course_id = $2 AND e.type = 'StudentEnrollment' AND e.workflow_state IN ('active', 'completed', 'inactive')
       GROUP BY u.id, u.name, u.sortable_name, s.workflow_state, s.submission_type, s.submitted_at, s.score, s.grade, s.graded_at, s.attempt
       ORDER BY u.sortable_name`, [id, a.rows[0].course_id]);

    const rows = subs.rows.map(r => ({ ...r, status: r.status || 'Not submitted' }));
    const turnedIn = rows.filter(r => r.status !== 'Not submitted');
    const scores = rows.filter(r => r.score !== null).map(r => Number(r.score));

    return NextResponse.json({
      assignment: a.rows[0],
      metrics: {
        students: rows.length,
        turned_in: turnedIn.length,
        not_submitted: rows.length - turnedIn.length,
        graded: rows.filter(r => r.status === 'Graded').length,
        awaiting_grading: rows.filter(r => r.status === 'Submitted' || r.status === 'Pending review').length,
        avg_score: scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : null,
        high_score: scores.length ? Math.max(...scores) : null,
        low_score: scores.length ? Math.min(...scores) : null,
      },
      submissions: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load this assignment right now.' }, { status: 500 });
  }
}
