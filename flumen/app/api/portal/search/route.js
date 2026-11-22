import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { CE_JOIN, escapeLike } from '@/lib/portal';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/search?q=  Quick search for the top bar: people by name or CampusCE number,
 * courses by name, code or SKU.
 */
export async function GET(request) {
  try {
    const term = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
    if (term.length < 2) return NextResponse.json({ people: [], courses: [] });
    const like = `%${escapeLike(term)}%`;

    const [people, courses] = await Promise.all([
      q(`SELECT u.id, u.name, cen.ce_number,
                (SELECT string_agg(DISTINCT CASE e.type WHEN 'StudentEnrollment' THEN 'Student' WHEN 'TeacherEnrollment' THEN 'Instructor' END, ' · ')
                 FROM dbo.canvas_enrollments e WHERE e.user_id = u.id AND e.workflow_state NOT IN ('deleted', 'rejected')
                   AND e.type IN ('StudentEnrollment', 'TeacherEnrollment')) AS roles
         FROM dbo.canvas_users u ${CE_JOIN('u')}
         WHERE u.workflow_state <> 'deleted' AND (u.name ILIKE $1 OR cen.ce_number ILIKE $1)
         ORDER BY (cen.ce_number ILIKE $2) DESC, u.sortable_name LIMIT 8`, [like, term]),
      q(`SELECT c.id, c.name, c.sis_source_id AS sku,
                CASE c.workflow_state WHEN 'available' THEN 'Published' WHEN 'claimed' THEN 'Unpublished' WHEN 'completed' THEN 'Concluded' ELSE c.workflow_state END AS status
         FROM dbo.canvas_courses c
         WHERE c.workflow_state <> 'deleted' AND (c.name ILIKE $1 OR c.course_code ILIKE $1 OR c.sis_source_id ILIKE $1)
         ORDER BY (c.sis_source_id ILIKE $2) DESC, c.name LIMIT 6`, [like, term]),
    ]);
    return NextResponse.json({ people: people.rows, courses: courses.rows });
  } catch (err) {
    return NextResponse.json({ error: 'Search is unavailable right now.' }, { status: 500 });
  }
}
