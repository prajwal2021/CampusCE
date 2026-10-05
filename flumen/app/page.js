'use client';

import { useEffect, useState, useCallback } from 'react';
import { get, post } from '@/lib/api';
import {
  Clock, Database, HardDrive, ArrowDownToLine, ArrowUpFromLine,
  RefreshCw, CheckCircle2, AlertCircle, Loader2, Server, X,
  AlertTriangle, Terminal, Copy, Package, Table2, Timer
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

function getNextPull(lastFinished, now) {
  if (!lastFinished) return { next: null, overdue: true, label: 'No runs yet' };
  const last = new Date(lastFinished);
  const eligible = new Date(last.getTime() + 8 * 3600000);
  let next = new Date(eligible);
  if (next.getMinutes() > 5 || (next.getMinutes() === 5 && next.getSeconds() > 0)) {
    next.setHours(next.getHours() + 1);
  }
  next.setMinutes(5, 0, 0);
  return { next, overdue: next <= now };
}

function getNextPush(now) {
  let next = new Date(now);
  if (next.getMinutes() >= 35) {
    next.setHours(next.getHours() + 1);
  }
  next.setMinutes(35, 0, 0);
  return { next, overdue: false };
}

function fmtCountdown(next, now) {
  if (!next) return '—';
  const diff = next - now;
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export default function Dashboard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());

  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [pushDiscovery, setPushDiscovery] = useState(null);
  const [pushResult, setPushResult] = useState(null);

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
  useEffect(() => { const iv = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(iv); }, []);

  const handlePull = async () => {
    setPulling(true);
    setPullResult(null);
    setPushResult(null);
    try {
      const res = await post('/actions/pull', {});
      setPullResult(res);
    } catch (e) {
      setPullResult({ status: 'error', message: e.message });
    } finally {
      setPulling(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setPushResult(null);
    setPullResult(null);
    try {
      const discovery = await get('/actions/load');
      setPushDiscovery(discovery);
      if (discovery.nothingToPush) {
        setPushResult({ success: true, message: 'Nothing to push. No pending runs found on 0003.', results: [] });
        return;
      }
      if (discovery.pending.length === 0) {
        setPushResult({ success: true, message: 'All inbox runs are already loaded.', results: [] });
        return;
      }
      const res = await post('/actions/load', {});
      setPushResult(res);
      refresh();
    } catch (e) {
      setPushResult({ success: false, message: e.message, results: [] });
    } finally {
      setPushing(false);
    }
  };

  const dismissPull = () => setPullResult(null);
  const dismissPush = () => { setPushResult(null); setPushDiscovery(null); };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );

  const pull = getNextPull(status?.lastRun?.finished, now);
  const push = getNextPush(now);

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

      {/* Connection error */}
      {error && (
        <div className="card-sm flex items-center gap-3 border-red-500/30 bg-red-500/5">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {/* Pull result panel */}
      {pullResult && <PullPanel result={pullResult} onDismiss={dismissPull} />}

      {/* Push result panel */}
      {(pushResult || (pushing && pushDiscovery)) && (
        <PushPanel discovery={pushDiscovery} result={pushResult} loading={pushing} onDismiss={dismissPush} />
      )}

      {/* Schedule countdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ScheduleCard
          icon={ArrowDownToLine}
          label="Next Pull"
          schedule="Every 8h · :05"
          next={pull.next}
          overdue={pull.overdue}
          countdown={pull.next ? fmtCountdown(pull.next, now) : '—'}
          sub={pull.next ? fmtCST(pull.next.toISOString()) : 'No previous run'}
        />
        <ScheduleCard
          icon={ArrowUpFromLine}
          label="Next Push"
          schedule="Every 1h · :35"
          next={push.next}
          overdue={push.overdue}
          countdown={fmtCountdown(push.next, now)}
          sub={fmtCST(push.next.toISOString())}
        />
      </div>

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

/* ---- Schedule countdown card ---- */
function ScheduleCard({ icon: Icon, label, schedule, next, overdue, countdown, sub }) {
  return (
    <div className={`card-sm flex items-center gap-4 ${overdue ? 'border-amber-500/30 bg-amber-500/5' : 'border-surface-4'}`}>
      <div className={`p-2.5 rounded-lg ${overdue ? 'bg-amber-500/10' : 'bg-surface-3'}`}>
        <Icon className={`w-5 h-5 ${overdue ? 'text-amber-400' : 'text-zinc-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-500">{label}</p>
          <span className="text-[10px] text-zinc-600 font-mono">{schedule}</span>
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <p className={`text-xl font-semibold tabular-nums ${overdue ? 'text-amber-400' : 'text-zinc-100'}`}>
            {overdue ? 'OVERDUE' : countdown}
          </p>
          {overdue && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
              waiting for trigger
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-600 mt-0.5 truncate">{sub}</p>
      </div>
      <Timer className={`w-4 h-4 ${overdue ? 'text-amber-500/40' : 'text-zinc-700'}`} />
    </div>
  );
}

/* ---- Pull result panel ---- */
function PullPanel({ result, onDismiss }) {
  const isVPN = result.status === 'vpn_on';
  const isReady = result.status === 'ready';
  const isRecent = result.status === 'recent';
  const isError = result.status === 'error';
  const [copied, setCopied] = useState(false);

  const borderColor = isVPN || isError ? 'border-red-500/30' : isReady ? 'border-emerald-500/30' : 'border-amber-500/30';
  const bgColor = isVPN || isError ? 'bg-red-500/5' : isReady ? 'bg-emerald-500/5' : 'bg-amber-500/5';

  const handleCopy = () => {
    navigator.clipboard.writeText(result.pullCommand || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`card ${borderColor} ${bgColor} relative`}>
      <button onClick={onDismiss} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        {isVPN || isError ? <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" /> :
         isReady ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /> :
         <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200">
            {isVPN ? 'VPN Detected — Turn Off VPN' :
             isReady ? 'Ready to Pull' :
             isRecent ? 'Recent Sync' :
             'Pull Error'}
          </p>
          <p className="text-sm text-zinc-400 mt-1">{result.message}</p>
          {result.lastRun && (
            <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
              <span>Last: {result.lastRun.run_id?.slice(0, 14)}</span>
              <span>{fmtCST(result.lastRun.finished)}</span>
              <span>{fmtNum(result.lastRun.total_rows)} rows</span>
            </div>
          )}
          {!isVPN && !isError && result.pullCommand && (
            <div className="mt-3 p-3 bg-surface-0 rounded-lg border border-surface-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Run in PowerShell</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-accent break-all">{result.pullCommand}</code>
                <button onClick={handleCopy} className="btn-ghost p-1.5 shrink-0" title="Copy command">
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
          {result.pendingRuns?.length > 0 && (
            <p className="text-xs text-zinc-500 mt-2">
              {result.pendingRuns.length} run(s) in inbox waiting to be loaded — use Push after pulling.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Push result panel ---- */
function PushPanel({ discovery, result, loading, onDismiss }) {
  return (
    <div className={`card relative ${
      result?.success === false ? 'border-red-500/30 bg-red-500/5' :
      result?.success ? 'border-emerald-500/30 bg-emerald-500/5' :
      'border-accent/30 bg-accent/5'
    }`}>
      {!loading && <button onClick={onDismiss} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300">
        <X className="w-4 h-4" />
      </button>}
      <div className="flex items-start gap-3">
        {loading ? <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0 mt-0.5" /> :
         result?.success ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /> :
         <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200">
            {loading ? 'Pushing to PostgreSQL…' : result?.success ? 'Push Complete' : 'Push Failed'}
          </p>
          <p className="text-sm text-zinc-400 mt-1">{result?.message || (loading && discovery ? `Loading ${discovery.pending?.length || 0} pending run(s)…` : 'Discovering pending runs…')}</p>
          {loading && discovery?.pending?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {discovery.pending.map(r => (
                <div key={r.runId} className="flex items-center gap-2 text-xs text-zinc-400">
                  <Package className="w-3.5 h-3.5 text-accent" />
                  <span className="font-mono">{r.runId?.slice(0, 14)}</span>
                  <span>— {r.tables} tables, {fmtNum(r.totalRows)} rows</span>
                  <Loader2 className="w-3 h-3 animate-spin text-accent ml-auto" />
                </div>
              ))}
            </div>
          )}
          {result?.results?.length > 0 && result.results.map(run => (
            <div key={run.runId} className="mt-3">
              <p className="text-xs font-medium text-zinc-300 mb-1.5 font-mono">{run.runId?.slice(0, 14)}</p>
              {run.tableResults?.length > 0 && (
                <div className="space-y-1">
                  {run.tableResults.map(t => (
                    <div key={t.table} className="flex items-center gap-2 text-xs">
                      <Table2 className="w-3 h-3 text-zinc-500" />
                      <span className="font-mono text-zinc-300 w-44 truncate">{t.table}</span>
                      {t.status === 'loaded' && (
                        <span className="text-emerald-400">
                          {fmtNum(t.rows)} rows · {t.changed > 0 ? `${fmtNum(t.changed)} changed` : 'no changes'}{t.deleted > 0 ? ` · ${fmtNum(t.deleted)} deleted` : ''}
                        </span>
                      )}
                      {t.status === 'skipped' && <span className="text-zinc-500">already loaded</span>}
                      {t.status === 'failed' && <span className="text-red-400">{t.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
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
