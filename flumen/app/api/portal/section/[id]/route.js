import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { studentProgress, progressMetrics, instructorsOfCourse } from '@/lib/portal-queries';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    if (!Number.isSafeInteger(id)) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

    const sec = await q(
      `SELECT s.id, s.name, CASE s.workflow_state WHEN 'active' THEN 'Active' ELSE s.workflow_state END AS status,
              s.created_at AS created, s.start_at, s.end_at, c.id AS course_id, c.name AS course
       FROM dbo.canvas_course_sections s JOIN dbo.canvas_courses c ON c.id = s.course_id
       WHERE s.id = $1 AND s.workflow_state <> 'deleted'`, [id]);
    if (sec.rows.length === 0) return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    const section = sec.rows[0];

    const [students, instructors] = await Promise.all([
      studentProgress(parseInt(section.course_id), id),
      instructorsOfCourse(parseInt(section.course_id)),
    ]);

    return NextResponse.json({
      section,
      metrics: progressMetrics(students.rows),
      instructors: instructors.rows,
      students: students.rows,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load this section right now.' }, { status: 500 });
  }
}
