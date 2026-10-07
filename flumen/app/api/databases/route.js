import { NextResponse } from 'next/server';
import { q, qdb, DEFAULT_DB } from '@/lib/db';

export const dynamic = 'force-dynamic';

const tablesSql = (system) => `
  SELECT n.nspname AS table_schema, c.relname AS table_name,
         CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'table' END AS kind,
         CASE WHEN c.relkind IN ('v') THEN 0 ELSE pg_total_relation_size(c.oid) END AS size_bytes,
         c.reltuples::bigint AS approx_rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND ${system ? 'TRUE' : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
  ORDER BY n.nspname, c.relname
`;
const TABLES_SQL = tablesSql(false);

/**
 * GET /api/databases            -> all databases on the 0003 server (+ tables of the pipeline DB)
 * GET /api/databases?db=<name>  -> tables of that database
 */
export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const db = sp.get('db');
    const system = sp.get('system') === '1';

    if (db) {
      const known = await q(`SELECT 1 FROM pg_database WHERE datname = $1 AND NOT datistemplate`, [db]);
      if (known.rows.length === 0) return NextResponse.json({ error: 'Database not found' }, { status: 404 });
      try {
        const res = await qdb(db, tablesSql(system));
        return NextResponse.json({ db, tables: res.rows });
      } catch (err) {
        return NextResponse.json({ db, tables: [], error: err.message });
      }
    }

    const dbRes = await q(`
      SELECT d.datname AS name,
             pg_database_size(d.datname) AS size_bytes,
             has_database_privilege(d.datname, 'CONNECT') AS can_connect
      FROM pg_database d
      WHERE d.datistemplate = false
      ORDER BY d.datname
    `);
    const schemaRes = await q(TABLES_SQL);

    return NextResponse.json({
      databases: dbRes.rows.map(d => ({
        ...d,
        table_count: d.name === DEFAULT_DB ? schemaRes.rows.length : null,
      })),
      currentDb: DEFAULT_DB,
      schemas: schemaRes.rows,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
