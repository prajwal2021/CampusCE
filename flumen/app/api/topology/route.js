import { NextResponse } from 'next/server';
import { q, sshExec } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [tablesRes, dockerRes, diskRes] = await Promise.all([
      q(`SELECT t.table_name,
                pg_total_relation_size(quote_ident('dbo') || '.' || quote_ident(t.table_name)) AS size_bytes,
                (SELECT reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'dbo' AND c.relname = t.table_name) AS approx_rows
         FROM information_schema.tables t
         WHERE t.table_schema = 'dbo' AND t.table_type = 'BASE TABLE'
         ORDER BY t.table_name`),
      sshExec('docker ps --filter name=campusce --format "{{.Names}}|{{.Status}}|{{.Image}}"').catch(() => ({ stdout: '', code: 1 })),
      sshExec('df -h /home/prajsrin 2>/dev/null | tail -1').catch(() => ({ stdout: '', code: 1 })),
    ]);

    const containers = dockerRes.stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, status, image] = line.split('|');
      return { name, status, image };
    });

    const diskParts = diskRes.stdout.trim().split(/\s+/);
    const disk = diskParts.length >= 5
      ? { total: diskParts[1], used: diskParts[2], avail: diskParts[3], pct: diskParts[4] }
      : null;

    return NextResponse.json({
      nodes: {
        ads: {
          label: 'ADS SQL Server',
          host: 'appdata.ads.ttu.edu',
          db: 'ELEARNING_CampusCE',
          type: 'mssql',
        },
        laptop: {
          label: 'Laptop (pull.ps1)',
          host: 'Local machine',
          role: 'ETL orchestrator',
          type: 'orchestrator',
        },
        pg: {
          label: 'PostgreSQL 16',
          host: 'tosmonline0003.ttu.edu',
          db: 'CampusCE_ADS_DB',
          port: 5433,
          type: 'postgresql',
          tables: tablesRes.rows,
          containers,
          disk,
        },
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
