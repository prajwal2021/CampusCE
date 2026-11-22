import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { groupExpr, groupLabelExpr } from '@/lib/portal';
import { parseFilters, Params, enrollWhere, comparisonRange, IS_DONE } from '@/lib/filters';

export const dynamic = 'force-dynamic';

const BASE = `FROM dbo.canvas_enrollments e JOIN dbo.canvas_courses c ON c.id = e.course_id`;
const isoDay = d => d.toISOString().slice(0, 10);

/**
 * GET /api/portal/reports?scope&group&course&from&to&grain&compare=prev|yoy
 * Report datasets that the enrollment endpoint does not already provide: period comparison,
 * grade bands, new students over time and instructor load.
 */
export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const f = parseFilters(sp);
    const mode = sp.get('compare') === 'yoy' ? 'yoy' : 'prev';

    // Comparison needs a closed range; without one, compare the last 90 days.
    const today = new Date();
    const cf = f.from && f.to ? f : { ...f, from: isoDay(new Date(today.getTime() - 89 * 86400000)), to: isoDay(today) };
    const prior = comparisonRange(cf, mode);

    const period = (range) => {
      const p = new Params();
      const where = enrollWhere(f, p, { range });
      return q(`SELECT ${groupExpr('c')} AS key, ${groupLabelExpr('c')} AS label, count(*)::int AS enrollments,
                       count(DISTINCT e.user_id)::int AS students, count(*) FILTER (WHERE ${IS_DONE})::int AS completed
                ${BASE} WHERE ${where} GROUP BY 1, 2`, p.values);
    };

    const gp = new Params();
    const gWhere = enrollWhere(f, gp);
    const gradesSql = `
      WITH sc AS (SELECT enrollment_id, max(current_score) AS s FROM dbo.canvas_scores
                  WHERE assignment_group_id IS NULL AND workflow_state = 'active' AND current_score IS NOT NULL GROUP BY 1)
      SELECT count(*) FILTER (WHERE sc.s >= 90)::int AS a, count(*) FILTER (WHERE sc.s >= 80 AND sc.s < 90)::int AS b,
             count(*) FILTER (WHERE sc.s >= 70 AND sc.s < 80)::int AS c, count(*) FILTER (WHERE sc.s >= 60 AND sc.s < 70)::int AS d,
             count(*) FILTER (WHERE sc.s < 60)::int AS f, round(avg(sc.s)::numeric, 1) AS avg_score, count(sc.s)::int AS graded
      ${BASE} JOIN sc ON sc.enrollment_id = e.id WHERE ${gWhere}`;

    // New students: the first enrollment a person ever had within the scope / program filter.
    const np = new Params();
    const nWhere = enrollWhere({ ...f, from: null, to: null }, np);
    const g = np.add(f.grain);
    const fromP = np.add(f.from);
    const toP = np.add(f.to);
    const newSql = `
      WITH firsts AS (SELECT e.user_id, min(e.created_at) AS first_at, count(*) AS n ${BASE} WHERE ${nWhere} GROUP BY 1),
      win AS (SELECT * FROM firsts WHERE (${fromP}::date IS NULL OR first_at >= ${fromP}::date) AND (${toP}::date IS NULL OR first_at < ${toP}::date + 1)),
      bounds AS (SELECT date_trunc(${g}, coalesce(${fromP}::date, min(first_at))) AS lo, date_trunc(${g}, coalesce(${toP}::date, max(first_at))) AS hi FROM win),
      periods AS (SELECT generate_series(lo, hi, ('1 ' || ${g})::interval) AS p FROM bounds WHERE lo IS NOT NULL LIMIT 1000),
      agg AS (SELECT date_trunc(${g}, first_at) AS p, count(*) AS c, count(*) FILTER (WHERE n > 1) AS repeaters FROM win GROUP BY 1)
      SELECT periods.p AS period, coalesce(agg.c, 0)::int AS new_students, coalesce(agg.repeaters, 0)::int AS took_more
      FROM periods LEFT JOIN agg ON agg.p = periods.p ORDER BY 1`;

    const ip = new Params();
    const iWhere = enrollWhere(f, ip);
    const instructorsSql = `
      WITH f AS (SELECT e.course_id, e.user_id, ${IS_DONE} AS done ${BASE} WHERE ${iWhere})
      SELECT u.id, u.name, count(DISTINCT t.course_id)::int AS courses, count(f.user_id)::int AS enrollments,
             count(*) FILTER (WHERE f.done)::int AS completed
      FROM (SELECT DISTINCT user_id, course_id FROM dbo.canvas_enrollments
            WHERE type = 'TeacherEnrollment' AND workflow_state = 'active') t
      JOIN dbo.canvas_users u ON u.id = t.user_id
      JOIN f ON f.course_id = t.course_id
      GROUP BY u.id, u.name ORDER BY 4 DESC, 2 LIMIT 12`;

    const [a, b, grades, fresh, instructors] = await Promise.all([
      period(cf), period(prior), q(gradesSql, gp.values), q(newSql, np.values), q(instructorsSql, ip.values),
    ]);

    const keys = new Map();
    for (const r of a.rows) keys.set(r.key, { key: r.key, label: r.label, current: r, previous: null });
    for (const r of b.rows) {
      if (!keys.has(r.key)) keys.set(r.key, { key: r.key, label: r.label, current: null, previous: r });
      else keys.get(r.key).previous = r;
    }
    const zero = { enrollments: 0, students: 0, completed: 0 };
    const rows = [...keys.values()].map(k => ({ key: k.key, label: k.label, current: k.current || zero, previous: k.previous || zero }))
      .sort((x, y) => y.current.enrollments - x.current.enrollments);
    const total = which => rows.reduce((s, r) => ({
      enrollments: s.enrollments + r[which].enrollments, students: s.students + r[which].students, completed: s.completed + r[which].completed,
    }), { ...zero });

    const gr = grades.rows[0] || {};
    return NextResponse.json({
      comparison: { mode, current: { from: cf.from, to: cf.to }, previous: prior, rows, totals: { current: total('current'), previous: total('previous') } },
      grades: {
        avg: gr.avg_score ?? null, graded: gr.graded || 0,
        bands: [['90–100%', gr.a], ['80–89%', gr.b], ['70–79%', gr.c], ['60–69%', gr.d], ['Below 60%', gr.f]].map(([label, value]) => ({ label, value: value || 0 })),
      },
      new_students: fresh.rows,
      instructors: instructors.rows.map(r => ({ ...r, completion_rate: r.enrollments ? Math.round((100 * r.completed) / r.enrollments) : null })),
    });
  } catch (err) {
    console.error('[flumen] reports', err.message);
    return NextResponse.json({ error: 'Could not load reports right now.' }, { status: 500 });
  }
}
