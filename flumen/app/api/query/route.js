import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/query
 * Execute a SQL query against the 0003 PostgreSQL database.
 * Body: { sql, limit? }
 *
 * Only SELECT / WITH / EXPLAIN / SHOW queries are allowed (read-only).
 */
export async function POST(request) {
  const started = Date.now();
  try {
    const body = await request.json();
    const { sql, limit = 500 } = body;

    if (!sql?.trim()) {
      return NextResponse.json({ error: 'Empty query' }, { status: 400 });
    }

    /* Reject anything that isn't a read-only statement */
    const trimmed = sql.trim().replace(/^--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const firstWord = trimmed.split(/\s+/)[0].toUpperCase();
    const allowed = ['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'TABLE'];
    if (!allowed.includes(firstWord)) {
      return NextResponse.json({
        error: `Only read-only queries are allowed (SELECT, WITH, EXPLAIN, SHOW). Got: ${firstWord}`,
      }, { status: 403 });
    }

    /* Wrap in a limit if not already present (safety net for large tables) */
    let execSql = sql.trim().replace(/;+$/, '');
    if (firstWord === 'SELECT' && !/\bLIMIT\b/i.test(execSql)) {
      execSql = `SELECT * FROM (${execSql}) AS _q LIMIT ${limit}`;
    }

    const result = await q(execSql);
    const elapsed = Date.now() - started;

    return NextResponse.json({
      columns: result.fields?.map(f => f.name) || [],
      rows: result.rows || [],
      rowCount: result.rowCount,
      elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - started;
    return NextResponse.json({
      error: err.message,
      position: err.position ? parseInt(err.position) : undefined,
      elapsed,
    }, { status: 400 });
  }
}
