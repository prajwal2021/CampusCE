import { q } from '@/lib/db';

export const ENROLL_LABEL = `CASE e.workflow_state WHEN 'active' THEN 'Active' WHEN 'inactive' THEN 'Inactive'
  WHEN 'completed' THEN 'Completed' WHEN 'invited' THEN 'Invited' ELSE e.workflow_state END`;

export const SUBMISSION_LABEL = alias => `CASE ${alias}.workflow_state WHEN 'unsubmitted' THEN 'Not submitted'
  WHEN 'submitted' THEN 'Submitted' WHEN 'graded' THEN 'Graded' WHEN 'pending_review' THEN 'Pending review'
  ELSE ${alias}.workflow_state END`;

/**
 * Students of a course (optionally one section) with completion and grade.
 * Completion % = assignments turned in or graded / published assignments in the course.
 */
export function studentProgress(courseId, sectionId = null) {
  return q(
    `WITH pub AS (
       SELECT count(*) AS n FROM dbo.canvas_assignments
       WHERE context_id = $1 AND context_type = 'Course' AND workflow_state = 'published'),
     done AS (
       SELECT s.user_id, count(*) AS n
       FROM dbo.canvas_submissions s
       JOIN dbo.canvas_assignments a ON a.id = s.assignment_id AND a.workflow_state = 'published'
       WHERE s.course_id = $1 AND s.workflow_state IN ('submitted', 'graded', 'pending_review')
       GROUP BY s.user_id),
     sc AS (
       SELECT enrollment_id, max(current_score) AS score
       FROM dbo.canvas_scores WHERE assignment_group_id IS NULL AND workflow_state = 'active'
       GROUP BY enrollment_id)
     SELECT e.id AS enrollment_id, u.id AS user_id, u.name, s.name AS section, ${ENROLL_LABEL} AS status,
            e.created_at AS enrolled, e.last_activity_at AS last_activity,
            round(coalesce(e.total_activity_time, 0) / 3600.0, 1) AS hours_active,
            coalesce(done.n, 0) AS completed_assignments, pub.n AS total_assignments,
            CASE WHEN pub.n > 0 THEN round(100.0 * coalesce(done.n, 0) / pub.n, 0) END AS completion_pct,
            round(sc.score::numeric, 1) AS grade_pct
     FROM dbo.canvas_enrollments e
     JOIN dbo.canvas_users u ON u.id = e.user_id
     LEFT JOIN dbo.canvas_course_sections s ON s.id = e.course_section_id
     LEFT JOIN done ON done.user_id = e.user_id
     LEFT JOIN sc ON sc.enrollment_id = e.id
     CROSS JOIN pub
     WHERE e.course_id = $1 AND e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')
       ${sectionId ? 'AND e.course_section_id = $2' : ''}
     ORDER BY u.sortable_name`,
    sectionId ? [courseId, sectionId] : [courseId]
  );
}

export const avg = a => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null);

export function progressMetrics(rows) {
  const pcts = rows.filter(r => r.completion_pct !== null).map(r => Number(r.completion_pct));
  const grades = rows.filter(r => r.grade_pct !== null).map(r => Number(r.grade_pct));
  return {
    students: rows.length,
    students_active: rows.filter(r => r.status === 'Active').length,
    students_inactive: rows.filter(r => r.status === 'Inactive').length,
    students_completed: rows.filter(r => r.status === 'Completed').length,
    avg_completion_pct: avg(pcts),
    avg_grade_pct: avg(grades),
    finished_all: pcts.filter(p => p >= 100).length,
  };
}

export function instructorsOfCourse(courseId) {
  return q(
    `SELECT DISTINCT ON (u.id) u.id AS user_id, u.name, CASE e.workflow_state WHEN 'active' THEN 'Active' ELSE e.workflow_state END AS status,
            e.last_activity_at AS last_activity
     FROM dbo.canvas_enrollments e JOIN dbo.canvas_users u ON u.id = e.user_id
     WHERE e.course_id = $1 AND e.type = 'TeacherEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')
     ORDER BY u.id, e.workflow_state`, [courseId]);
}
