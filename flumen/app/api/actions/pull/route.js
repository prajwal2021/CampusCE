import { NextResponse } from 'next/server';
import { q, sshExec } from '@/lib/db';
import net from 'net';

export const dynamic = 'force-dynamic';

/** TCP probe — resolves true/false */
function probe(host, port, timeout = 5000) {
  return new Promise(resolve => {
    const sock = net.createConnection({ host, port, timeout }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

/**
 * GET  — dashboard pull-status check (non-destructive)
 * POST — "initiate pull" — same checks, plus looks for staged data on 0003
 */
async function handler(request) {
  try {
    const isPost = request.method === 'POST';

    /* 1. Probe ADS SQL Server */
    const adsReachable = await probe('appdata.ads.ttu.edu', 1433);

    /* 2. Latest loaded run from PG */
    const lastRes = await q(`
      SELECT run_id, MAX(finished_at) AS finished, COUNT(*) AS tables,
             SUM(rows_in_snapshot)::bigint AS total_rows,
             SUM(changed_rows)::bigint AS changed
      FROM etl.run_table GROUP BY run_id
      ORDER BY MAX(finished_at) DESC LIMIT 1
    `);
    const lastRun = lastRes.rows[0] || null;
    const hoursSince = lastRun
      ? Math.round((Date.now() - new Date(lastRun.finished).getTime()) / 3600000 * 10) / 10
      : null;

    /* 3. Check 0003 inbox for runs already uploaded but not yet loaded */
    let pendingRuns = [];
    if (isPost) {
      const inbox = await sshExec('ls -1 ~/campusce_pipeline/inbox/ 2>/dev/null').catch(() => ({ stdout: '' }));
      pendingRuns = inbox.stdout.trim().split('\n').filter(r => r && !r.startsWith('.'));
    }

    /* 4. Compose response */
    let status, message;

    if (!adsReachable) {
      status = 'vpn_on';
      message = 'ADS SQL Server is not reachable from the network. Turn off VPN, then pull.';
    } else if (hoursSince !== null && hoursSince < 8) {
      status = 'recent';
      message = `Last sync was ${hoursSince}h ago (${lastRun.tables} tables, ${parseInt(lastRun.total_rows).toLocaleString()} rows). Next scheduled pull in ~${Math.max(0, 8 - hoursSince).toFixed(1)}h. Run pull.ps1 -MinHours 0 to force.`;
    } else {
      status = 'ready';
      message = `ADS is reachable. ${hoursSince !== null ? `Last sync was ${hoursSince}h ago.` : 'No syncs recorded yet.'} Ready to pull.`;
    }

    return NextResponse.json({
      status,          // 'vpn_on' | 'recent' | 'ready'
      adsReachable,
      lastRun,
      hoursSinceSync: hoursSince,
      pendingRuns,     // only filled on POST
      message,
      pullCommand: 'cd C:\\Users\\prajsrin\\Documents\\campusCE; .\\pull.ps1' + (hoursSince !== null && hoursSince < 8 ? ' -MinHours 0' : ''),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
