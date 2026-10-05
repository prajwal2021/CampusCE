import { NextResponse } from 'next/server';
import { sshExec } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/actions/load
 * Triggers push.ps1-like loading of a pending run on 0003.
 * Body: { runId }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { runId } = body;

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    // Check if the run data exists in the inbox
    const check = await sshExec(`test -d ~/campusce_pipeline/inbox/${runId} && echo exists || echo missing`);
    if (!check.stdout.includes('exists')) {
      return NextResponse.json({ error: `Run ${runId} not found in inbox on 0003` }, { status: 404 });
    }

    // Trigger the loader
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

    return NextResponse.json({
      runId,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.code === 0,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
