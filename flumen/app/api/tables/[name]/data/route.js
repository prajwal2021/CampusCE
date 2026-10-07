import { NextResponse } from 'next/server';
import { qdb, DEFAULT_DB } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ident = s => '"' + String(s).replace(/"/g, '""') + '"';

export async function GET(request, { params }) {
  try {
    const { name } = params;
    const { searchParams } = new URL(request.url);
    const db = searchParams.get('db') || DEFAULT_DB;
    const schema = searchParams.get('schema') || 'dbo';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const sortCol = searchParams.get('sort') || null;
    const sortDir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    // Column list doubles as the existence check and the sort whitelist
    const colRes = await qdb(db,
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [schema, name]
    );
    if (colRes.rows.length === 0) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }
    const validCols = colRes.rows.map(r => r.column_name);

    const target = `${ident(schema)}.${ident(name)}`;
    const orderBy = sortCol && validCols.includes(sortCol)
      ? `ORDER BY ${ident(sortCol)} ${sortDir} NULLS LAST`
      : '';

    const [dataRes, countRes] = await Promise.all([
      qdb(db, `SELECT * FROM ${target} ${orderBy} LIMIT $1 OFFSET $2`, [limit, offset]),
      qdb(db, `SELECT count(*) AS total FROM ${target}`),
    ]);
    const total = parseInt(countRes.rows[0].total);

    return NextResponse.json({
      table: name,
      columns: validCols,
      rows: dataRes.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
