import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const runA = searchParams.get('runA');
    const runB = searchParams.get('runB');

    if (!runA || !runB) {
      // Return the list of available runs for the dropdowns
      const runsRes = await q(`
        SELECT run_id, MAX(finished_at) AS finished, COUNT(*) AS tables
        FROM etl.run_table GROUP BY run_id ORDER BY MAX(finished_at) DESC LIMIT 20
      `);
      return NextResponse.json({ runs: runsRes.rows, comparison: null });
    }

    // Per-table comparison between two runs
    const res = await q(`
      SELECT COALESCE(a.table_name, b.table_name) AS table_name,
             a.rows_in_snapshot AS rows_a, b.rows_in_snapshot AS rows_b,
             a.changed_rows AS changed_a, b.changed_rows AS changed_b,
             a.deleted_rows AS deleted_a, b.deleted_rows AS deleted_b,
             CASE WHEN a.table_name IS NULL THEN 'added_in_b'
                  WHEN b.table_name IS NULL THEN 'removed_in_b'
                  WHEN a.rows_in_snapshot != b.rows_in_snapshot
                    OR a.changed_rows != b.changed_rows
                    OR a.deleted_rows != b.deleted_rows THEN 'different'
                  ELSE 'same' END AS status
      FROM etl.run_table a
      FULL OUTER JOIN etl.run_table b
        ON a.table_name = b.table_name AND b.run_id = $2
      WHERE a.run_id = $1 OR (a.run_id IS NULL AND b.run_id = $2)
      ORDER BY COALESCE(a.table_name, b.table_name)
    `, [runA, runB]);

    const summary = {
      same: res.rows.filter(r => r.status === 'same').length,
      different: res.rows.filter(r => r.status === 'different').length,
      added: res.rows.filter(r => r.status === 'added_in_b').length,
      removed: res.rows.filter(r => r.status === 'removed_in_b').length,
    };

    return NextResponse.json({ runA, runB, tables: res.rows, summary });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
