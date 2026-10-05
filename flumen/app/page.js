'use client';

import { useEffect, useState, useCallback } from 'react';
import { get, post } from '@/lib/api';
import {
  Clock, Database, HardDrive, ArrowDownToLine, ArrowUpFromLine,
  RefreshCw, CheckCircle2, AlertCircle, Loader2, Server
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

function fmtCST(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago', hour12: true,
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtNum(n) {
  return (n ?? 0).toLocaleString();
}

export default function Dashboard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await get('/status');
      setStatus(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); const iv = setInterval(refresh, 30_000); return () => clearInterval(iv); }, [refresh]);

  const handlePull = async () => {
    setPulling(true);
    setActionMsg(null);
    try {
      setActionMsg({ type: 'info', text: 'Pull must be triggered from the laptop (pull.ps1). Use Task Scheduler or run manually.' });
    } finally {
      setPulling(false);
    }
  };
  const handlePush = async () => {
    setPushing(true);
    setActionMsg(null);
    try {
      const lastRun = status?.lastRun?.run_id;
      if (!lastRun) throw new Error('No run available to push');
      const res = await post('/actions/load', { runId: lastRun });
      setActionMsg({ type: res.success ? 'ok' : 'err', text: res.success ? `Run ${lastRun} loaded successfully` : `Load failed (exit ${res.exitCode})` });
      refresh();
    } catch (e) {
      setActionMsg({ type: 'err', text: e.message });
    } finally {
      setPushing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );

  const chartData = (status?.recentRuns || []).map(r => ({
    run: r.run_id?.slice(0, 8),
    rows: parseInt(r.total_rows || 0),
    changed: parseInt(r.changed || 0),
    deleted: parseInt(r.deleted || 0),
  })).reverse();

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Pipeline health &amp; status</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handlePull} disabled={pulling} className="btn-outline">
            {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
            Pull
          </button>
          <button onClick={handlePush} disabled={pushing} className="btn-primary">
            {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
            Push to 0003
          </button>
          <button onClick={refresh} className="btn-ghost">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alert */}
      {error && (
        <div className="card-sm flex items-center gap-3 border-red-500/30 bg-red-500/5">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}
      {actionMsg && (
        <div className={`card-sm flex items-center gap-3 ${
          actionMsg.type === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5' :
          actionMsg.type === 'err' ? 'border-red-500/30 bg-red-500/5' :
          'border-accent/30 bg-accent/5'
        }`}>
          {actionMsg.type === 'ok' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> :
           actionMsg.type === 'err' ? <AlertCircle className="w-5 h-5 text-red-400 shrink-0" /> :
           <RefreshCw className="w-5 h-5 text-accent shrink-0" />}
          <span className="text-sm">{actionMsg.text}</span>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Clock} label="Last Sync"
          value={fmtCST(status?.lastRun?.finished)}
          sub={status?.lastRun ? `Run ${status.lastRun.run_id?.slice(0, 8)}` : 'No runs yet'}
        />
        <MetricCard
          icon={Database} label="Tables"
          value={status?.totalTables ?? 0}
          sub={fmtBytes(status?.totalSizeBytes)}
        />
        <MetricCard
          icon={HardDrive} label="Total Rows"
          value={fmtNum(status?.lastRun?.total_rows)}
          sub={`${fmtNum(status?.lastRun?.changed)} changed`}
        />
        <MetricCard
          icon={Server} label="Docker"
          value={status?.dockerRunning ? 'Running' : 'Stopped'}
          sub={status?.dockerStatus || '—'}
          ok={status?.dockerRunning}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Rows per Run</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gRows" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="run" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }} />
                <Area type="monotone" dataKey="rows" stroke="#6366f1" fill="url(#gRows)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Changes per Run</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="run" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }} />
                <Bar dataKey="changed" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="deleted" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent runs table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-4">
          <h3 className="text-sm font-medium text-zinc-300">Recent Runs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Run ID</th>
                <th className="table-header">Finished (CST)</th>
                <th className="table-header text-right">Tables</th>
                <th className="table-header text-right">Rows</th>
                <th className="table-header text-right">Changed</th>
                <th className="table-header text-right">Deleted</th>
              </tr>
            </thead>
            <tbody>
              {(status?.recentRuns || []).map(r => (
                <tr key={r.run_id} className="hover:bg-surface-3/50 transition-colors">
                  <td className="table-cell font-mono text-accent">{r.run_id?.slice(0, 14)}</td>
                  <td className="table-cell">{fmtCST(r.finished)}</td>
                  <td className="table-cell text-right">{r.tables}</td>
                  <td className="table-cell text-right">{fmtNum(r.total_rows)}</td>
                  <td className="table-cell text-right">{fmtNum(r.changed)}</td>
                  <td className="table-cell text-right text-red-400">{fmtNum(r.deleted)}</td>
                </tr>
              ))}
              {(!status?.recentRuns || status.recentRuns.length === 0) && (
                <tr><td colSpan={6} className="table-cell text-center text-zinc-500">No runs recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, ok }) {
  return (
    <div className="card-sm flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${ok === false ? 'bg-red-500/10' : ok ? 'bg-emerald-500/10' : 'bg-surface-3'}`}>
        <Icon className={`w-5 h-5 ${ok === false ? 'text-red-400' : ok ? 'text-emerald-400' : 'text-zinc-400'}`} />
      </div>
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="metric-value mt-0.5">{value}</p>
        <p className="text-xs text-zinc-500 mt-1 truncate">{sub}</p>
      </div>
    </div>
  );
}
