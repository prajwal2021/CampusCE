import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await q(`
      SELECT t.table_name,
             pg_total_relation_size(quote_ident('dbo') || '.' || quote_ident(t.table_name)) AS size_bytes,
             (SELECT reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'dbo' AND c.relname = t.table_name) AS approx_rows
      FROM information_schema.tables t
      WHERE t.table_schema = 'dbo' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);
    return NextResponse.json({ tables: res.rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
