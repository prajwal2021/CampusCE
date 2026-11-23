import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { GROUPS, groupExpr, groupLabelExpr, CE_JOIN } from '@/lib/portal';
import { parseFilters, Params, enrollWhere, IS_DONE } from '@/lib/filters';
import { isTest, loadExclusions } from '@/lib/exclusions';

export const dynamic = 'force-dynamic';

const BASE = `FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id`;
const DROP = `(e.workflow_state = 'inactive' AND NOT ${IS_DONE})`;
// Canvas keeps no separate "dropped on" date; an inactive enrollment's last update is when it was deactivated.
const DROP_AT = 'e.updated_at';
const rate = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);

/**
 * GET /api/portal/drops?scope&group&course&from&to&grain&tests=include
 * Drops and retention, with CampusCE test enrollments shown separately. Every figure is computed
 * both ways, so the page can say how much the tests would have moved the drop rate.
 *   Rates use enrollments created in the date range (a cohort) and how many of those were dropped.
 *   "Drops over time" and the records use the drop date.
 */
export async function GET(request) {
  try {
    const f = parseFilters(new URL(request.url).searchParams);
    const all = { ...f, tests: true };          // filters always include tests; is_test splits them
    const T = isTest('e');

    const kp = new Params();
    const kWhere = enrollWhere(all, kp);
    const kpiSql = `
      SELECT count(*) FILTER (WHERE NOT t)::int AS enrollments,
             count(*) FILTER (WHERE NOT t AND d)::int AS dropped,
             count(*) FILTER (WHERE t)::int AS test_enrollments,
             count(*) FILTER (WHERE t AND d)::int AS test_dropped,
             count(*) FILTER (WHERE NOT t AND done)::int AS completed,
             count(*) FILTER (WHERE NOT t AND active)::int AS active,
             count(DISTINCT user_id) FILTER (WHERE NOT t AND d)::int AS students_dropped,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY days) FILTER (WHERE NOT t AND d) AS median_days
      FROM (SELECT e.user_id, ${T} AS t, ${DROP} AS d, ${IS_DONE} AS done,
                   (e.workflow_state = 'active' AND NOT ${IS_DONE}) AS active,
                   extract(epoch FROM ${DROP_AT} - e.created_at) / 86400 AS days
            ${BASE} WHERE ${kWhere}) x`;

    // Drops by the day / week / month they happened (drop date in range)
    const tp = new Params();
    const tWhere = enrollWhere(all, tp, { dates: false });
    const g = tp.add(f.grain);
    const fromP = tp.add(f.from);
    const toP = tp.add(f.to);
    const trendSql = `
      WITH base AS (SELECT ${DROP_AT} AS at, ${T} AS t ${BASE} WHERE ${tWhere} AND ${DROP}
                    AND (${fromP}::date IS NULL OR ${DROP_AT} >= ${fromP}::date) AND (${toP}::date IS NULL OR ${DROP_AT} < ${toP}::date + 1)),
      bounds AS (SELECT date_trunc(${g}, coalesce(${fromP}::date, min(at))) AS lo, date_trunc(${g}, coalesce(${toP}::date, max(at))) AS hi FROM base),
      periods AS (SELECT generate_series(lo, hi, ('1 ' || ${g})::interval) AS p FROM bounds WHERE lo IS NOT NULL LIMIT 1500),
      agg AS (SELECT date_trunc(${g}, at) AS p, count(*) FILTER (WHERE NOT t) AS real, count(*) FILTER (WHERE t) AS test FROM base GROUP BY 1)
      SELECT periods.p AS period, coalesce(agg.real, 0)::int AS drops, coalesce(agg.test, 0)::int AS test_drops,
             sum(coalesce(agg.real, 0)) OVER (ORDER BY periods.p)::int AS cumulative
      FROM periods LEFT JOIN agg ON agg.p = periods.p ORDER BY 1`;

    // Drop rate of each enrollment cohort (enrolled in the period, dropped at any time since)
    const cp = new Params();
    const cWhere = enrollWhere(all, cp);
    const cg = cp.add(f.grain);
    const cohortSql = `
      SELECT date_trunc(${cg}, e.created_at) AS period,
             count(*) FILTER (WHERE NOT ${T})::int AS enrollments,
             count(*) FILTER (WHERE NOT ${T} AND ${DROP})::int AS dropped,
             count(*)::int AS enrollments_all,
             count(*) FILTER (WHERE ${DROP})::int AS dropped_all
      ${BASE} WHERE ${cWhere} GROUP BY 1 ORDER BY 1 LIMIT 1500`;

    const bp = new Params();
    const bWhere = enrollWhere(all, bp);
    const byProgramSql = `
      SELECT ${groupExpr('c')} AS key, ${groupLabelExpr('c')} AS label,
             count(*) FILTER (WHERE NOT ${T})::int AS enrollments,
             count(*) FILTER (WHERE NOT ${T} AND ${DROP})::int AS dropped,
             count(*) FILTER (WHERE ${T})::int AS test_enrollments,
             count(*) FILTER (WHERE ${T} AND ${DROP})::int AS test_dropped
      ${BASE} WHERE ${bWhere} GROUP BY 1, 2 ORDER BY 4 DESC, 3 DESC`;

    const byCourseSql = `
      SELECT c.id, c.name, c.sis_source_id AS sku,
             count(*) FILTER (WHERE NOT ${T})::int AS enrollments,
             count(*) FILTER (WHERE NOT ${T} AND ${DROP})::int AS dropped,
             count(*) FILTER (WHERE ${T})::int AS test_enrollments,
             count(*) FILTER (WHERE ${T} AND ${DROP})::int AS test_dropped
      ${BASE} WHERE ${bWhere} GROUP BY c.id, c.name, c.sis_source_id
      HAVING count(*) FILTER (WHERE ${DROP}) > 0
      ORDER BY 5 DESC, 7 DESC, 2 LIMIT 15`;

    // How long after enrolling, and how engaged, the (real) drops were
    const shapeSql = `
      WITH d AS (SELECT e.user_id, e.course_id, e.last_activity_at,
                        extract(epoch FROM ${DROP_AT} - e.created_at) / 86400 AS days
                 ${BASE} WHERE ${bWhere} AND ${DROP} AND NOT ${T}),
      sub AS (SELECT DISTINCT s.user_id, s.course_id FROM dbo.canvas_submissions s
              WHERE s.course_id IN (SELECT course_id FROM d) AND s.workflow_state IN ('submitted', 'graded', 'pending_review'))
      SELECT count(*) FILTER (WHERE days < 1)::int AS t0, count(*) FILTER (WHERE days >= 1 AND days < 8)::int AS t1,
             count(*) FILTER (WHERE days >= 8 AND days < 31)::int AS t2, count(*) FILTER (WHERE days >= 31 AND days < 91)::int AS t3,
             count(*) FILTER (WHERE days >= 91)::int AS t4,
             count(*) FILTER (WHERE d.last_activity_at IS NULL)::int AS never,
             count(*) FILTER (WHERE d.last_activity_at IS NOT NULL AND sub.user_id IS NULL)::int AS looked,
             count(*) FILTER (WHERE sub.user_id IS NOT NULL)::int AS worked
      FROM d LEFT JOIN sub ON sub.user_id = d.user_id AND sub.course_id = d.course_id`;

    // Drop records (drop date in range), tests included and flagged
    const rp = new Params();
    const rWhere = enrollWhere(all, rp, { dates: false });
    const rFrom = rp.add(f.from);
    const rTo = rp.add(f.to);
    const recordsSql = `
      SELECT e.id, e.user_id, u.name AS student, cen.ce_number, c.id AS course_id, c.name AS course, c.sis_source_id AS sku,
             ${groupLabelExpr('c')} AS program, e.created_at AS enrolled, ${DROP_AT} AS dropped_at,
             round((extract(epoch FROM ${DROP_AT} - e.created_at) / 86400)::numeric, 1)::float AS days_enrolled,
             e.last_activity_at AS last_activity, ${T} AS is_test
      ${BASE} JOIN dbo.canvas_users u ON u.id = e.user_id ${CE_JOIN('u')}
      WHERE ${rWhere} AND ${DROP}
        AND (${rFrom}::date IS NULL OR ${DROP_AT} >= ${rFrom}::date) AND (${rTo}::date IS NULL OR ${DROP_AT} < ${rTo}::date + 1)
      ORDER BY ${DROP_AT} DESC LIMIT 2000`;

    // courses for the filter menu
    const lp = new Params();
    const coursesSql = `SELECT c.id, c.name, c.sis_source_id AS sku, count(*)::int AS n
      ${BASE} WHERE ${enrollWhere({ ...all, course: null, from: null, to: null }, lp)} GROUP BY 1, 2, 3 ORDER BY 2 LIMIT 500`;

    const [kpi, trend, cohort, byProgram, byCourse, shape, records, asOf, courses] = await Promise.all([
      q(kpiSql, kp.values), q(trendSql, tp.values), q(cohortSql, cp.values), q(byProgramSql, bp.values),
      q(byCourseSql, bp.values), q(shapeSql, bp.values), q(recordsSql, rp.values),
      q(`SELECT max(finished_at) AS t FROM etl.run_table`), q(coursesSql, lp.values),
    ]);

    const k = kpi.rows[0];
    const allEnr = k.enrollments + k.test_enrollments, allDrop = k.dropped + k.test_dropped;
    const kpis = {
      ...k,
      median_days: k.median_days === null ? null : Math.round(k.median_days * 10) / 10,
      drop_rate: rate(k.dropped, k.enrollments),
      drop_rate_with_tests: rate(allDrop, allEnr),
      retention_rate: k.enrollments ? Math.round((1000 * (k.enrollments - k.dropped)) / k.enrollments) / 10 : null,
    };
    // when the page is set to include tests, the headline numbers include them
    const shown = f.tests
      ? { enrollments: allEnr, dropped: allDrop, drop_rate: kpis.drop_rate_with_tests }
      : { enrollments: k.enrollments, dropped: k.dropped, drop_rate: kpis.drop_rate };

    const s = shape.rows[0] || {};
    const ex = loadExclusions();
    return NextResponse.json({
      filters: f,
      data_as_of: asOf.rows[0]?.t || null,
      kpis: { ...kpis, shown },
      trend: trend.rows,
      cohort: cohort.rows.map(r => ({
        ...r, drop_rate: rate(r.dropped, r.enrollments), drop_rate_with_tests: rate(r.dropped_all, r.enrollments_all),
      })),
      by_program: byProgram.rows.map(r => ({ ...r, drop_rate: rate(r.dropped, r.enrollments) })),
      by_course: byCourse.rows.map(r => ({ ...r, drop_rate: rate(r.dropped, r.enrollments) })),
      time_to_drop: [['Same day', s.t0], ['1–7 days', s.t1], ['8–30 days', s.t2], ['31–90 days', s.t3], ['Over 90 days', s.t4]]
        .map(([label, value]) => ({ label, value: value || 0 })),
      engagement: [['Never opened the course', s.never], ['Opened, turned nothing in', s.looked], ['Turned in some work', s.worked]]
        .map(([label, value]) => ({ label, value: value || 0 })),
      records: records.rows,
      excluded: { users: ex.users.length, enrollments: ex.enrollments.length },
      courses: courses.rows,
      programs: Object.entries(GROUPS).map(([key, gr]) => ({ key, label: gr.label })),
    });
  } catch (err) {
    console.error('[flumen] drops', err.message);
    return NextResponse.json({ error: 'Could not load drop figures right now.' }, { status: 500 });
  }
}
