import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { name } = params;
    const res = await q(
      `SELECT column_name, data_type, is_nullable, character_maximum_length,
              column_default, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = 'dbo' AND table_name = $1
       ORDER BY ordinal_position`,
      [name]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const pkRes = await q(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = (quote_ident('dbo') || '.' || quote_ident($1))::regclass
         AND i.indisprimary`,
      [name]
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
