"""
Loads one pulled run (gzipped CSV batches from pull.ps1) into the CampusCE_ADS_DB Postgres database.

Runs on 0003 inside the campusce-etl container (--network host), connecting to the Postgres container on
127.0.0.1:5433. Credentials come from the environment (POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB).

Per table, in ONE transaction:
  1. create dbo.<table> if missing (lower-case names, types from the generated schema json)
  2. COPY every batch into a temp staging table
  3. merge the full snapshot into the target
       - table with primary key: upsert changed rows, delete rows missing from the snapshot
       - table without key:      compare row-hash multisets; replace the table only if anything differs
  4. check the row count against the manifest, record the result in etl.run_table, commit
A table already recorded as done for this run is skipped, so a failed run resumes at the first unfinished table.
"""
import glob
import gzip
import json
import os
import sys
import time

import psycopg2

RUN_DIR = sys.argv[1]
RUN_ID = os.environ.get('RUN_ID') or os.path.basename(RUN_DIR.rstrip('/'))
TARGET_SCHEMA = 'dbo'


def ident(name):
    return '"' + name.lower().replace('"', '""') + '"'


def log(msg):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), msg, flush=True)


def connect():
    return psycopg2.connect(
        host='127.0.0.1', port=5433,
        user=os.environ['POSTGRES_USER'], password=os.environ['POSTGRES_PASSWORD'],
        dbname=os.environ['POSTGRES_DB'], connect_timeout=15)


def ensure_state_tables(conn):
    with conn, conn.cursor() as cur:
        cur.execute('CREATE SCHEMA IF NOT EXISTS etl')
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS {TARGET_SCHEMA}')
        cur.execute("""CREATE TABLE IF NOT EXISTS etl.run_table (
            run_id text NOT NULL, table_name text NOT NULL, rows_in_snapshot bigint NOT NULL,
            changed_rows bigint NOT NULL, deleted_rows bigint NOT NULL, finished_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (run_id, table_name))""")


def load_table(conn, schema_json, expected_rows):
    table = schema_json['table']
    cols = schema_json['columns']
    pk = [c.lower() for c in schema_json['pk']]
    names = [c['name'].lower() for c in cols]
    if len(set(names)) != len(names):
        raise RuntimeError(f'{table}: column names collide after lower-casing')
    target = f'{TARGET_SCHEMA}.{ident(table)}'
    col_defs = ', '.join(f'{ident(c["name"])} {c["pgtype"]}{"" if c["nullable"] else " NOT NULL"}' for c in cols)
    pk_def = f', PRIMARY KEY ({", ".join(ident(c) for c in pk)})' if pk else ''
    col_list = ', '.join(ident(n) for n in names)

    with conn.cursor() as cur:
        cur.execute(f'CREATE TABLE IF NOT EXISTS {target} ({col_defs}{pk_def})')
        cur.execute("""SELECT column_name FROM information_schema.columns
                       WHERE table_schema = %s AND table_name = %s ORDER BY ordinal_position""",
                    (TARGET_SCHEMA, table.lower()))
        existing = [r[0] for r in cur.fetchall()]

        # Auto-add columns that exist in source but not yet in the target
        for c in cols:
            cn = c['name'].lower()
            if cn not in existing:
                cur.execute(f'ALTER TABLE {target} ADD COLUMN {ident(cn)} {c["pgtype"]}')
                log(f'  added column {cn} ({c["pgtype"]}) to {table}')

        removed = [c for c in existing if c not in names]
        if removed:
            log(f'  warning: {table} target has columns not in source: {removed}')

        # Create staging table matching source column order (CSV column order)
        stg_defs = ', '.join(f'{ident(c["name"])} {c["pgtype"]}' for c in cols)
        cur.execute(f'CREATE TEMP TABLE stg ({stg_defs}) ON COMMIT DROP')
        batches = sorted(glob.glob(os.path.join(RUN_DIR, 'data', table, '*.csv.gz')))
        for b in batches:
            with gzip.open(b, 'rt', encoding='utf-8', newline='') as fh:
                cur.copy_expert('COPY stg FROM STDIN WITH (FORMAT csv)', fh)
        cur.execute('SELECT count(*) FROM stg')
        staged = cur.fetchone()[0]
        if staged != expected_rows:
            raise RuntimeError(f'{table}: staged {staged} rows but manifest says {expected_rows}')

        changed = deleted = 0
        if pk:
            join = ' AND '.join(f's.{ident(c)} = t.{ident(c)}' for c in pk)
            sets = ', '.join(f'{ident(n)} = EXCLUDED.{ident(n)}' for n in names if n not in pk)
            conflict = ', '.join(ident(c) for c in pk)
            action = f'DO UPDATE SET {sets} WHERE (t.*)::text IS DISTINCT FROM (EXCLUDED.*)::text' if sets else 'DO NOTHING'
            cur.execute(f'INSERT INTO {target} AS t ({col_list}) SELECT {col_list} FROM stg ON CONFLICT ({conflict}) {action}')
            changed = cur.rowcount
            cur.execute(f'DELETE FROM {target} t WHERE NOT EXISTS (SELECT 1 FROM stg s WHERE {join})')
            deleted = cur.rowcount
        else:
            cur.execute(f"""SELECT (SELECT count(*) FROM (
                    (SELECT md5(s::text) h, count(*) n FROM stg s GROUP BY 1)
                    EXCEPT (SELECT md5(x::text), count(*) FROM {target} x GROUP BY 1)) a)
                 + (SELECT count(*) FROM (
                    (SELECT md5(x::text) h, count(*) n FROM {target} x GROUP BY 1)
                    EXCEPT (SELECT md5(s::text), count(*) FROM stg s GROUP BY 1)) b)""")
            if cur.fetchone()[0] > 0:
                cur.execute(f'SELECT count(*) FROM {target}')
                before = cur.fetchone()[0]
                cur.execute(f'TRUNCATE {target}')
                cur.execute(f'INSERT INTO {target} ({col_list}) SELECT {col_list} FROM stg')
                changed, deleted = staged, before

        cur.execute(f'SELECT count(*) FROM {target}')
        final = cur.fetchone()[0]
        if final != expected_rows:
            raise RuntimeError(f'{table}: target has {final} rows after merge, expected {expected_rows}')
        cur.execute('INSERT INTO etl.run_table (run_id, table_name, rows_in_snapshot, changed_rows, deleted_rows) '
                    'VALUES (%s, %s, %s, %s, %s)', (RUN_ID, table, staged, changed, deleted))
    return staged, changed, deleted


def main():
    with open(os.path.join(RUN_DIR, 'manifest.json'), encoding='utf-8-sig') as fh:
        manifest = json.load(fh)
    conn = connect()
    ensure_state_tables(conn)
    failures = []
    for t in manifest['tables']:
        table = t['table']
        with conn.cursor() as cur:
            cur.execute('SELECT 1 FROM etl.run_table WHERE run_id = %s AND table_name = %s', (RUN_ID, table))
            done = cur.fetchone() is not None
        conn.commit()
        if done:
            log(f'skip {table} (already loaded for this run)')
            continue
        try:
            with open(os.path.join(RUN_DIR, 'schema', f'{table}.json'), encoding='utf-8-sig') as fh:
                schema_json = json.load(fh)
            rows, changed, deleted = load_table(conn, schema_json, t['rows'])
            conn.commit()
            log(f'loaded {table}: {rows} rows, {changed} changed, {deleted} deleted')
        except Exception as exc:  # roll back this table only; carry on with the others
            conn.rollback()
            log(f'FAILED {table}: {exc}')
            failures.append(table)
    conn.close()
    if failures:
        log(f'run {RUN_ID} incomplete; failed tables: {", ".join(failures)}')
        sys.exit(1)
    log(f'run {RUN_ID} fully loaded')


if __name__ == '__main__':
    main()
