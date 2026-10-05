import { NextResponse } from 'next/server';
import { q, sshExec } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/actions/load
 * Discover pending runs: what's in 0003 inbox but not yet in etl.run_table.
 */
export async function GET() {
  try {
    /* List runs in inbox on 0003 */
    const inbox = await sshExec('ls -1 ~/campusce_pipeline/inbox/ 2>/dev/null').catch(() => ({ stdout: '' }));
    const inboxRuns = inbox.stdout.trim().split('\n').filter(r => r && !r.startsWith('.'));

    /* Check which of those are already fully loaded */
    let loaded = new Set();
    if (inboxRuns.length > 0) {
      const res = await q(
        `SELECT DISTINCT run_id FROM etl.run_table WHERE run_id = ANY($1)`,
        [inboxRuns]
      );
      loaded = new Set(res.rows.map(r => r.run_id));
    }

    /* Get manifest info for pending runs (table count, total rows) */
    const pending = [];
    for (const runId of inboxRuns) {
      if (loaded.has(runId)) continue;
      const manifest = await sshExec(
        `cat ~/campusce_pipeline/inbox/${runId}/manifest.json 2>/dev/null`
      ).catch(() => ({ stdout: '{}' }));
      let info = {};
      try { info = JSON.parse(manifest.stdout); } catch {}
      pending.push({
        runId,
        tables: info.tables?.length || 0,
        totalRows: info.tables?.reduce((s, t) => s + (t.rows || 0), 0) || 0,
      });
    }

    /* Latest loaded run for context */
    const lastRes = await q(`
      SELECT run_id, MAX(finished_at) AS finished, COUNT(*) AS tables,
             SUM(rows_in_snapshot)::bigint AS total_rows
      FROM etl.run_table GROUP BY run_id ORDER BY MAX(finished_at) DESC LIMIT 1
    `);

    return NextResponse.json({
      pending,
      alreadyLoaded: [...loaded],
      lastLoadedRun: lastRes.rows[0] || null,
      nothingToPush: pending.length === 0 && inboxRuns.length === 0,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/actions/load
 * Load a specific run (or all pending) into PostgreSQL via loader.py on 0003.
 * Body: { runId? }  — omit runId to load all pending.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    let { runId } = body;

    /* If no runId, discover pending runs */
    if (!runId) {
      const inbox = await sshExec('ls -1 ~/campusce_pipeline/inbox/ 2>/dev/null').catch(() => ({ stdout: '' }));
      const inboxRuns = inbox.stdout.trim().split('\n').filter(r => r && !r.startsWith('.'));
      if (inboxRuns.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'Nothing to push. No pending runs in inbox on 0003.',
          results: [],
        });
      }
      /* Filter out already-loaded runs */
      const res = await q(
        `SELECT DISTINCT run_id FROM etl.run_table WHERE run_id = ANY($1)`,
        [inboxRuns]
      );
      const loaded = new Set(res.rows.map(r => r.run_id));
      const pending = inboxRuns.filter(r => !loaded.has(r));
      if (pending.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'All runs in inbox are already loaded.',
          results: [],
        });
      }
      /* Load each pending run */
      const results = [];
      for (const id of pending) {
        const result = await loadRun(id);
        results.push(result);
        if (!result.success) break; // stop on first failure
      }
      const allOk = results.every(r => r.success);
      return NextResponse.json({
        success: allOk,
        message: allOk
          ? `Loaded ${results.length} run(s) successfully.`
          : `Loaded ${results.filter(r => r.success).length}/${results.length} run(s). Check logs for failures.`,
        results,
      });
    }

    /* Load a specific run */
    const result = await loadRun(runId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function loadRun(runId) {
  const check = await sshExec(
    `test -d ~/campusce_pipeline/inbox/${runId} && echo exists || echo missing`
  );
  if (!check.stdout.includes('exists')) {
    return { runId, success: false, message: `Run ${runId} not found in inbox`, stdout: '', stderr: '' };
  }

  /* Read manifest for table list */
  const manifestOut = await sshExec(
    `cat ~/campusce_pipeline/inbox/${runId}/manifest.json 2>/dev/null`
  ).catch(() => ({ stdout: '{}' }));
  let manifest = {};
  try { manifest = JSON.parse(manifestOut.stdout); } catch {}

  const base = '~/campusce_pipeline';
  const cmd = [
    'docker run --rm --network host',
    `--env-file ${base}/secrets/pg.env`,
    `-e RUN_ID=${runId}`,
    `-v ${base}/inbox/${runId}:/run_data:ro`,
    `-v ${base}/repo/loader.py:/app/loader.py:ro`,
    'campusce-etl:latest python /app/loader.py /run_data',
  ].join(' ');

  const result = await sshExec(cmd);

  /* Parse loader output for per-table results */
  const tableResults = [];
  for (const line of result.stdout.split('\n')) {
    const loaded = line.match(/loaded (\S+): (\d+) rows, (\d+) changed, (\d+) deleted/);
    if (loaded) {
      tableResults.push({
        table: loaded[1], rows: +loaded[2], changed: +loaded[3], deleted: +loaded[4], status: 'loaded',
      });
    }
    const skipped = line.match(/skip (\S+) \(already loaded/);
    if (skipped) {
      tableResults.push({ table: skipped[1], status: 'skipped' });
    }
    const failed = line.match(/FAILED (\S+): (.+)/);
    if (failed) {
      tableResults.push({ table: failed[1], error: failed[2], status: 'failed' });
    }
  }

  return {
    runId,
    success: result.code === 0,
    exitCode: result.code,
    tables: manifest.tables?.map(t => t.table) || [],
    tableResults,
    stdout: result.stdout,
    message: result.code === 0
      ? `Run ${runId} loaded (${tableResults.filter(t => t.status === 'loaded').length} tables)`
      : `Run ${runId} failed (exit ${result.code})`,
  };
}
