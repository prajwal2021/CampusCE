import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { GROUPS, groupExpr, groupLabelExpr, scopeCond } from '@/lib/portal';
import { parseFilters, Params, enrollWhere, comparisonRange, IS_DONE, DONE_AT } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const BASE = `FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id`;

/** Headline counts for one period (or the whole filter when range is undefined). */
async function kpis(f, range) {
  const p = new Params();
  const where = enrollWhere(f, p, range ? { range } : {});
  const r = await q(`
    SELECT count(*)::int AS enrollments,
           count(DISTINCT e.user_id)::int AS students,
           count(*) FILTER (WHERE e.workflow_state = 'active' AND NOT ${IS_DONE})::int AS active,
           count(*) FILTER (WHERE ${IS_DONE})::int AS completed,
           count(*) FILTER (WHERE e.workflow_state = 'inactive' AND NOT ${IS_DONE})::int AS dropped,
           count(*) FILTER (WHERE e.workflow_state = 'invited')::int AS invited,
           count(DISTINCT c.id)::int AS courses
    ${BASE} WHERE ${where}`, p.values);
  const k = r.rows[0];
  k.completion_rate = k.enrollments ? Math.round((1000 * k.completed) / k.enrollments) / 10 : null;
  k.drop_rate = k.enrollments ? Math.round((1000 * k.dropped) / k.enrollments) / 10 : null;
  return k;
}

/**
 * GET /api/portal/enrollments?scope&group&course&from&to&grain
 * Everything the enrollment dashboard draws: headline numbers (with the previous period for change),
 * the trend, and breakdowns by program, status, course, progress and recency.
 */
export async function GET(request) {
  try {
    const f = parseFilters(new URL(request.url).searchParams);
    const prevRange = comparisonRange(f, 'prev');

    const tp = new Params();
    const tWhere = enrollWhere(f, tp);
    const g = tp.add(f.grain);
    const fromP = tp.add(f.from);
    const toP = tp.add(f.to);
    const trendSql = `
      WITH base AS (SELECT e.created_at, ${DONE_AT} AS done_at ${BASE} WHERE ${tWhere}),
      bounds AS (SELECT date_trunc(${g}, coalesce(${fromP}::date, min(created_at))) AS lo,
                        date_trunc(${g}, coalesce(${toP}::date, greatest(max(created_at), max(done_at)))) AS hi FROM base),
      periods AS (SELECT generate_series(lo, hi, ('1 ' || ${g})::interval) AS p FROM bounds WHERE lo IS NOT NULL LIMIT 1000),
      n AS (SELECT date_trunc(${g}, created_at) AS p, count(*) AS c FROM base GROUP BY 1),
      d AS (SELECT date_trunc(${g}, done_at) AS p, count(*) AS c FROM base WHERE done_at IS NOT NULL GROUP BY 1)
      SELECT periods.p AS period, coalesce(n.c, 0)::int AS enrollments, coalesce(d.c, 0)::int AS completions,
             sum(coalesce(n.c, 0)) OVER (ORDER BY periods.p)::int AS cumulative
      FROM periods LEFT JOIN n ON n.p = periods.p LEFT JOIN d ON d.p = periods.p
      ORDER BY 1`;

    const bp = new Params();
    const bWhere = enrollWhere(f, bp);
    const byProgramSql = `
      SELECT ${groupExpr('c')} AS key, ${groupLabelExpr('c')} AS label, count(*)::int AS enrollments,
             count(DISTINCT e.user_id)::int AS students,
             count(*) FILTER (WHERE ${IS_DONE})::int AS completed,
             count(*) FILTER (WHERE e.workflow_state = 'active' AND NOT ${IS_DONE})::int AS active,
             count(*) FILTER (WHERE e.workflow_state = 'inactive' AND NOT ${IS_DONE})::int AS dropped
      ${BASE} WHERE ${bWhere} GROUP BY 1, 2 ORDER BY 3 DESC`;
    const byCourseSql = `
      SELECT c.id, c.name, c.sis_source_id AS sku, count(*)::int AS enrollments,
             count(*) FILTER (WHERE ${IS_DONE})::int AS completed,
             count(*) FILTER (WHERE e.workflow_state = 'active' AND NOT ${IS_DONE})::int AS active,
             count(*) FILTER (WHERE e.workflow_state = 'inactive' AND NOT ${IS_DONE})::int AS dropped,
             max(e.created_at) AS latest
      ${BASE} WHERE ${bWhere} GROUP BY c.id, c.name, c.sis_source_id ORDER BY 4 DESC, 2 LIMIT 15`;
    const progressSql = `
      WITH f AS (SELECT e.id, e.user_id, e.course_id, e.last_activity_at ${BASE} WHERE ${bWhere}),
      pub AS (SELECT context_id AS course_id, count(*) AS n FROM dbo.canvas_assignments
              WHERE context_type = 'Course' AND workflow_state = 'published' AND context_id IN (SELECT course_id FROM f) GROUP BY 1),
      done AS (SELECT s.course_id, s.user_id, count(*) AS n FROM dbo.canvas_submissions s
               JOIN dbo.canvas_assignments a ON a.id = s.assignment_id AND a.workflow_state = 'published'
               WHERE s.course_id IN (SELECT course_id FROM f) AND s.workflow_state IN ('submitted', 'graded', 'pending_review')
               GROUP BY 1, 2),
      pct AS (SELECT f.id, CASE WHEN pub.n > 0 THEN least(100, 100.0 * coalesce(done.n, 0) / pub.n) END AS v, f.last_activity_at
              FROM f LEFT JOIN pub ON pub.course_id = f.course_id LEFT JOIN done ON done.course_id = f.course_id AND done.user_id = f.user_id)
      SELECT round(avg(v))::int AS avg_progress,
             count(*) FILTER (WHERE v = 0)::int AS b0,
             count(*) FILTER (WHERE v > 0 AND v <= 25)::int AS b1,
             count(*) FILTER (WHERE v > 25 AND v <= 50)::int AS b2,
             count(*) FILTER (WHERE v > 50 AND v <= 75)::int AS b3,
             count(*) FILTER (WHERE v > 75 AND v < 100)::int AS b4,
             count(*) FILTER (WHERE v >= 100)::int AS b5,
             count(*) FILTER (WHERE v IS NULL)::int AS no_assignments,
             count(*) FILTER (WHERE last_activity_at >= now() - interval '7 days')::int AS a7,
             count(*) FILTER (WHERE last_activity_at < now() - interval '7 days' AND last_activity_at >= now() - interval '30 days')::int AS a30,
             count(*) FILTER (WHERE last_activity_at < now() - interval '30 days' AND last_activity_at >= now() - interval '90 days')::int AS a90,
             count(*) FILTER (WHERE last_activity_at < now() - interval '90 days')::int AS aold,
             count(*) FILTER (WHERE last_activity_at IS NULL)::int AS anever
      FROM pct`;

    // "Finished all assignments": a second completion measure, since most Canvas enrollments are never formally concluded
    const finishedSql = `
      WITH f AS (SELECT e.id, e.user_id, e.course_id, ${groupExpr('c')} AS key ${BASE} WHERE ${bWhere}),
      pub AS (SELECT context_id AS course_id, count(*) AS n FROM dbo.canvas_assignments
              WHERE context_type = 'Course' AND workflow_state = 'published' AND context_id IN (SELECT course_id FROM f) GROUP BY 1),
      done AS (SELECT s.course_id, s.user_id, count(*) AS n FROM dbo.canvas_submissions s
               JOIN dbo.canvas_assignments a ON a.id = s.assignment_id AND a.workflow_state = 'published'
               WHERE s.course_id IN (SELECT course_id FROM f) AND s.workflow_state IN ('submitted', 'graded', 'pending_review')
               GROUP BY 1, 2)
      SELECT f.course_id, f.key,
             count(*) FILTER (WHERE pub.n > 0 AND coalesce(done.n, 0) >= pub.n)::int AS finished,
             count(*) FILTER (WHERE pub.n > 0)::int AS with_assignments
      FROM f LEFT JOIN pub ON pub.course_id = f.course_id LEFT JOIN done ON done.course_id = f.course_id AND done.user_id = f.user_id
      GROUP BY 1, 2`;

    // courses for the filter menu: everything in scope / program with at least one enrollment
    const cp = new Params();
    const cf = { ...f, course: null, from: null, to: null };
    const coursesSql = `SELECT c.id, c.name, c.sis_source_id AS sku, count(*)::int AS n
      ${BASE} WHERE ${enrollWhere(cf, cp)} GROUP BY 1, 2, 3 ORDER BY 2 LIMIT 500`;

    const [cur, prev, trend, byProgram, byCourse, progress, courses, asOf, finished] = await Promise.all([
      kpis(f),
      prevRange ? kpis(f, prevRange) : null,
      q(trendSql, tp.values),
      q(byProgramSql, bp.values),
      q(byCourseSql, bp.values),
      q(progressSql, bp.values),
      q(coursesSql, cp.values),
      q(`SELECT max(finished_at) AS t FROM etl.run_table`),
      q(finishedSql, bp.values),
    ]);

    const rate = (n, d) => (d ? Math.round((100 * n) / d) : null);
    const fin = { course: new Map(), program: new Map(), finished: 0, with: 0 };
    for (const r of finished.rows) {
      fin.course.set(r.course_id, r);
      const pg = fin.program.get(r.key) || { finished: 0, with_assignments: 0 };
      pg.finished += r.finished; pg.with_assignments += r.with_assignments;
      fin.program.set(r.key, pg);
      fin.finished += r.finished; fin.with += r.with_assignments;
    }
    const withFinished = (row, src) => ({
      ...row,
      completion_rate: rate(row.completed, row.enrollments),
      finished_all: src?.finished ?? 0,
      finished_rate: rate(src?.finished ?? 0, src?.with_assignments ?? 0),
    });

    const pr = progress.rows[0] || {};
    const statuses = [
      { label: 'Active', value: cur.active },
      { label: 'Completed', value: cur.completed },
      { label: 'Dropped', value: cur.dropped },
      { label: 'Invited', value: cur.invited },
    ];
    const progressBuckets = [
      ['Not started', pr.b0], ['1–25%', pr.b1], ['26–50%', pr.b2], ['51–75%', pr.b3], ['76–99%', pr.b4], ['All done', pr.b5],
    ].map(([label, value]) => ({ label, value: value || 0 }));
    const activity = [
      ['Last 7 days', pr.a7], ['8–30 days', pr.a30], ['31–90 days', pr.a90], ['90+ days', pr.aold], ['Never', pr.anever],
    ].map(([label, value]) => ({ label, value: value || 0 }));

    return NextResponse.json({
      filters: f,
      previous_range: prevRange,
      data_as_of: asOf.rows[0]?.t || null,
      kpis: { ...cur, avg_progress: pr.avg_progress ?? null, finished_all: fin.finished, with_assignments: fin.with, finished_rate: rate(fin.finished, fin.with) },
      previous: prev,
      trend: trend.rows,
      by_program: byProgram.rows.map(r => withFinished(r, fin.program.get(r.key))),
      by_status: statuses,
      by_course: byCourse.rows.map(r => withFinished(r, fin.course.get(r.id))),
      progress: progressBuckets,
      no_assignments: pr.no_assignments || 0,
      activity,
      courses: courses.rows,
      programs: Object.entries(GROUPS).map(([key, g]) => ({ key, label: g.label })),
    });
  } catch (err) {
    console.error('[flumen] enrollments', err.message);
    return NextResponse.json({ error: 'Could not load enrollment figures right now.' }, { status: 500 });
  }
}
