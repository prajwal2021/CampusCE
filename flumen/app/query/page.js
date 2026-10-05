'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { post, get } from '@/lib/api';
import {
  Play, Save, FolderOpen, Trash2, Clock, Table2, AlertCircle,
  ChevronDown, Download, Loader2, Plus, X, CheckCircle2, Copy
} from 'lucide-react';
import clsx from 'clsx';

const STORAGE_KEY = 'flumen_saved_queries';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveSaved(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
}

export default function QueryTerminal() {
  const [sql, setSql] = useState('SELECT table_schema, table_name, \n       pg_total_relation_size(quote_ident(table_schema)||\'.\' ||quote_ident(table_name)) AS size\nFROM information_schema.tables\nWHERE table_schema = \'dbo\'\nORDER BY table_name;');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [saved, setSaved] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [schemas, setSchemas] = useState([]);
  const textareaRef = useRef(null);

  useEffect(() => { setSaved(loadSaved()); }, []);
  useEffect(() => {
    get('/databases').then(d => setSchemas(d.schemas || [])).catch(() => {});
  }, []);

  const execute = useCallback(async () => {
    if (!sql.trim() || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await post('/query', { sql: sql.trim(), limit: 1000 });
      if (res.error) {
        setError(res);
      } else {
        setResult(res);
        setHistory(prev => [{ sql: sql.trim(), rows: res.rowCount, elapsed: res.elapsed, ts: Date.now() }, ...prev].slice(0, 50));
      }
    } catch (e) {
      setError({ error: e.message });
    } finally {
      setRunning(false);
    }
  }, [sql, running]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      execute();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd } = e.target;
      const newVal = sql.slice(0, selectionStart) + '  ' + sql.slice(selectionEnd);
      setSql(newVal);
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = selectionStart + 2;
      }, 0);
    }
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    const entry = { name: saveName.trim(), sql: sql.trim(), savedAt: Date.now() };
    const next = [entry, ...saved.filter(s => s.name !== saveName.trim())];
    setSaved(next);
    saveSaved(next);
    setShowSaveDialog(false);
    setSaveName('');
  };

  const handleLoad = (entry) => {
    setSql(entry.sql);
    setShowSaved(false);
  };

  const handleDelete = (name) => {
    const next = saved.filter(s => s.name !== name);
    setSaved(next);
    saveSaved(next);
  };

  const exportCSV = () => {
    if (!result) return;
    const header = result.columns.join(',');
    const rows = result.rows.map(r =>
      result.columns.map(c => {
        const v = r[c];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-4 bg-surface-1/50">
        <button onClick={execute} disabled={running || !sql.trim()} className="btn-primary py-1.5 px-3 text-xs">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Run
        </button>
        <span className="text-[10px] text-zinc-600 ml-1">Ctrl+Enter</span>

        <div className="w-px h-5 bg-surface-4 mx-2" />

        <button onClick={() => setShowSaveDialog(true)} className="btn-ghost py-1.5 px-2.5 text-xs">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        <div className="relative">
          <button onClick={() => setShowSaved(!showSaved)} className="btn-ghost py-1.5 px-2.5 text-xs">
            <FolderOpen className="w-3.5 h-3.5" /> Saved
            <ChevronDown className="w-3 h-3" />
          </button>
          {showSaved && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-surface-2 border border-surface-4 rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto">
              {saved.length === 0 ? (
                <p className="px-3 py-4 text-xs text-zinc-500 text-center">No saved queries</p>
              ) : saved.map(s => (
                <div key={s.name} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-3 cursor-pointer group">
                  <button onClick={() => handleLoad(s)} className="flex-1 text-left min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{s.name}</p>
                    <p className="text-[10px] text-zinc-500 truncate font-mono">{s.sql.slice(0, 60)}</p>
                  </button>
                  <button onClick={() => handleDelete(s.name)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {result && (
          <>
            <div className="w-px h-5 bg-surface-4 mx-2" />
            <button onClick={exportCSV} className="btn-ghost py-1.5 px-2.5 text-xs">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          {result && (
            <>
              <span className="flex items-center gap-1"><Table2 className="w-3 h-3" />{result.rowCount} rows</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{result.elapsed}ms</span>
            </>
          )}
        </div>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="px-4 py-2 border-b border-surface-4 bg-surface-1 flex items-center gap-2">
          <input
            type="text"
            placeholder="Query name…"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
            className="flex-1 bg-surface-2 border border-surface-4 rounded px-3 py-1.5 text-sm text-zinc-200
                       placeholder:text-zinc-600 focus:outline-none focus:border-accent/50"
          />
          <button onClick={handleSave} disabled={!saveName.trim()} className="btn-primary py-1.5 px-3 text-xs">Save</button>
          <button onClick={() => setShowSaveDialog(false)} className="btn-ghost py-1.5 px-2 text-xs"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Editor + Results split */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* SQL Editor */}
        <div className="relative border-b border-surface-4" style={{ minHeight: '140px', maxHeight: '40%' }}>
          <div className="absolute top-2 right-2 text-[10px] text-zinc-600 z-10">PostgreSQL · CampusCE_ADS_DB</div>
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="w-full h-full p-4 pr-40 bg-surface-0 text-sm font-mono text-zinc-200
                       placeholder:text-zinc-600 resize-y outline-none
                       caret-accent selection:bg-accent/20"
            style={{ minHeight: '140px', tabSize: 2 }}
            placeholder="Write your SQL query here…"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto min-h-0">
          {error && (
            <div className="p-4">
              <div className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300">Query Error</p>
                  <pre className="text-xs text-red-400/80 mt-1 whitespace-pre-wrap font-mono">{error.error}</pre>
                  {error.elapsed && <p className="text-[10px] text-zinc-600 mt-2">{error.elapsed}ms</p>}
                </div>
              </div>
            </div>
          )}

          {result && result.rows.length > 0 && (
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-[5]">
                  <tr>
                    <th className="table-header text-center w-12 text-zinc-600">#</th>
                    {result.columns.map(col => (
                      <th key={col} className="table-header whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-3/40 transition-colors">
                      <td className="table-cell text-center text-zinc-600 text-[10px]">{i + 1}</td>
                      {result.columns.map(col => (
                        <td key={col} className="table-cell" title={row[col]?.toString()}>
                          {row[col] === null
                            ? <span className="text-zinc-600 italic">null</span>
                            : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.rows.length === 0 && (
            <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Query executed successfully. {result.rowCount} row(s) affected.
            </div>
          )}

          {!result && !error && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <Table2 className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">Run a query to see results</p>
              <p className="text-xs mt-1">Ctrl+Enter to execute</p>
            </div>
          )}
        </div>

        {/* Schema sidebar at bottom */}
        {schemas.length > 0 && (
          <div className="border-t border-surface-4 bg-surface-1 px-4 py-2 max-h-28 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Tables</p>
            <div className="flex flex-wrap gap-1.5">
              {schemas.map(s => (
                <button
                  key={`${s.table_schema}.${s.table_name}`}
                  onClick={() => setSql(prev => prev + ` ${s.table_schema}.${s.table_name}`)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-3 text-zinc-400
                             hover:bg-accent/10 hover:text-accent transition-colors"
                  title={`${s.table_schema}.${s.table_name} — ~${parseInt(s.approx_rows || 0).toLocaleString()} rows`}
                >
                  {s.table_schema === 'dbo' ? s.table_name : `${s.table_schema}.${s.table_name}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
