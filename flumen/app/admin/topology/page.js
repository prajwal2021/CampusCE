'use client';

import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import {
  Server, Database, Laptop, ArrowRight, Loader2, HardDrive,
  Container, ChevronDown, Filter
} from 'lucide-react';
import clsx from 'clsx';

function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export default function Topology() {
  const [topo, setTopo] = useState(null);
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState('CampusCE_ADS_DB');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      get('/topology'),
      get('/databases'),
    ]).then(([t, d]) => {
      setTopo(t);
      setDatabases(d.databases || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );

  const { ads, laptop, pg } = topo?.nodes || {};
  const isCampusCE = selectedDb === 'CampusCE_ADS_DB';
  const selectedDbInfo = databases.find(d => d.name === selectedDb);

  return (
    <div className="p-6 space-y-6 ">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Topology</h1>
          <p className="text-sm text-zinc-500 mt-1">Infrastructure overview &amp; data flow</p>
        </div>

        {/* DB Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500" />
          <div className="relative">
            <select
              value={selectedDb}
              onChange={e => setSelectedDb(e.target.value)}
              className="appearance-none bg-surface-2 border border-surface-4 rounded-lg px-3 py-2 pr-8
                         text-sm text-zinc-200 focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              {databases.map(db => (
                <option key={db.name} value={db.name}>{db.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Flow diagram */}
      <div className="card">
        <div className="flex items-center justify-center gap-6 py-8 flex-wrap">
          {isCampusCE && (
            <>
              <NodeCard
                icon={Server}
                color="blue"
                label={ads?.label || 'ADS SQL Server'}
                host={ads?.host}
                details={[`DB: ${ads?.db}`, 'Read-only access', 'Windows Auth (SSPI)']}
              />
              <FlowArrow label="pull.ps1" sub="Batched SELECT" />
              <NodeCard
                icon={Laptop}
                color="zinc"
                label={laptop?.label || 'Laptop'}
                host={laptop?.host}
                details={['ETL orchestrator', 'Gzipped CSV staging', 'Scheduled hourly']}
              />
              <FlowArrow label="push.ps1" sub="SCP + Docker" />
            </>
          )}

          <NodeCard
            icon={Database}
            color="indigo"
            label="PostgreSQL"
            host={pg?.host}
            details={[
              `DB: ${selectedDb}`,
              `Port: ${pg?.port}`,
              isCampusCE
                ? `Tables: ${pg?.tables?.length || 0}`
                : `Size: ${fmtBytes(parseInt(selectedDbInfo?.size_bytes || 0))}`,
            ]}
          />
        </div>
        {!isCampusCE && (
          <div className="text-center pb-4 text-xs text-zinc-500">
            Pipeline only replicates CampusCE_ADS_DB. This database is hosted on the same server.
          </div>
        )}
      </div>

      {/* Detail panels */}
      <div className={clsx('grid gap-4', isCampusCE ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2')}>
        {/* Source (only for CampusCE) */}
        {isCampusCE && (
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
        )}

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
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: pg.disk.pct }} />
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">{pg.disk.pct}</span>
                </div>
                <p className="text-xs text-zinc-600 mt-1">{pg.disk.used} used of {pg.disk.total}</p>
              </div>
            )}
          </div>
        </div>

        {/* Target tables */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <h3 className="text-sm font-medium text-zinc-300">
              {isCampusCE ? 'Target (PostgreSQL)' : selectedDb}
            </h3>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 mb-3">
              {selectedDb} on {pg?.host}:{pg?.port}
            </div>
            {isCampusCE ? (
              (pg?.tables || []).map(t => (
                <div key={t.table_name} className="flex items-center justify-between py-1.5 px-2 rounded bg-surface-3/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span className="font-mono text-xs text-zinc-300 truncate">{t.table_name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                    {fmtBytes(parseInt(t.size_bytes || 0))}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-4 rounded-lg bg-surface-3/30 text-center">
                <Database className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">{selectedDb}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {fmtBytes(parseInt(selectedDbInfo?.size_bytes || 0))}
                  {selectedDbInfo?.table_count > 0 && ` · ${selectedDbInfo.table_count} tables`}
                </p>
                <p className="text-[10px] text-zinc-600 mt-2">
                  Select CampusCE_ADS_DB to see replicated tables
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* All databases overview */}
      <div className="card">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">All Databases on 0003</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {databases.map(db => (
            <button
              key={db.name}
              onClick={() => setSelectedDb(db.name)}
              className={clsx(
                'p-3 rounded-lg border text-left transition-all',
                selectedDb === db.name
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-surface-4 bg-surface-3/30 hover:border-surface-4 hover:bg-surface-3/60'
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Database className={clsx('w-3.5 h-3.5', selectedDb === db.name ? 'text-accent' : 'text-zinc-500')} />
                <span className={clsx('text-xs font-medium truncate', selectedDb === db.name ? 'text-accent' : 'text-zinc-300')}>
                  {db.name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span>{fmtBytes(parseInt(db.size_bytes || 0))}</span>
                {db.table_count > 0 && <span>· {db.table_count} tables</span>}
              </div>
            </button>
          ))}
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
