import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await q(`
      SELECT run_id, MIN(finished_at) AS started, MAX(finished_at) AS finished,
             COUNT(*) AS tables_loaded, SUM(changed_rows) AS changed,
             SUM(deleted_rows) AS deleted, SUM(rows_in_snapshot) AS total_rows
      FROM etl.run_table
      GROUP BY run_id
      ORDER BY MAX(finished_at) DESC
      LIMIT 50
    `);
    return NextResponse.json({ runs: res.rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
