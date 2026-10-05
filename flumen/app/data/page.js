'use client';

import { useEffect, useState, useCallback } from 'react';
import { get } from '@/lib/api';
import {
  Database, Table2, Search, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Loader2, Hash, Type, Calendar,
  ToggleLeft, Binary, Key
} from 'lucide-react';
import clsx from 'clsx';

function typeIcon(dataType) {
  if (!dataType) return Hash;
  const t = dataType.toLowerCase();
  if (t.includes('int') || t.includes('numeric') || t.includes('float') || t.includes('double') || t.includes('decimal')) return Hash;
  if (t.includes('bool')) return ToggleLeft;
  if (t.includes('timestamp') || t.includes('date') || t.includes('time')) return Calendar;
  if (t.includes('bytea') || t.includes('binary')) return Binary;
  return Type;
}

export default function DataBrowser() {
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(null);
  const [schema, setSchema] = useState(null);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    get('/tables').then(d => { setTables(d.tables); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const loadTable = useCallback(async (name) => {
    setSelected(name);
    setPage(1);
    setSortCol(null);
    setSortDir('asc');
    setDataLoading(true);
    try {
      const [s, d] = await Promise.all([
        get(`/tables/${name}/schema`),
        get(`/tables/${name}/data?page=1&limit=50`),
      ]);
      setSchema(s);
      setData(d);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (p, col, dir) => {
    if (!selected) return;
    setDataLoading(true);
    const sortQ = col ? `&sort=${col}&dir=${dir}` : '';
    try {
      const d = await get(`/tables/${selected}/data?page=${p}&limit=50${sortQ}`);
      setData(d);
      setPage(p);
    } finally {
      setDataLoading(false);
    }
  }, [selected]);

  const handleSort = (col) => {
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
    setSortCol(col);
    setSortDir(newDir);
    loadPage(1, col, newDir);
  };

  const filtered = tables.filter(t => t.table_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full">
      {/* Table list sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-surface-4 flex flex-col bg-surface-1">
        <div className="p-3 border-b border-surface-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter tables…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-surface-4 rounded-lg
                         text-sm text-zinc-200 placeholder:text-zinc-600
                         focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-accent animate-spin" /></div>
          ) : filtered.map(t => (
            <button
              key={t.table_name}
              onClick={() => loadTable(t.table_name)}
              className={clsx(
                'w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors',
                selected === t.table_name
                  ? 'bg-accent/10 text-accent border-r-2 border-accent'
                  : 'text-zinc-400 hover:bg-surface-3 hover:text-zinc-200'
              )}
            >
              <Table2 className="w-4 h-4 shrink-0" />
              <span className="truncate font-mono text-xs">{t.table_name}</span>
              <span className="ml-auto text-[10px] text-zinc-600">{parseInt(t.approx_rows || 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-surface-4 text-xs text-zinc-500">
          {tables.length} tables in <span className="font-mono text-zinc-400">dbo</span>
        </div>
      </div>

      {/* Data view */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600">
            <div className="text-center">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a table to browse data</p>
            </div>
          </div>
        ) : (
          <>
            {/* Table header bar */}
            <div className="px-5 py-4 border-b border-surface-4 flex items-center gap-4 bg-surface-1/50">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100 font-mono">{selected}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-zinc-500">{data?.total?.toLocaleString()} rows</span>
                  {schema?.primaryKey?.length > 0 && (
                    <span className="badge-info">
                      <Key className="w-3 h-3" />
                      PK: {schema.primaryKey.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              {data && (
                <div className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
                  <button
                    onClick={() => loadPage(page - 1, sortCol, sortDir)}
                    disabled={page <= 1}
                    className="btn-ghost p-1.5 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="tabular-nums text-xs">{page} / {data.pages || 1}</span>
                  <button
                    onClick={() => loadPage(page + 1, sortCol, sortDir)}
                    disabled={page >= (data.pages || 1)}
                    className="btn-ghost p-1.5 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Data table */}
            <div className="flex-1 overflow-auto relative">
              {dataLoading && (
                <div className="absolute inset-0 bg-surface-0/60 flex items-center justify-center z-10">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                </div>
              )}
              {data && (
                <table className="w-full">
                  <thead className="sticky top-0 z-[5]">
                    <tr>
                      {data.columns.map(col => {
                        const schemaCol = schema?.columns?.find(c => c.column_name === col);
                        const TIcon = typeIcon(schemaCol?.data_type);
                        const isSort = sortCol === col;
                        return (
                          <th key={col} className="table-header whitespace-nowrap" onClick={() => handleSort(col)}>
                            <span className="inline-flex items-center gap-1.5">
                              <TIcon className="w-3 h-3 opacity-40" />
                              {col}
                              {isSort ? (
                                sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-accent" /> : <ArrowDown className="w-3 h-3 text-accent" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-30" />
                              )}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-3/40 transition-colors">
                        {data.columns.map(col => (
                          <td key={col} className="table-cell" title={row[col]?.toString()}>
                            {row[col] === null ? <span className="text-zinc-600 italic">null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
