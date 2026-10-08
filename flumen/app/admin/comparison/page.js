'use client';

import { useEffect, useState, useCallback } from 'react';
import { get } from '@/lib/api';
import {
  ArrowLeftRight, Loader2, CheckCircle2, AlertTriangle, Plus, Minus, Equal
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

export default function Comparison() {
  const [runs, setRuns] = useState([]);
  const [runA, setRunA] = useState('');
  const [runB, setRunB] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    get('/comparison').then(d => {
      setRuns(d.runs || []);
      if (d.runs?.length >= 2) {
        setRunA(d.runs[1].run_id);
        setRunB(d.runs[0].run_id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const compare = useCallback(async () => {
    if (!runA || !runB) return;
    setComparing(true);
    try {
      const d = await get(`/comparison?runA=${encodeURIComponent(runA)}&runB=${encodeURIComponent(runB)}`);
      setResult(d);
    } finally {
      setComparing(false);
    }
  }, [runA, runB]);

  useEffect(() => { if (runA && runB) compare(); }, [runA, runB, compare]);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );

  const chartData = (result?.tables || [])
    .filter(t => t.status !== 'same')
    .map(t => ({
      table: t.table_name?.slice(0, 20),
      'Rows A': parseInt(t.rows_a || 0),
      'Rows B': parseInt(t.rows_b || 0),
      'Changed A': parseInt(t.changed_a || 0),
      'Changed B': parseInt(t.changed_b || 0),
    }));

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Comparison</h1>
        <p className="text-sm text-zinc-500 mt-1">Side-by-side run analysis</p>
      </div>

      {/* Run selectors */}
      <div className="card flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-zinc-500 block mb-1.5">Run A (older)</label>
          <select
            value={runA}
            onChange={e => setRunA(e.target.value)}
            className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-200
                       focus:outline-none focus:border-accent/50"
          >
            <option value="">Select run…</option>
            {runs.map(r => (
              <option key={r.run_id} value={r.run_id}>
                {r.run_id?.slice(0, 14)} — {r.tables} tables — {new Date(r.finished).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        <ArrowLeftRight className="w-5 h-5 text-zinc-600 shrink-0 mt-5" />

        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-zinc-500 block mb-1.5">Run B (newer)</label>
          <select
            value={runB}
            onChange={e => setRunB(e.target.value)}
            className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-zinc-200
                       focus:outline-none focus:border-accent/50"
          >
            <option value="">Select run…</option>
            {runs.map(r => (
              <option key={r.run_id} value={r.run_id}>
                {r.run_id?.slice(0, 14)} — {r.tables} tables — {new Date(r.finished).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {comparing && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      )}

      {result && !comparing && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard icon={Equal} color="emerald" label="Identical" count={result.summary?.same} />
            <SummaryCard icon={AlertTriangle} color="amber" label="Different" count={result.summary?.different} />
            <SummaryCard icon={Plus} color="blue" label="Added" count={result.summary?.added} />
            <SummaryCard icon={Minus} color="red" label="Removed" count={result.summary?.removed} />
          </div>

          {/* Delta chart */}
          {chartData.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">Row Counts (changed tables only)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} />
                    <YAxis dataKey="table" type="category" tick={{ fill: '#71717a', fontSize: 10 }} width={140} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#a1a1aa' }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
                    <Bar dataKey="Rows A" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Rows B" fill="#818cf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-table breakdown */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-4">
              <h3 className="text-sm font-medium text-zinc-300">Per-Table Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Table</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Rows (A)</th>
                    <th className="table-header text-right">Rows (B)</th>
                    <th className="table-header text-right">Changed (A)</th>
                    <th className="table-header text-right">Changed (B)</th>
                    <th className="table-header text-right">Deleted (A)</th>
                    <th className="table-header text-right">Deleted (B)</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.tables || []).map(t => (
                    <tr key={t.table_name} className="hover:bg-surface-3/40 transition-colors">
                      <td className="table-cell font-mono text-zinc-200">{t.table_name}</td>
                      <td className="table-cell">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="table-cell text-right">{(t.rows_a ?? '—').toLocaleString()}</td>
                      <td className="table-cell text-right">{(t.rows_b ?? '—').toLocaleString()}</td>
                      <td className="table-cell text-right">{(t.changed_a ?? '—').toLocaleString()}</td>
                      <td className="table-cell text-right">{(t.changed_b ?? '—').toLocaleString()}</td>
                      <td className="table-cell text-right">{(t.deleted_a ?? '—').toLocaleString()}</td>
                      <td className="table-cell text-right">{(t.deleted_b ?? '—').toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, color, label, count }) {
  const styles = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    blue: 'bg-blue-500/10 text-blue-400',
    red: 'bg-red-500/10 text-red-400',
  };
  return (
    <div className="card-sm flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${styles[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="metric-value">{count ?? 0}</p>
        <p className="metric-label">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    same: { cls: 'badge-ok', label: 'Same' },
    different: { cls: 'badge-warn', label: 'Different' },
    added_in_b: { cls: 'badge-info', label: 'Added' },
    removed_in_b: { cls: 'badge-err', label: 'Removed' },
  };
  const s = map[status] || { cls: 'badge-info', label: status };
  return <span className={s.cls}>{s.label}</span>;
}
