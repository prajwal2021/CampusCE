import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { ENROLL_LABEL, SUBMISSION_LABEL, avg } from '@/lib/portal-queries';

export const dynamic = 'force-dynamic';

/**
 * Everything academic linked to one person: courses taken (with professors, completion and
 * grades), courses taught, and recent submissions. Contact details and identifiers are not exposed.
 */
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    if (!Number.isSafeInteger(id)) return NextResponse.json({ error: 'Person not found' }, { status: 404 });

    const person = await q(
      `SELECT id, name, created_at AS first_seen FROM dbo.canvas_users WHERE id = $1 AND workflow_state <> 'deleted'`, [id]);
    if (person.rows.length === 0) return NextResponse.json({ error: 'Person not found' }, { status: 404 });

    const [taking, teaching, submissions] = await Promise.all([
      q(`WITH pub AS (
           SELECT context_id AS course_id, count(*) AS n FROM dbo.canvas_assignments
           WHERE context_type = 'Course' AND workflow_state = 'published' GROUP BY context_id),
         done AS (
           SELECT s.course_id, count(*) AS n FROM dbo.canvas_submissions s
           JOIN dbo.canvas_assignments a ON a.id = s.assignment_id AND a.workflow_state = 'published'
           WHERE s.user_id = $1 AND s.workflow_state IN ('submitted', 'graded', 'pending_review') GROUP BY s.course_id),
         sc AS (
           SELECT enrollment_id, max(current_score) AS cur, max(final_score) AS fin
           FROM dbo.canvas_scores WHERE assignment_group_id IS NULL AND workflow_state = 'active' GROUP BY enrollment_id)
         SELECT e.id AS enrollment_id, c.id AS course_id, c.name AS course, sec.id AS section_id, sec.name AS section,
                ${ENROLL_LABEL} AS status, e.created_at AS enrolled, e.last_activity_at AS last_activity,
                e.completed_at, round(coalesce(e.total_activity_time, 0) / 3600.0, 1) AS hours_active,
                coalesce(done.n, 0) AS completed_assignments, coalesce(pub.n, 0) AS total_assignments,
                CASE WHEN coalesce(pub.n, 0) > 0 THEN round(100.0 * coalesce(done.n, 0) / pub.n, 0) END AS completion_pct,
                round(sc.cur::numeric, 1) AS current_grade, round(sc.fin::numeric, 1) AS final_grade,
                (SELECT json_agg(json_build_object('user_id', t.id, 'name', t.name) ORDER BY t.name)
                   FROM (SELECT DISTINCT u.id, u.name FROM dbo.canvas_enrollments te JOIN dbo.canvas_users u ON u.id = te.user_id
                         WHERE te.course_id = c.id AND te.type = 'TeacherEnrollment' AND te.workflow_state = 'active') t) AS instructors
         FROM dbo.canvas_enrollments e
         JOIN dbo.canvas_courses c ON c.id = e.course_id AND c.workflow_state <> 'deleted'
         LEFT JOIN dbo.canvas_course_sections sec ON sec.id = e.course_section_id
         LEFT JOIN pub ON pub.course_id = c.id
         LEFT JOIN done ON done.course_id = c.id
         LEFT JOIN sc ON sc.enrollment_id = e.id
         WHERE e.user_id = $1 AND e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')
         ORDER BY e.created_at DESC`, [id]),

      q(`SELECT e.id AS enrollment_id, c.id AS course_id, c.name AS course, sec.id AS section_id, sec.name AS section,
                ${ENROLL_LABEL} AS status, e.created_at AS since, e.last_activity_at AS last_activity,
                (SELECT count(*) FROM dbo.canvas_enrollments se WHERE se.course_id = c.id AND se.type = 'StudentEnrollment' AND se.workflow_state = 'active') AS students,
                (SELECT count(*) FROM dbo.canvas_assignments a WHERE a.context_id = c.id AND a.context_type = 'Course' AND a.workflow_state = 'published') AS assignments
         FROM dbo.canvas_enrollments e
         JOIN dbo.canvas_courses c ON c.id = e.course_id AND c.workflow_state <> 'deleted'
         LEFT JOIN dbo.canvas_course_sections sec ON sec.id = e.course_section_id
         WHERE e.user_id = $1 AND e.type = 'TeacherEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')
         ORDER BY e.created_at DESC`, [id]),

      q(`SELECT a.id AS assignment_id, a.title, c.id AS course_id, c.name AS course, ${SUBMISSION_LABEL('s')} AS status,
                s.submission_type, s.submitted_at, s.score, a.points_possible AS points, s.grade, s.graded_at
         FROM dbo.canvas_submissions s
         JOIN dbo.canvas_assignments a ON a.id = s.assignment_id AND a.workflow_state <> 'deleted'
         JOIN dbo.canvas_courses c ON c.id = s.course_id AND c.workflow_state <> 'deleted'
         WHERE s.user_id = $1 AND s.workflow_state IN ('submitted', 'graded', 'pending_review')
         ORDER BY coalesce(s.submitted_at, s.graded_at, s.updated_at) DESC NULLS LAST
         LIMIT 300`, [id]),
    ]);

    const t = taking.rows;
    return NextResponse.json({
      person: person.rows[0],
      metrics: {
        courses_taking: t.length,
        courses_active: t.filter(r => r.status === 'Active').length,
        courses_completed: t.filter(r => r.status === 'Completed').length,
        courses_inactive: t.filter(r => r.status === 'Inactive').length,
        courses_teaching: teaching.rows.length,
        avg_completion_pct: avg(t.filter(r => r.completion_pct !== null).map(r => Number(r.completion_pct))),
        avg_grade_pct: avg(t.filter(r => r.current_grade !== null).map(r => Number(r.current_grade))),
        submitted_assignments: submissions.rows.length,
        graded_assignments: submissions.rows.filter(r => r.status === 'Graded').length,
      },
      taking: t,
      teaching: teaching.rows,
      submissions: submissions.rows,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load this person right now.' }, { status: 500 });
  }
}
