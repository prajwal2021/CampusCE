import { NextResponse } from 'next/server';
import { q, sshExec } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [runRes, tableRes, dockerRes] = await Promise.all([
      q(`SELECT run_id, MIN(finished_at) AS started, MAX(finished_at) AS finished,
              COUNT(*) AS tables, SUM(changed_rows) AS changed, SUM(deleted_rows) AS deleted,
              SUM(rows_in_snapshot) AS total_rows
         FROM etl.run_table GROUP BY run_id ORDER BY MAX(finished_at) DESC LIMIT 10`),
      q(`SELECT table_name, pg_total_relation_size(quote_ident('dbo') || '.' || quote_ident(table_name)) AS size_bytes
         FROM information_schema.tables WHERE table_schema = 'dbo' ORDER BY table_name`),
      sshExec('docker ps --filter name=campusce --format "{{.Names}} {{.Status}}"').catch(() => ({ stdout: '', code: 1 })),
    ]);

    const lastRun = runRes.rows[0] || null;
    const totalTables = tableRes.rows.length;
    const totalSize = tableRes.rows.reduce((s, r) => s + parseInt(r.size_bytes || 0), 0);
    const dockerUp = dockerRes.stdout.includes('Up');

    return NextResponse.json({
      lastRun,
      recentRuns: runRes.rows,
      totalTables,
      totalSizeBytes: totalSize,
      dockerRunning: dockerUp,
      dockerStatus: dockerRes.stdout.trim(),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
