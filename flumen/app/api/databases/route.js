import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/databases
 * List all databases on the 0003 PostgreSQL server, with size and table count.
 */
export async function GET() {
  try {
    const dbRes = await q(`
      SELECT d.datname AS name,
             pg_database_size(d.datname) AS size_bytes,
             (SELECT count(*) FROM information_schema.tables t
              WHERE t.table_catalog = d.datname AND t.table_type = 'BASE TABLE') AS table_count
      FROM pg_database d
      WHERE d.datistemplate = false
      ORDER BY d.datname
    `);

    /* For the current database (CampusCE_ADS_DB), also get schemas and their tables */
    const schemaRes = await q(`
      SELECT table_schema, table_name,
             pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name)) AS size_bytes,
             (SELECT reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = t.table_schema AND c.relname = t.table_name) AS approx_rows
      FROM information_schema.tables t
      WHERE t.table_type = 'BASE TABLE'
        AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY t.table_schema, t.table_name
    `);

    return NextResponse.json({
      databases: dbRes.rows,
      currentDb: 'CampusCE_ADS_DB',
      schemas: schemaRes.rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
