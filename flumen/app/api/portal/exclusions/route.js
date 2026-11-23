import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { q } from '@/lib/db';
import { CE_JOIN, groupLabelExpr } from '@/lib/portal';
import { COOKIE_NAME, readToken } from '@/lib/session';
import { loadExclusions, changeExclusions } from '@/lib/exclusions';

export const dynamic = 'force-dynamic';

const LIVE = `e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected')`;
const DROP = `(e.workflow_state = 'inactive' AND NOT (e.workflow_state = 'completed' OR e.completed_at IS NOT NULL))`;
const toIds = list => list.map(x => Number(x.id)).filter(Number.isSafeInteger);

/**
 * GET  /api/portal/exclusions  the test accounts and test enrollments kept out of the numbers,
 *      likely test accounts not yet excluded, and the change history.
 * POST /api/portal/exclusions  { action: 'add' | 'remove', kind: 'user' | 'enrollment', ids: [..], reason }
 */
export async function GET() {
  try {
    const ex = loadExclusions();
    const userIds = toIds(ex.users), enrIds = toIds(ex.enrollments);

    const [users, enrollments, suggestions] = await Promise.all([
      userIds.length ? q(`
        SELECT u.id, u.name, cen.ce_number,
               count(e.id) FILTER (WHERE ${LIVE})::int AS enrollments,
               count(e.id) FILTER (WHERE ${LIVE} AND ${DROP})::int AS dropped
        FROM dbo.canvas_users u ${CE_JOIN('u')}
        LEFT JOIN dbo.canvas_enrollments e ON e.user_id = u.id
        WHERE u.id = ANY($1::bigint[]) GROUP BY u.id, u.name, cen.ce_number`, [userIds]) : { rows: [] },
      enrIds.length ? q(`
        SELECT e.id, e.user_id, u.name AS student, cen.ce_number, c.id AS course_id, c.name AS course, c.sis_source_id AS sku,
               CASE WHEN ${DROP} THEN 'Dropped' ELSE initcap(e.workflow_state) END AS status, e.created_at AS enrolled
        FROM dbo.canvas_enrollments e JOIN dbo.canvas_users u ON u.id = e.user_id JOIN dbo.canvas_courses c ON c.id = e.course_id
        ${CE_JOIN('u')} WHERE e.id = ANY($1::bigint[])`, [enrIds]) : { rows: [] },
      // Student accounts that look like tests: "Test" in the name (AlexTest, Test StudentOne) or "test" in the login
      q(`
        SELECT u.id, u.name, cen.ce_number,
               count(*)::int AS enrollments, count(*) FILTER (WHERE ${DROP})::int AS dropped,
               max(e.created_at) AS latest,
               string_agg(DISTINCT ${groupLabelExpr('c')}, ', ') AS programs,
               CASE WHEN u.name ~ 'Test|TEST' OR u.name ~* '\\mtest\\M' THEN 'Name contains "test"' ELSE 'Login contains "test"' END AS why
        FROM dbo.canvas_enrollments e
        JOIN dbo.canvas_users u ON u.id = e.user_id
        JOIN dbo.canvas_courses c ON c.id = e.course_id AND c.workflow_state <> 'deleted'
        ${CE_JOIN('u')}
        WHERE ${LIVE}
          AND (u.name ~ 'Test|TEST' OR u.name ~* '\\mtest\\M'
               OR EXISTS (SELECT 1 FROM dbo.canvas_pseudonyms ps WHERE ps.user_id = u.id AND ps.workflow_state <> 'deleted'
                          AND ps.unique_id ~* '(^|[^a-z])test'))
          AND NOT (u.id = ANY($1::bigint[]))
        GROUP BY u.id, u.name, cen.ce_number ORDER BY max(e.created_at) DESC LIMIT 100`, [userIds]),
    ]);

    const live = (list, rows, key = 'id') => {
      const by = new Map(rows.map(r => [String(r[key]), r]));
      return list.map(x => ({ ...x, live: by.get(String(x.id)) || null }));
    };
    return NextResponse.json({
      users: live(ex.users, users.rows),
      enrollments: live(ex.enrollments, enrollments.rows),
      suggestions: suggestions.rows,
      log: ex.log.slice(0, 300),
    });
  } catch (err) {
    console.error('[flumen] exclusions', err.message);
    return NextResponse.json({ error: 'Could not load the test enrollment list right now.' }, { status: 500 });
  }
}

/**
 * Match a pasted list (one entry per line: CampusCE number, TTU email / login, or full name) to Canvas
 * student accounts, so a list from CampusCE can be excluded in one go. Logins are matched on the
 * server and never returned.
 */
async function resolve(raw) {
  const lines = [...new Set((Array.isArray(raw) ? raw : [])
    .flatMap(l => (String(l).includes('@') ? String(l).split(/[,\s]+/) : [String(l)]))
    .map(l => l.trim().replace(/^["'<]+|["'>]+$/g, ''))
    .filter(l => l.length >= 2))].slice(0, 300);
  if (!lines.length) return NextResponse.json({ results: [] });

  const ex = new Set(loadExclusions().users.map(u => String(u.id)));
  const res = await q(`
    WITH l AS (SELECT v, n FROM unnest($1::text[]) WITH ORDINALITY AS t(v, n))
    SELECT l.n, u.id, u.name, cen.ce_number, s.enrollments, s.dropped
    FROM l
    JOIN dbo.canvas_users u ON
         (l.v ~* '^CE[0-9]+$' AND EXISTS (SELECT 1 FROM dbo.canvas_pseudonyms p WHERE p.user_id = u.id AND upper(p.sis_user_id) = upper(l.v)))
      OR (l.v LIKE '%@%' AND EXISTS (SELECT 1 FROM dbo.canvas_pseudonyms p WHERE p.user_id = u.id
                                     AND (lower(p.unique_id) = lower(l.v) OR lower(p.sis_user_id) = lower(l.v))))
      OR (l.v !~ '@' AND l.v !~* '^CE[0-9]+$'
          AND (lower(regexp_replace(u.name, '\\s+', ' ', 'g')) = lower(regexp_replace(l.v, '\\s+', ' ', 'g'))
               OR lower(u.sortable_name) = lower(l.v)))
    ${CE_JOIN('u')}
    LEFT JOIN LATERAL (SELECT count(*)::int AS enrollments, count(*) FILTER (WHERE ${DROP})::int AS dropped
                       FROM dbo.canvas_enrollments e WHERE e.user_id = u.id AND ${LIVE}) s ON TRUE
    ORDER BY l.n, s.enrollments DESC`, [lines]);

  const by = new Map();
  for (const r of res.rows) {
    const list = by.get(Number(r.n)) || [];
    if (!list.some(x => x.id === r.id)) list.push({ id: r.id, name: r.name, ce_number: r.ce_number, enrollments: r.enrollments, dropped: r.dropped, excluded: ex.has(String(r.id)) });
    by.set(Number(r.n), list);
  }
  return NextResponse.json({ results: lines.map((input, i) => ({ input, matches: by.get(i + 1) || [] })) });
}

export async function POST(request) {
  try {
    const session = await readToken(cookies().get(COOKIE_NAME)?.value);
    if (!session) return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (body.action === 'resolve') return resolve(body.lines);
    const action =body.action === 'remove' ? 'remove' : body.action === 'add' ? 'add' : null;
    const kind = body.kind === 'user' ? 'user' : body.kind === 'enrollment' ? 'enrollment' : null;
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isSafeInteger).slice(0, 500);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    if (!action || !kind || !ids.length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

    // Look the ids up so the list and the history read with names, and unknown ids are refused
    const found = kind === 'user'
      ? await q(`SELECT u.id, u.name, cen.ce_number AS ce FROM dbo.canvas_users u ${CE_JOIN('u')} WHERE u.id = ANY($1::bigint[])`, [ids])
      : await q(`SELECT e.id, u.name, cen.ce_number AS ce, c.name AS course FROM dbo.canvas_enrollments e
                 JOIN dbo.canvas_users u ON u.id = e.user_id JOIN dbo.canvas_courses c ON c.id = e.course_id ${CE_JOIN('u')}
                 WHERE e.id = ANY($1::bigint[]) AND e.type = 'StudentEnrollment'`, [ids]);
    // removing also works for entries whose Canvas record has since disappeared
    const items = action === 'remove'
      ? ids.map(id => found.rows.find(r => Number(r.id) === id) || { id })
      : found.rows;
    if (!items.length) return NextResponse.json({ error: 'No matching Canvas records' }, { status: 404 });

    const { changed } = changeExclusions({ action, kind, items, reason, by: session.user });
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    console.error('[flumen] exclusions change', err.message);
    return NextResponse.json({ error: 'Could not save the change.' }, { status: 500 });
  }
}
