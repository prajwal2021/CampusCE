import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { GROUPS, groupExpr } from '@/lib/portal';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const key = params.key;
    const def = GROUPS[key];
    if (!def) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const inGroup = `${groupExpr('c')} = '${key}' AND c.workflow_state <> 'deleted'`;

    const [counts, breakdown, topCourses, completion, instructors] = await Promise.all([
      q(`SELECT
           (SELECT count(*) FROM dbo.canvas_courses c WHERE ${inGroup}) AS courses,
           (SELECT count(*) FROM dbo.canvas_courses c WHERE ${inGroup} AND c.workflow_state = 'available') AS courses_published,
           (SELECT count(*) FROM dbo.canvas_course_sections s JOIN dbo.canvas_courses c ON c.id = s.course_id
             WHERE ${inGroup} AND s.workflow_state <> 'deleted') AS sections,
           (SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
             WHERE ${inGroup} AND e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')) AS students,
           (SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
             WHERE ${inGroup} AND e.type = 'StudentEnrollment' AND e.workflow_state = 'active') AS students_active,
           (SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
             WHERE ${inGroup} AND e.type = 'TeacherEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')) AS instructors,
           (SELECT count(*) FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id
             WHERE ${inGroup} AND e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')) AS enrollments,
           (SELECT count(*) FROM dbo.canvas_assignments a JOIN dbo.canvas_courses c ON c.id = a.context_id AND a.context_type = 'Course'
             WHERE ${inGroup} AND a.workflow_state = 'published') AS assignments`),

      q(`SELECT ${def.breakdown} AS label, count(DISTINCT c.id) AS courses,
                count(DISTINCT e.user_id) FILTER (WHERE e.type = 'StudentEnrollment' AND e.workflow_state = 'active') AS students
         FROM dbo.canvas_courses c
         LEFT JOIN dbo.canvas_enrollments e ON e.course_id = c.id
         WHERE ${inGroup}
         GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 40`),

      q(`SELECT c.id, c.name,
                CASE c.workflow_state WHEN 'available' THEN 'Published' WHEN 'claimed' THEN 'Unpublished'
                     WHEN 'completed' THEN 'Concluded' ELSE c.workflow_state END AS status,
                (SELECT count(*) FROM dbo.canvas_enrollments e WHERE e.course_id = c.id AND e.type = 'StudentEnrollment' AND e.workflow_state = 'active') AS students
         FROM dbo.canvas_courses c WHERE ${inGroup}
         ORDER BY students DESC, c.name LIMIT 8`),

      q(`WITH gc AS (SELECT c.id FROM dbo.canvas_courses c WHERE ${inGroup}),
              pub AS (SELECT a.context_id AS course_id, count(*) AS n FROM dbo.canvas_assignments a
                      WHERE a.context_type = 'Course' AND a.workflow_state = 'published' AND a.context_id IN (SELECT id FROM gc) GROUP BY 1),
              done AS (SELECT s.course_id, s.user_id, count(*) AS n FROM dbo.canvas_submissions s
                       JOIN dbo.canvas_assignments a ON a.id = s.assignment_id AND a.workflow_state = 'published'
                       WHERE s.course_id IN (SELECT id FROM gc) AND s.workflow_state IN ('submitted', 'graded', 'pending_review')
                       GROUP BY 1, 2)
         SELECT round(avg(100.0 * coalesce(done.n, 0) / pub.n)) AS avg_completion_pct
         FROM dbo.canvas_enrollments e
         JOIN pub ON pub.course_id = e.course_id
         LEFT JOIN done ON done.course_id = e.course_id AND done.user_id = e.user_id
         WHERE e.type = 'StudentEnrollment' AND e.workflow_state = 'active'`),

      q(`SELECT u.id AS user_id, u.name, count(DISTINCT e.course_id) AS courses
         FROM dbo.canvas_enrollments e
         JOIN dbo.canvas_users u ON u.id = e.user_id
         JOIN dbo.canvas_courses c ON c.id = e.course_id
         WHERE ${inGroup} AND e.type = 'TeacherEnrollment' AND e.workflow_state = 'active'
         GROUP BY u.id, u.name, u.sortable_name ORDER BY courses DESC, u.sortable_name LIMIT 12`),
    ]);

    return NextResponse.json({
      group: { key, label: def.label, short: def.short, blurb: def.blurb, breakdownTitle: def.breakdownTitle },
      metrics: { ...counts.rows[0], avg_completion_pct: completion.rows[0]?.avg_completion_pct ?? null },
      breakdown: breakdown.rows,
      top_courses: topCourses.rows,
      instructors: instructors.rows,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load this group right now.' }, { status: 500 });
  }
}
