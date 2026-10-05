'use client';

import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import {
  Activity as ActivityIcon, Loader2, ChevronDown, ChevronRight, Clock,
  ArrowUpFromLine, ArrowDownToLine, CheckCircle2, Table2,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import clsx from 'clsx';

function fmtCST(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago', hour12: true,
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function Activity() {
  const [runs, setRuns] = useState([]);
  const [details, setDetails] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/runs').then(d => {
      setRuns(d.runs || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggle = async (runId) => {
    const next = new Set(expanded);
    if (next.has(runId)) {
      next.delete(runId);
    } else {
      next.add(runId);
      if (!details[runId]) {
        try {
          const d = await get(`/runs/${encodeURIComponent(runId)}`);
          setDetails(prev => ({ ...prev, [runId]: d.tables }));
        } catch { /* ignore */ }
      }
    }
    setExpanded(next);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );

  // Trend chart data
  const trendData = runs.map(r => ({
    run: r.run_id?.slice(0, 8),
    changed: parseInt(r.changed || 0),
    deleted: parseInt(r.deleted || 0),
    total: parseInt(r.total_rows || 0),
    date: fmtCST(r.finished),
  })).reverse();

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Activity</h1>
        <p className="text-sm text-zinc-500 mt-1">Run history &amp; incremental changes</p>
      </div>

      {/* Trend chart */}
      <div className="card">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Change Trend</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="gChanged" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gDeleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="run" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#a1a1aa' }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
              />
              <Area type="monotone" dataKey="changed" stroke="#6366f1" fill="url(#gChanged)" strokeWidth={2} name="Changed" />
              <Area type="monotone" dataKey="deleted" stroke="#ef4444" fill="url(#gDeleted)" strokeWidth={2} name="Deleted" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {runs.length === 0 && (
          <div className="card text-center py-12 text-zinc-500 text-sm">No runs recorded yet</div>
        )}
        {runs.map((run, i) => {
          const isOpen = expanded.has(run.run_id);
          const tables = details[run.run_id];
          const totalChanged = parseInt(run.changed || 0);
          const totalDeleted = parseInt(run.deleted || 0);
          const totalRows = parseInt(run.total_rows || 0);
          const isLatest = i === 0;

          return (
            <div key={run.run_id} className="card p-0 overflow-hidden">
              <button
                onClick={() => toggle(run.run_id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-3/30 transition-colors text-left"
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center self-stretch">
                  <div className={clsx(
                    'w-3 h-3 rounded-full border-2 shrink-0',
                    isLatest ? 'bg-accent border-accent' : 'bg-surface-4 border-zinc-600'
                  )} />
                  {i < runs.length - 1 && <div className="w-px flex-1 bg-surface-4 mt-1" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-zinc-200">{run.run_id?.slice(0, 14)}</span>
                    {isLatest && <span className="badge-info">Latest</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtCST(run.finished)}
                    </span>
                    <span>{run.tables_loaded} tables</span>
                    <span>{totalRows.toLocaleString()} rows</span>
                    {totalChanged > 0 && <span className="text-accent">{totalChanged.toLocaleString()} changed</span>}
                    {totalDeleted > 0 && <span className="text-red-400">{totalDeleted.toLocaleString()} deleted</span>}
                  </div>
                </div>

                {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
              </button>

              {/* Expanded table details */}
              {isOpen && (
                <div className="border-t border-surface-4 bg-surface-1">
                  {!tables ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-5 h-5 text-accent animate-spin" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="table-header">Table</th>
                            <th className="table-header text-right">Snapshot Rows</th>
                            <th className="table-header text-right">Changed</th>
                            <th className="table-header text-right">Deleted</th>
                            <th className="table-header">Finished</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tables.map(t => (
                            <tr key={t.table_name} className="hover:bg-surface-3/30 transition-colors">
                              <td className="table-cell font-mono">
                                <span className="inline-flex items-center gap-2">
                                  <Table2 className="w-3.5 h-3.5 text-zinc-500" />
                                  {t.table_name}
                                </span>
                              </td>
                              <td className="table-cell text-right">{parseInt(t.rows_in_snapshot).toLocaleString()}</td>
                              <td className={clsx('table-cell text-right', parseInt(t.changed_rows) > 0 && 'text-accent')}>
                                {parseInt(t.changed_rows).toLocaleString()}
                              </td>
                              <td className={clsx('table-cell text-right', parseInt(t.deleted_rows) > 0 && 'text-red-400')}>
                                {parseInt(t.deleted_rows).toLocaleString()}
                              </td>
                              <td className="table-cell text-zinc-500">{fmtCST(t.finished_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
