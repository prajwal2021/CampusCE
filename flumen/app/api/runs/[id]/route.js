import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const res = await q(
      `SELECT table_name, rows_in_snapshot, changed_rows, deleted_rows, finished_at
       FROM etl.run_table WHERE run_id = $1 ORDER BY table_name`,
      [id]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json({ run_id: id, tables: res.rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
