import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { name } = params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const sortCol = searchParams.get('sort') || null;
    const sortDir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    // Validate table exists
    const check = await q(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'dbo' AND table_name = $1`,
      [name]
    );
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Get columns to validate sort
    const colRes = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'dbo' AND table_name = $1 ORDER BY ordinal_position`,
      [name]
    );
    const validCols = colRes.rows.map(r => r.column_name);

    const orderBy = sortCol && validCols.includes(sortCol)
      ? `ORDER BY "${sortCol}" ${sortDir} NULLS LAST`
      : '';

    const [dataRes, countRes] = await Promise.all([
      q(`SELECT * FROM dbo."${name}" ${orderBy} LIMIT $1 OFFSET $2`, [limit, offset]),
      q(`SELECT count(*) AS total FROM dbo."${name}"`),
    ]);

    return NextResponse.json({
      table: name,
      columns: validCols,
      rows: dataRes.rows,
      total: parseInt(countRes.rows[0].total),
      page,
      limit,
      pages: Math.ceil(parseInt(countRes.rows[0].total) / limit),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
