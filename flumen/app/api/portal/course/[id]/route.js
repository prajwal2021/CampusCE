import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { studentProgress, progressMetrics, instructorsOfCourse } from '@/lib/portal-queries';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    if (!Number.isSafeInteger(id)) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

    const course = await q(
      `SELECT c.id, c.name, c.course_code AS code, c.account_desc AS account,
              CASE c.workflow_state WHEN 'available' THEN 'Published' WHEN 'claimed' THEN 'Unpublished'
                   WHEN 'completed' THEN 'Concluded' ELSE c.workflow_state END AS status,
              c.created_at AS created, c.start_at, c.conclude_at
       FROM dbo.canvas_courses c WHERE c.id = $1 AND c.workflow_state <> 'deleted'`, [id]);
    if (course.rows.length === 0) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

    const [students, instructors, sections, assignments, totals] = await Promise.all([
      studentProgress(id),
      instructorsOfCourse(id),
      q(`SELECT s.id, s.name, CASE s.workflow_state WHEN 'active' THEN 'Active' ELSE s.workflow_state END AS status,
                (SELECT count(*) FROM dbo.canvas_enrollments e WHERE e.course_section_id = s.id
                   AND e.type = 'StudentEnrollment' AND e.workflow_state = 'active') AS students
         FROM dbo.canvas_course_sections s WHERE s.course_id = $1 AND s.workflow_state <> 'deleted' ORDER BY s.name`, [id]),
      q(`SELECT a.id, a.title,
                CASE a.workflow_state WHEN 'published' THEN 'Published' ELSE 'Unpublished' END AS status,
                a.points_possible AS points, a.due_at AS due,
                (SELECT count(*) FROM dbo.canvas_submissions s WHERE s.assignment_id = a.id
                   AND s.workflow_state IN ('submitted', 'graded', 'pending_review')) AS submissions,
                (SELECT round(avg(s.score)::numeric, 1) FROM dbo.canvas_submissions s WHERE s.assignment_id = a.id
                   AND s.workflow_state = 'graded' AND s.score IS NOT NULL) AS avg_score
         FROM dbo.canvas_assignments a
         WHERE a.context_id = $1 AND a.context_type = 'Course' AND a.workflow_state <> 'deleted'
         ORDER BY a.due_at NULLS LAST, a.title`, [id]),
      q(`SELECT (SELECT count(*) FROM dbo.canvas_quizzes WHERE context_id = $1 AND context_type = 'Course' AND workflow_state <> 'deleted') AS quizzes,
                (SELECT count(*) FROM dbo.canvas_submissions WHERE course_id = $1 AND workflow_state = 'graded') AS graded_submissions,
                (SELECT count(*) FROM dbo.canvas_submissions WHERE course_id = $1 AND workflow_state IN ('submitted', 'pending_review')) AS awaiting_grading`, [id]),
    ]);

    return NextResponse.json({
      course: course.rows[0],
      metrics: {
        ...progressMetrics(students.rows),
        instructors: instructors.rows.length,
        sections: sections.rows.length,
        assignments: assignments.rows.length,
        assignments_published: assignments.rows.filter(a => a.status === 'Published').length,
        quizzes: parseInt(totals.rows[0].quizzes),
        graded_submissions: parseInt(totals.rows[0].graded_submissions),
        awaiting_grading: parseInt(totals.rows[0].awaiting_grading),
      },
      instructors: instructors.rows,
      sections: sections.rows,
      assignments: assignments.rows,
      students: students.rows,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load this course right now.' }, { status: 500 });
  }
}
