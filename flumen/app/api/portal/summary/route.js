import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { GROUPS, groupExpr } from '@/lib/portal';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await q(`
      SELECT
        (SELECT count(*) FROM dbo.canvas_courses WHERE workflow_state <> 'deleted') AS courses,
        (SELECT count(*) FROM dbo.canvas_courses WHERE workflow_state = 'available') AS courses_published,
        (SELECT count(*) FROM dbo.canvas_course_sections s JOIN dbo.canvas_courses c ON c.id = s.course_id
          WHERE s.workflow_state <> 'deleted' AND c.workflow_state <> 'deleted') AS sections,
        (SELECT count(DISTINCT user_id) FROM dbo.canvas_enrollments
          WHERE type = 'StudentEnrollment' AND workflow_state NOT IN ('deleted', 'rejected')) AS students,
        (SELECT count(DISTINCT user_id) FROM dbo.canvas_enrollments
          WHERE type = 'StudentEnrollment' AND workflow_state = 'active') AS students_active,
        (SELECT count(DISTINCT user_id) FROM dbo.canvas_enrollments
          WHERE type = 'TeacherEnrollment' AND workflow_state NOT IN ('deleted', 'rejected')) AS instructors,
        (SELECT count(DISTINCT user_id) FROM dbo.canvas_enrollments
          WHERE type = 'TeacherEnrollment' AND workflow_state = 'active') AS instructors_active,
        (SELECT count(*) FROM dbo.canvas_enrollments
          WHERE type = 'StudentEnrollment' AND workflow_state NOT IN ('deleted', 'rejected')) AS enrollments,
        (SELECT count(*) FROM dbo.canvas_enrollments
          WHERE type = 'StudentEnrollment' AND workflow_state = 'active') AS enrollments_active,
        (SELECT count(*) FROM dbo.canvas_assignments a JOIN dbo.canvas_courses c ON c.id = a.context_id AND a.context_type = 'Course'
          WHERE a.workflow_state <> 'deleted' AND c.workflow_state <> 'deleted') AS assignments,
        (SELECT count(*) FROM dbo.canvas_assignments a JOIN dbo.canvas_courses c ON c.id = a.context_id AND a.context_type = 'Course'
          WHERE a.workflow_state = 'published' AND c.workflow_state <> 'deleted') AS assignments_published,
        (SELECT max(finished_at) FROM etl.run_table) AS data_as_of
    `);
    const groups = await q(`
      SELECT g.key, count(DISTINCT c.id) AS courses,
             count(DISTINCT e.user_id) FILTER (WHERE e.type = 'StudentEnrollment' AND e.workflow_state = 'active') AS students,
             count(DISTINCT e.user_id) FILTER (WHERE e.type = 'TeacherEnrollment' AND e.workflow_state = 'active') AS instructors
      FROM (SELECT c.id, ${groupExpr('c')} AS key FROM dbo.canvas_courses c WHERE c.workflow_state <> 'deleted') g
      JOIN dbo.canvas_courses c ON c.id = g.id
      LEFT JOIN dbo.canvas_enrollments e ON e.course_id = c.id
      GROUP BY g.key`);
    const byKey = Object.fromEntries(groups.rows.map(r => [r.key, r]));
    return NextResponse.json({
      ...res.rows[0],
      groups: Object.entries(GROUPS).map(([key, g]) => ({
        key, label: g.label, short: g.short, blurb: g.blurb,
        courses: byKey[key]?.courses ?? 0, students: byKey[key]?.students ?? 0, instructors: byKey[key]?.instructors ?? 0,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load the overview right now.' }, { status: 500 });
  }
}
