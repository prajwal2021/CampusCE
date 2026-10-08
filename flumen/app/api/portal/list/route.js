import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { TYPES, GROUPS, groupExpr, scopeCond, escapeLike } from '@/lib/portal';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const type = sp.get('type');
    const def = TYPES[type];
    if (!def) return NextResponse.json({ error: 'Unknown list' }, { status: 404 });

    const offset = Math.max(0, parseInt(sp.get('offset') || '0') || 0);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50') || 50));
    const search = (sp.get('q') || '').trim().slice(0, 80);
    const status = sp.get('status') || '';
    const sortKey = def.sort[sp.get('sort')] ? sp.get('sort') : def.defaultSort;
    const dir = (sp.get('dir') || def.defaultDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const group = GROUPS[sp.get('group')] ? sp.get('group') : null;
    const scope = sp.get('scope') === 'all' ? 'all' : 'ce';
    const from = typeof def.from === 'function' ? def.from(group, scope) : def.from;

    const params = [];
    const where = [def.where];
    if (group && typeof def.from !== 'function') where.push(`${groupExpr('c')} = '${group}'`);
    if (scopeCond(scope) && typeof def.from !== 'function') where.push(scopeCond(scope));
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      where.push('(' + def.search.map(c => `${c} ILIKE $${params.length}`).join(' OR ') + ')');
    }
    if (status && def.statuses.some(s => s.value === status)) {
      params.push(status);
      where.push(`${def.statusExpr} = $${params.length}`);
    }
    params.push(limit, offset);

    const sql = `SELECT ${def.select}, count(*) OVER() AS _total
                 FROM ${from}
                 WHERE ${where.join(' AND ')}
                 ORDER BY ${def.sort[sortKey]} ${dir} NULLS LAST, 1
                 LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const res = await q(sql, params);

    return NextResponse.json({
      type,
      title: def.title,
      columns: def.columns,
      statuses: def.statuses,
      link: def.link || null,
      group: group ? { key: group, label: GROUPS[group].label } : null,
      scope,
      sort: sortKey,
      dir: dir.toLowerCase(),
      total: res.rows.length ? parseInt(res.rows[0]._total) : 0,
      rows: res.rows.map(({ _total, ...r }) => r),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load this list right now.' }, { status: 500 });
  }
}
