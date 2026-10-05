'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { get } from '@/lib/api';
import {
  Database, Table2, Search, ChevronDown, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Loader2, Hash, Type, Calendar,
  ToggleLeft, Binary, Key, Pin, PinOff, HardDrive
} from 'lucide-react';
import clsx from 'clsx';

const PIN_KEY = 'flumen_pinned_dbs';

function typeIcon(dataType) {
  if (!dataType) return Hash;
  const t = dataType.toLowerCase();
  if (t.includes('int') || t.includes('numeric') || t.includes('float') || t.includes('double') || t.includes('decimal')) return Hash;
  if (t.includes('bool')) return ToggleLeft;
  if (t.includes('timestamp') || t.includes('date') || t.includes('time')) return Calendar;
  if (t.includes('bytea') || t.includes('binary')) return Binary;
  return Type;
}

function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function loadPinned() {
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); } catch { return []; }
}
function savePinned(arr) {
  try { localStorage.setItem(PIN_KEY, JSON.stringify(arr)); } catch {}
}

export default function DataBrowser() {
  const [databases, setDatabases] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [pinned, setPinned] = useState([]);
  const [selected, setSelected] = useState(null);
  const [schema, setSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [total, setTotal] = useState(0);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const scrollRef = useRef(null);
  const LIMIT = 100;

  useEffect(() => {
    setPinned(loadPinned());
    get('/databases').then(d => {
      setDatabases(d.databases || []);
      setSchemas(d.schemas || []);
      /* Auto-expand CampusCE_ADS_DB */
      setExpanded(new Set([d.currentDb || 'CampusCE_ADS_DB']));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggleExpand = (dbName) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(dbName) ? next.delete(dbName) : next.add(dbName);
      return next;
    });
  };

  const togglePin = (dbName) => {
    setPinned(prev => {
      const next = prev.includes(dbName) ? prev.filter(d => d !== dbName) : [...prev, dbName];
      savePinned(next);
      return next;
    });
  };

  const loadTable = useCallback(async (name) => {
    setSelected(name);
    setPage(1);
    setRows([]);
    setSortCol(null);
    setSortDir('asc');
    setDataLoading(true);
    try {
      const [s, d] = await Promise.all([
        get(`/tables/${name}/schema`),
        get(`/tables/${name}/data?page=1&limit=${LIMIT}`),
      ]);
      setSchema(s);
      setColumns(d.columns);
      setRows(d.rows);
      setTotal(d.total);
      setPage(1);
    } finally {
      setDataLoading(false);
    }
  }, []);

  /* Infinite scroll — load more rows */
  const loadMore = useCallback(async () => {
    if (!selected || loadingMore || rows.length >= total) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    const sortQ = sortCol ? `&sort=${sortCol}&dir=${sortDir}` : '';
    try {
      const d = await get(`/tables/${selected}/data?page=${nextPage}&limit=${LIMIT}${sortQ}`);
      setRows(prev => [...prev, ...d.rows]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }, [selected, page, sortCol, sortDir, loadingMore, rows.length, total]);

  /* Scroll handler for infinite scroll */
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      loadMore();
    }
  }, [loadMore]);

  const handleSort = async (col) => {
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
    setSortCol(col);
    setSortDir(newDir);
    setDataLoading(true);
    try {
      const d = await get(`/tables/${selected}/data?page=1&limit=${LIMIT}&sort=${col}&dir=${newDir}`);
      setRows(d.rows);
      setTotal(d.total);
      setPage(1);
    } finally {
      setDataLoading(false);
    }
  };

  /* Group schemas by database */
  const dbGroups = {};
  for (const s of schemas) {
    const key = `${s.table_schema}`;
    if (!dbGroups[key]) dbGroups[key] = [];
    dbGroups[key].push(s);
  }

  /* Sort databases: pinned first, then alphabetical */
  const sortedDbs = [...databases].sort((a, b) => {
    const aPinned = pinned.includes(a.name);
    const bPinned = pinned.includes(b.name);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return a.name.localeCompare(b.name);
  });

  const filtered = search
    ? schemas.filter(s => s.table_name.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div className="flex h-full">
      {/* Database / table list sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-surface-4 flex flex-col bg-surface-1">
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
          ) : search && filtered ? (
            /* Search results — flat list */
            filtered.map(t => (
              <TableButton
                key={`${t.table_schema}.${t.table_name}`}
                name={t.table_name}
                schema={t.table_schema}
                rows={t.approx_rows}
                selected={selected === t.table_name}
                onClick={() => loadTable(t.table_name)}
              />
            ))
          ) : (
            /* Database tree */
            sortedDbs.map(db => {
              const isExpanded = expanded.has(db.name);
              const isPinned = pinned.includes(db.name);
              const isCurrentDb = db.name === 'CampusCE_ADS_DB';
              const tablesInDb = isCurrentDb ? schemas : [];

              return (
                <div key={db.name}>
                  <div className="flex items-center group">
                    <button
                      onClick={() => toggleExpand(db.name)}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-3 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      }
                      <Database className={clsx('w-4 h-4 shrink-0', isCurrentDb ? 'text-accent' : 'text-zinc-500')} />
                      <span className={clsx('text-xs font-medium truncate', isCurrentDb ? 'text-accent' : 'text-zinc-300')}>
                        {db.name}
                      </span>
                    </button>
                    <button
                      onClick={() => togglePin(db.name)}
                      className={clsx(
                        'px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity',
                        isPinned && 'opacity-100'
                      )}
                      title={isPinned ? 'Unpin' : 'Pin to top'}
                    >
                      {isPinned
                        ? <PinOff className="w-3 h-3 text-accent" />
                        : <Pin className="w-3 h-3 text-zinc-500" />
                      }
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-3">
                      {isCurrentDb && tablesInDb.length > 0 ? (
                        /* Group by schema */
                        Object.entries(dbGroups).map(([schemaName, tables]) => (
                          <div key={schemaName}>
                            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
                              {schemaName}
                            </div>
                            {tables.map(t => (
                              <TableButton
                                key={t.table_name}
                                name={t.table_name}
                                rows={t.approx_rows}
                                size={t.size_bytes}
                                selected={selected === t.table_name}
                                onClick={() => loadTable(t.table_name)}
                              />
                            ))}
                          </div>
                        ))
                      ) : (
                        <div className="px-6 py-3 text-xs text-zinc-600">
                          {isCurrentDb ? 'No tables' : (
                            <span className="flex items-center gap-1.5">
                              <HardDrive className="w-3 h-3" />
                              {fmtBytes(parseInt(db.size_bytes || 0))}
                              {db.table_count > 0 && ` · ${db.table_count} tables`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="px-4 py-3 border-t border-surface-4 text-xs text-zinc-500">
          {databases.length} databases · {schemas.length} tables
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
                  <span className="text-xs text-zinc-500">{total.toLocaleString()} rows</span>
                  <span className="text-xs text-zinc-600">{rows.length.toLocaleString()} loaded</span>
                  {schema?.primaryKey?.length > 0 && (
                    <span className="badge-info">
                      <Key className="w-3 h-3" />
                      PK: {schema.primaryKey.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Data table — infinite scroll */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto relative"
              onScroll={handleScroll}
            >
              {dataLoading && (
                <div className="absolute inset-0 bg-surface-0/60 flex items-center justify-center z-10">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                </div>
              )}
              {columns.length > 0 && (
                <table className="w-full">
                  <thead className="sticky top-0 z-[5]">
                    <tr>
                      {columns.map(col => {
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
                                <ArrowUpDown className="w-3 h-3 opacity-20" />
                              )}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-3/40 transition-colors">
                        {columns.map(col => (
                          <td key={col} className="table-cell" title={row[col]?.toString()}>
                            {row[col] === null ? <span className="text-zinc-600 italic">null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Infinite scroll loader */}
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                </div>
              )}
              {rows.length > 0 && rows.length >= total && (
                <div className="text-center py-3 text-xs text-zinc-600">
                  All {total.toLocaleString()} rows loaded
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TableButton({ name, schema, rows, size, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors',
        selected
          ? 'bg-accent/10 text-accent border-r-2 border-accent'
          : 'text-zinc-400 hover:bg-surface-3 hover:text-zinc-200'
      )}
    >
      <Table2 className="w-3.5 h-3.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="truncate font-mono text-xs block">{name}</span>
        {schema && <span className="text-[9px] text-zinc-600">{schema}</span>}
      </div>
      <span className="ml-auto text-[10px] text-zinc-600 shrink-0">
        {size ? fmtBytes(parseInt(size)) : parseInt(rows || 0).toLocaleString()}
      </span>
    </button>
  );
}
