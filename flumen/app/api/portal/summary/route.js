import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { GROUPS, groupExpr, scopeCond } from '@/lib/portal';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const scope = new URL(request.url).searchParams.get('scope') === 'all' ? 'all' : 'ce';
    const sc = scopeCond(scope) ? ` AND ${scopeCond(scope)}` : '';
    const live = `c.workflow_state <> 'deleted'${sc}`;

    const res = await q(`
      SELECT
        (SELECT count(*) FROM dbo.canvas_courses c WHERE ${live}) AS courses,
        (SELECT count(*) FROM dbo.canvas_courses c WHERE c.workflow_state = 'available'${sc}) AS courses_published,
        (SELECT count(*) FROM dbo.canvas_courses WHERE workflow_state <> 'deleted') AS courses_all,
        (SELECT count(*) FROM dbo.canvas_course_sections s JOIN dbo.canvas_courses c ON c.id = s.course_id
          WHERE s.workflow_state <> 'deleted' AND ${live}) AS sections,
        (SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
          WHERE e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected') AND ${live}) AS students,
        (SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
          WHERE e.type = 'StudentEnrollment' AND e.workflow_state = 'active' AND ${live}) AS students_active,
        (SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
          WHERE e.type = 'TeacherEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected') AND ${live}) AS instructors,
        (SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
          WHERE e.type = 'TeacherEnrollment' AND e.workflow_state = 'active' AND ${live}) AS instructors_active,
        (SELECT count(*) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
          WHERE e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected') AND ${live}) AS enrollments,
        (SELECT count(*) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
          WHERE e.type = 'StudentEnrollment' AND e.workflow_state = 'active' AND ${live}) AS enrollments_active,
        (SELECT count(*) FROM dbo.canvas_assignments a JOIN dbo.canvas_courses c ON c.id = a.context_id AND a.context_type = 'Course'
          WHERE a.workflow_state <> 'deleted' AND ${live}) AS assignments,
        (SELECT count(*) FROM dbo.canvas_assignments a JOIN dbo.canvas_courses c ON c.id = a.context_id AND a.context_type = 'Course'
          WHERE a.workflow_state = 'published' AND ${live}) AS assignments_published,
        (SELECT max(finished_at) FROM etl.run_table) AS data_as_of
    `);

    const groups = await q(`
      SELECT g.key, count(DISTINCT c.id) AS courses,
             count(DISTINCT e.user_id) FILTER (WHERE e.type = 'StudentEnrollment' AND e.workflow_state = 'active') AS students,
             count(DISTINCT e.user_id) FILTER (WHERE e.type = 'TeacherEnrollment' AND e.workflow_state = 'active') AS instructors
      FROM (SELECT c.id, ${groupExpr('c')} AS key FROM dbo.canvas_courses c WHERE ${live}) g
      JOIN dbo.canvas_courses c ON c.id = g.id
      LEFT JOIN dbo.canvas_enrollments e ON e.course_id = c.id
      GROUP BY g.key`);
    const byKey = Object.fromEntries(groups.rows.map(r => [r.key, r]));

    return NextResponse.json({
      ...res.rows[0],
      scope,
      groups: Object.entries(GROUPS).map(([key, g]) => ({
        key, label: g.label, short: g.short, blurb: g.blurb,
        courses: byKey[key]?.courses ?? 0, students: byKey[key]?.students ?? 0, instructors: byKey[key]?.instructors ?? 0,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load the overview right now.' }, { status: 500 });
  }
}
