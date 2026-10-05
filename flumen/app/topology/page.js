'use client';

import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { Server, Database, Laptop, ArrowRight, Loader2, HardDrive, Container } from 'lucide-react';

function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export default function Topology() {
  const [topo, setTopo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/topology').then(d => { setTopo(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );

  const { ads, laptop, pg } = topo?.nodes || {};

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Topology</h1>
        <p className="text-sm text-zinc-500 mt-1">Infrastructure overview &amp; data flow</p>
      </div>

      {/* Flow diagram */}
      <div className="card">
        <div className="flex items-center justify-center gap-6 py-8 flex-wrap">
          {/* ADS Node */}
          <NodeCard
            icon={Server}
            color="blue"
            label={ads?.label || 'ADS SQL Server'}
            host={ads?.host}
            details={[`DB: ${ads?.db}`, 'Read-only access', 'Windows Auth (SSPI)']}
          />

          {/* Arrow: ADS → Laptop */}
          <FlowArrow label="pull.ps1" sub="Batched SELECT" />

          {/* Laptop Node */}
          <NodeCard
            icon={Laptop}
            color="zinc"
            label={laptop?.label || 'Laptop'}
            host={laptop?.host}
            details={['ETL orchestrator', 'Gzipped CSV staging', 'Scheduled hourly']}
          />

          {/* Arrow: Laptop → PG */}
          <FlowArrow label="push.ps1" sub="SCP + Docker" />

          {/* PostgreSQL Node */}
          <NodeCard
            icon={Database}
            color="indigo"
            label={pg?.label || 'PostgreSQL'}
            host={pg?.host}
            details={[
              `DB: ${pg?.db}`,
              `Port: ${pg?.port}`,
              `Tables: ${pg?.tables?.length || 0}`,
            ]}
          />
        </div>
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ADS tables */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <h3 className="text-sm font-medium text-zinc-300">Source (MSSQL)</h3>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 mb-3">
              {ads?.db} on {ads?.host}
            </div>
            {(pg?.tables || []).map(t => (
              <div key={t.table_name} className="flex items-center gap-2 py-1.5 px-2 rounded bg-surface-3/50">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="font-mono text-xs text-zinc-300 truncate">{t.table_name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Docker containers */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Container className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-300">Containers on 0003</h3>
          </div>
          <div className="space-y-3">
            {(pg?.containers || []).length === 0 ? (
              <p className="text-xs text-zinc-500">No CampusCE containers running</p>
            ) : pg.containers.map((c, i) => (
              <div key={i} className="p-3 rounded-lg bg-surface-3/50 border border-surface-4">
                <p className="font-mono text-sm text-zinc-200">{c.name}</p>
                <p className="text-xs text-zinc-500 mt-1">{c.status}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{c.image}</p>
              </div>
            ))}
            {pg?.disk && (
              <div className="pt-3 mt-3 border-t border-surface-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-500">Disk usage</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-surface-4 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: pg.disk.pct }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">{pg.disk.pct}</span>
                </div>
                <p className="text-xs text-zinc-600 mt-1">{pg.disk.used} used of {pg.disk.total}</p>
              </div>
            )}
          </div>
        </div>

        {/* PG tables */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <h3 className="text-sm font-medium text-zinc-300">Target (PostgreSQL)</h3>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 mb-3">
              {pg?.db} on {pg?.host}:{pg?.port}
            </div>
            {(pg?.tables || []).map(t => (
              <div key={t.table_name} className="flex items-center justify-between py-1.5 px-2 rounded bg-surface-3/50">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="font-mono text-xs text-zinc-300 truncate">{t.table_name}</span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                  {fmtBytes(parseInt(t.size_bytes || 0))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NodeCard({ icon: Icon, color, label, host, details }) {
  const colorMap = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    indigo: 'border-accent/30 bg-accent/5',
    zinc: 'border-zinc-600/30 bg-surface-3/50',
  };
  const iconColor = {
    blue: 'text-blue-400',
    indigo: 'text-accent',
    zinc: 'text-zinc-400',
  };

  return (
    <div className={`card-sm w-56 border ${colorMap[color]}`}>
      <div className="flex items-center gap-3 mb-3">
        <Icon className={`w-6 h-6 ${iconColor[color]}`} />
        <div>
          <p className="text-sm font-medium text-zinc-200">{label}</p>
          <p className="text-xs text-zinc-500 font-mono">{host}</p>
        </div>
      </div>
      <div className="space-y-1">
        {details.map((d, i) => (
          <p key={i} className="text-xs text-zinc-500">{d}</p>
        ))}
      </div>
    </div>
  );
}

function FlowArrow({ label, sub }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <div className="flex items-center gap-1">
        <div className="w-8 h-px bg-zinc-700" />
        <div className="flow-dot w-2 h-2 rounded-full bg-accent" />
        <div className="flow-dot w-2 h-2 rounded-full bg-accent" style={{ animationDelay: '0.4s' }} />
        <div className="flow-dot w-2 h-2 rounded-full bg-accent" style={{ animationDelay: '0.8s' }} />
        <ArrowRight className="w-4 h-4 text-zinc-500" />
      </div>
      <p className="text-[10px] font-mono text-zinc-500">{label}</p>
      <p className="text-[9px] text-zinc-600">{sub}</p>
    </div>
  );
}
