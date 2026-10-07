import { NextResponse } from 'next/server';
import { qdb, DEFAULT_DB } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { name } = params;
    const sp = new URL(request.url).searchParams;
    const db = sp.get('db') || DEFAULT_DB;
    const schema = sp.get('schema') || 'dbo';

    const res = await qdb(db,
      `SELECT column_name, data_type, is_nullable, character_maximum_length,
              column_default, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, name]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const pkRes = await qdb(db,
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary`,
      [schema, name]
    );

    return NextResponse.json({
      table: name,
      columns: res.rows,
      primaryKey: pkRes.rows.map(r => r.attname),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
