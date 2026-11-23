'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  UserMinus, Percent, ShieldCheck, FlaskConical, Timer, Users, BarChart3, ListChecks, Search, Loader2, Plus, Trash2, Info,
} from 'lucide-react';
import { useFetch, Loading, ErrorBox, PageShell, PageHeader, fmtNum, fmtDate, fmtDateTime } from '@/components/portal';
import { ReportRegistry, useRegistry, ReportCard, TrendChart, Bars, ShareBars, Kpi, ExportMenu, fmtPeriod } from '@/components/charts';
import { FilterBar, useFilters, describe, Segmented, GRAIN_LABEL } from '@/components/filters';
import { useChartColors } from '@/components/theme';
import { downloadExcel, downloadPDF } from '@/lib/export';
import { get, post } from '@/lib/api';

const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'records', label: 'Drop records', icon: ListChecks },
  { key: 'tests', label: 'Test enrollments', icon: FlaskConical },
];
const pct = v => (v === null || v === undefined ? '—' : `${v}%`);
const pctFmt = v => (v === null || v === undefined ? '' : `${v}%`);
const when = v => (v ? fmtDateTime(v) : '—');

function ExportAll({ title, filters, dataAsOf }) {
  const reg = useRegistry();
  return (
    <ExportMenu label="Export all"
      onPDF={() => downloadPDF({ title, reports: reg.all(), filters, dataAsOf })}
      onExcel={() => downloadExcel({ title, sheets: reg.all(), filters, dataAsOf })} />
  );
}

/** Add or remove exclusions, then refresh the page's data. */
function useExclusionChange(onDone) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const change = async (body, okText) => {
    setBusy(true); setMsg(null);
    try {
      const r = await post('/portal/exclusions', body);
      setMsg({ ok: true, text: r.changed ? okText(r.changed) : 'Nothing changed: already in that state.' });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };
  return { busy, msg, change };
}

function Note({ msg }) {
  if (!msg) return null;
  return <p className={clsx('text-sm', msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-accent')}>{msg.text}</p>;
}

function Dashboard() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = TABS.find(t => t.key === sp.get('tab')) || TABS[0];
  const setTab = key => { const n = new URLSearchParams(sp.toString()); n.set('tab', key); router.replace(`${path}?${n}`, { scroll: false }); };

  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce(n => n + 1);
  const { f, set, query, scope } = useFilters();
  const { data: d, error, loading } = useFetch(`/portal/drops?${query}&v=${nonce}`);
  const label = describe(f, { programs: d?.programs || [], courses: d?.courses || [], scope });

  const header = (
    <PageHeader eyebrow="Insights" title="Drops & retention"
      description="Who drops, when and from which courses, with CampusCE's test enrollments kept out so they don't inflate the drop rate. Mark tests on the Test enrollments tab or straight from the drop records."
      actions={d && tab.key !== 'tests' && <ExportAll key={tab.key} title={`Drops: ${tab.label.toLowerCase()}`} filters={label} dataAsOf={d.data_as_of} />} />
  );

  return (
    <ReportRegistry key={tab.key}>
      <PageShell>
        {header}
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] border-b border-surface-4 -mx-1 px-1" role="tablist">
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab.key === t.key} onClick={() => setTab(t.key)}
              className={clsx('relative flex items-center gap-2 px-3.5 py-2.5 text-sm whitespace-nowrap transition-colors',
                tab.key === t.key ? 'text-zinc-100 font-semibold' : 'text-zinc-500 hover:text-zinc-200')}>
              <t.icon className={clsx('w-4 h-4', tab.key === t.key ? 'text-accent' : '')} />
              {t.label}
              {t.key === 'tests' && d && (d.excluded.users + d.excluded.enrollments > 0) && (
                <span className="ml-0.5 rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold text-zinc-400 tabular-nums">{d.excluded.users + d.excluded.enrollments}</span>
              )}
              <span className={clsx('absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-accent transition-opacity', tab.key === t.key ? 'opacity-100' : 'opacity-0')} />
            </button>
          ))}
        </div>

        {tab.key === 'tests' ? <TestsTab onChanged={refresh} /> : (<>
          <FilterBar f={f} set={set} programs={d?.programs || []} courses={d?.courses || []} />
          {error && <ErrorBox message={error} />}
          {!d && !error ? <Loading /> : d && (
            <div className={clsx('space-y-6', loading && 'opacity-60 transition-opacity')}>
              <TestBanner d={d} f={f} set={set} goTests={() => setTab('tests')} />
              {tab.key === 'overview'
                ? <Overview d={d} f={f} label={label} />
                : <Records d={d} f={f} label={label} onChanged={refresh} />}
              {d.data_as_of && (
                <p className="text-xs text-zinc-500">
                  Data as of {fmtDateTime(d.data_as_of)} CST. A drop is an enrollment deactivated in Canvas without being completed; its drop date is
                  when Canvas last updated it. Drop rates use the enrollments made in the date range and how many of them were dropped.
                </p>
              )}
            </div>
          )}
        </>)}
      </PageShell>
    </ReportRegistry>
  );
}

function TestBanner({ d, f, set, goTests }) {
  const k = d.kpis;
  const n = d.excluded.users + d.excluded.enrollments;
  return (
    <div className="card-sm flex flex-wrap items-center gap-x-4 gap-y-2 py-3 border-l-4 border-l-accent">
      <FlaskConical className="w-5 h-5 text-accent shrink-0" />
      <p className="text-sm text-zinc-300 flex-1 min-w-[260px]">
        {n === 0 ? (
          <>No test enrollments are marked yet. Mark CampusCE's test accounts so their drops stop counting against the drop rate.</>
        ) : f.tests ? (
          <>Test enrollments are <b>included</b> in the figures below. Without them the drop rate is <b>{pct(k.drop_rate)}</b> rather than {pct(k.drop_rate_with_tests)}.</>
        ) : (
          <>
            <b>{fmtNum(k.test_enrollments)}</b> test enrollment{k.test_enrollments === 1 ? '' : 's'} ({fmtNum(k.test_dropped)} dropped) {k.test_enrollments === 1 ? 'is' : 'are'} left out.
            {' '}Drop rate <b>{pct(k.drop_rate)}</b>{k.drop_rate !== k.drop_rate_with_tests && <> (it would be {pct(k.drop_rate_with_tests)} with them)</>}.
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        {n > 0 && <button className="btn-ghost text-sm" onClick={() => set({ tests: f.tests ? '' : 'include' })}>{f.tests ? 'Exclude tests' : 'Show with tests'}</button>}
        <button className="btn-primary text-sm" onClick={goTests}>Manage test enrollments</button>
      </div>
    </div>
  );
}

function Overview({ d, f, label }) {
  const c = useChartColors();
  const k = d.kpis;
  const [showTests, setShowTests] = useState(true);
  const grainName = GRAIN_LABEL[f.grain].toLowerCase();
  const periodCol = { key: 'period', label: 'Period', fmt: v => fmtPeriod(v, f.grain, true) };
  const testGrey = c.axis;
  const hasTestDrops = d.trend.some(r => r.test_drops > 0);

  return (<>
    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
      <Kpi label="Drops" icon={UserMinus} value={fmtNum(k.shown.dropped)} sub={`${fmtNum(k.students_dropped)} students · of ${fmtNum(k.shown.enrollments)} enrollments`} />
      <Kpi label="Drop rate" icon={Percent} value={pct(k.shown.drop_rate)}
        sub={f.tests ? `${pct(k.drop_rate)} without test enrollments` : (k.test_enrollments ? `${pct(k.drop_rate_with_tests)} if tests were counted` : 'No test enrollments in these filters')} />
      <Kpi label="Retention" icon={ShieldCheck} value={pct(k.retention_rate)} sub={`${fmtNum(k.active)} in progress · ${fmtNum(k.completed)} completed`} />
      <Kpi label="Test enrollments excluded" icon={FlaskConical} value={fmtNum(k.test_enrollments)} sub={`${fmtNum(k.test_dropped)} of them dropped`} />
      <Kpi label="Median time to drop" icon={Timer} value={k.median_days === null ? '—' : `${k.median_days} d`} sub="From enrolling to being dropped" />
      <Kpi label="Students who dropped" icon={Users} value={fmtNum(k.students_dropped)} sub="Dropped at least one course" />
    </div>

    <ReportCard title="Drops over time" filters={label} dataAsOf={d.data_as_of}
      subtitle={`Drops by the date they happened, ${grainName}${showTests && hasTestDrops ? '; test drops in grey' : ''}`}
      right={hasTestDrops && <div className="hidden md:flex" data-no-export>
        <Segmented value={showTests ? 'y' : 'n'} onChange={v => setShowTests(v === 'y')} options={[{ value: 'y', label: 'Show test drops' }, { value: 'n', label: 'Real only' }]} />
      </div>}
      table={{ columns: [periodCol, { key: 'drops', label: 'Drops', num: true }, { key: 'test_drops', label: 'Test drops (excluded)', num: true }, { key: 'cumulative', label: 'Running total', num: true }], rows: d.trend }}>
      <TrendChart data={d.trend} grain={f.grain} kind="bar" stacked height={320}
        series={showTests && hasTestDrops
          ? [{ key: 'drops', label: 'Drops', slot: 0 }, { key: 'test_drops', label: 'Test drops (excluded)', color: testGrey }]
          : [{ key: 'drops', label: 'Drops', slot: 0 }]} />
    </ReportCard>

    <ReportCard title="Drop rate by enrollment cohort" filters={label} dataAsOf={d.data_as_of}
      subtitle={`Share of each ${f.grain}'s new enrollments that were later dropped, with and without test enrollments`}
      table={{ columns: [periodCol, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'dropped', label: 'Dropped', num: true },
        { key: 'drop_rate', label: 'Drop rate', num: true, fmt: pctFmt }, { key: 'drop_rate_with_tests', label: 'Drop rate with tests', num: true, fmt: pctFmt }], rows: d.cohort }}>
      <TrendChart data={d.cohort} grain={f.grain} kind="line" height={300} valueFmt={pctFmt}
        series={[{ key: 'drop_rate', label: 'Drop rate', slot: 0 }, { key: 'drop_rate_with_tests', label: 'With test enrollments', color: testGrey }]} />
    </ReportCard>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ReportCard title="Drop rate by program" subtitle="Dropped enrollments as a share of each program's enrollments" filters={label} dataAsOf={d.data_as_of}
        table={{ columns: [{ key: 'label', label: 'Program' }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'dropped', label: 'Dropped', num: true },
          { key: 'drop_rate', label: 'Drop rate', num: true, fmt: pctFmt }, { key: 'test_enrollments', label: 'Test enrollments', num: true }, { key: 'test_dropped', label: 'Test drops', num: true }], rows: d.by_program }}>
        <Bars data={d.by_program} horizontal catWidth={210} labels valueFmt={pctFmt} series={[{ key: 'drop_rate', label: 'Drop rate', slot: 0 }]} />
      </ReportCard>
      <ReportCard title="How long before dropping" subtitle="Days between enrolling and being dropped (test enrollments left out)" filters={label} dataAsOf={d.data_as_of}
        table={{ columns: [{ key: 'label', label: 'Time enrolled' }, { key: 'value', label: 'Drops', num: true }], rows: d.time_to_drop }}>
        <Bars data={d.time_to_drop} labels height={280} series={[{ key: 'value', label: 'Drops', slot: 0 }]} />
      </ReportCard>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <ReportCard className="xl:col-span-2" title="Courses with the most drops" subtitle="Top 15; test drops stacked in grey" filters={label} dataAsOf={d.data_as_of}
        table={{ columns: [
          { key: 'name', label: 'Course', link: { key: 'id', href: r => `/course/${r.id}` } }, { key: 'sku', label: 'SKU' },
          { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'dropped', label: 'Dropped', num: true },
          { key: 'drop_rate', label: 'Drop rate', num: true, fmt: pctFmt }, { key: 'test_dropped', label: 'Test drops', num: true },
        ], rows: d.by_course }}>
        <Bars data={d.by_course} category="name" horizontal catWidth={320} stacked
          series={[{ key: 'dropped', label: 'Drops', slot: 0 }, { key: 'test_dropped', label: 'Test drops (excluded)', color: testGrey }]} />
      </ReportCard>
      <ReportCard title="Engagement before dropping" subtitle="What dropped students had done in the course" filters={label} dataAsOf={d.data_as_of} minH={220}
        table={{ columns: [{ key: 'label', label: 'Before dropping' }, { key: 'value', label: 'Drops', num: true }], rows: d.engagement }}>
        <div className="pt-2"><ShareBars items={d.engagement} colors={[c.series[0], c.series[3], c.series[1]]} /></div>
      </ReportCard>
    </div>
  </>);
}

/** Every drop in the date range, tests flagged, with actions to mark or unmark them. */
function Records({ d, f, label, onChanged }) {
  const [show, setShow] = useState('all');
  const [term, setTerm] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [reason, setReason] = useState('');
  const { busy, msg, change } = useExclusionChange(() => { setSel(new Set()); onChanged(); });

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return d.records.filter(r => (show === 'all' || (show === 'test') === r.is_test)
      && (!t || [r.student, r.ce_number, r.course, r.sku].some(v => v && String(v).toLowerCase().includes(t))));
  }, [d.records, show, term]);
  const counts = { all: d.records.length, real: d.records.filter(r => !r.is_test).length, test: d.records.filter(r => r.is_test).length };
  const picked = d.records.filter(r => sel.has(r.id));
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every(r => sel.has(r.id));

  const table = {
    columns: [
      { key: 'student', label: 'Student' }, { key: 'ce_number', label: 'CampusCE #' }, { key: 'course', label: 'Course' }, { key: 'sku', label: 'SKU' },
      { key: 'program', label: 'Program' }, { key: 'enrolled', label: 'Enrolled', fmt: when }, { key: 'dropped_at', label: 'Dropped', fmt: when },
      { key: 'days_enrolled', label: 'Days enrolled', num: true }, { key: 'last_activity', label: 'Last activity', fmt: when },
      { key: 'is_test', label: 'Test enrollment', fmt: v => (v ? 'Yes' : 'No') },
    ],
    rows,
  };
  const title = `Drop records${show === 'real' ? ' (real drops)' : show === 'test' ? ' (test enrollments)' : ''}`;

  return (
    <section className="card p-0">
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <h3 className="section-title">Drop records</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Each enrollment dropped in the date range, newest first. Tick rows to mark them as tests.</p>
        </div>
        <Segmented value={show} onChange={setShow} options={[
          { value: 'all', label: `All ${fmtNum(counts.all)}` }, { value: 'real', label: `Real ${fmtNum(counts.real)}` }, { value: 'test', label: `Tests ${fmtNum(counts.test)}` }]} />
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className="select pl-8 w-full sm:w-56" placeholder="Student, CE #, course, SKU" value={term} onChange={e => setTerm(e.target.value)} />
        </div>
        <ExportMenu compact
          onPDF={() => downloadPDF({ title, reports: [{ title, table }], filters: label, dataAsOf: d.data_as_of })}
          onExcel={() => downloadExcel({ title, sheets: [{ title, table }], filters: label, dataAsOf: d.data_as_of })} />
      </div>

      {picked.length > 0 && (
        <div className="mx-5 mb-3 rounded-lg border border-surface-4 bg-surface-1 px-3 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">{picked.length} selected</span>
          <input className="select flex-1 min-w-[180px]" placeholder="Reason (optional), e.g. store checkout test" value={reason} onChange={e => setReason(e.target.value)} />
          <button disabled={busy} className="btn-primary text-sm"
            onClick={() => change({ action: 'add', kind: 'enrollment', ids: picked.map(r => r.id), reason }, n => `${n} enrollment${n === 1 ? '' : 's'} marked as test.`)}>
            Mark enrollment{picked.length === 1 ? '' : 's'} as test
          </button>
          <button disabled={busy} className="btn-ghost text-sm" title="Every enrollment these people have, now and later, is treated as a test"
            onClick={() => change({ action: 'add', kind: 'user', ids: [...new Set(picked.map(r => r.user_id))], reason }, n => `${n} test account${n === 1 ? '' : 's'} added.`)}>
            Mark student{new Set(picked.map(r => r.user_id)).size === 1 ? '' : 's'} as test account
          </button>
          <button disabled={busy} className="btn-ghost text-sm"
            onClick={() => change({ action: 'remove', kind: 'enrollment', ids: picked.map(r => r.id) }, n => `${n} enrollment${n === 1 ? '' : 's'} counted again.`)}>
            Not a test
          </button>
          {busy && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
        </div>
      )}
      <div className="px-5"><Note msg={msg} /></div>

      <div className="table-scroll mx-3 mb-4 mt-1 rounded-lg border border-surface-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 text-left">
              <th className="px-3 py-2 w-8 bg-surface-1 border-b border-surface-4">
                <input type="checkbox" aria-label="Select all shown" checked={allOn}
                  onChange={() => setSel(s => { const n = new Set(s); rows.forEach(r => (allOn ? n.delete(r.id) : n.add(r.id))); return n; })} />
              </th>
              {['Student', 'CampusCE #', 'Course', 'Enrolled', 'Dropped', 'Days', 'Last activity', ''].map(h => (
                <th key={h} className={clsx('px-3 py-2 bg-surface-1 border-b border-surface-4 whitespace-nowrap', h === 'Days' && 'text-right')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-zinc-500">No drops for these filters.</td></tr>}
            {rows.slice(0, 1000).map(r => (
              <tr key={r.id} className={clsx('hover:bg-surface-3/50', r.is_test && 'text-zinc-500')}>
                <td className="px-3 py-2 border-b border-surface-3"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.student}`} /></td>
                <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap"><Link href={`/person/${r.user_id}`} className="font-medium text-zinc-100 hover:text-accent">{r.student}</Link></td>
                <td className="px-3 py-2 border-b border-surface-3 font-mono text-xs whitespace-nowrap">{r.ce_number || '—'}</td>
                <td className="px-3 py-2 border-b border-surface-3 max-w-[360px] truncate" title={r.course}>
                  <Link href={`/course/${r.course_id}`} className="hover:text-accent">{r.course}</Link>
                  {r.sku && <span className="ml-1.5 font-mono text-[11px] text-zinc-500">{r.sku}</span>}
                </td>
                <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap">{fmtDate(r.enrolled)}</td>
                <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap">{fmtDate(r.dropped_at)}</td>
                <td className="px-3 py-2 border-b border-surface-3 text-right tabular-nums">{r.days_enrolled ?? '—'}</td>
                <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap">{r.last_activity ? fmtDate(r.last_activity) : 'Never'}</td>
                <td className="px-3 py-2 border-b border-surface-3">
                  {r.is_test && <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-zinc-400"><FlaskConical className="w-3 h-3" />Test</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 1000 && <p className="px-5 pb-4 text-xs text-zinc-500">Showing the newest 1,000 of {fmtNum(rows.length)}; the export has them all.</p>}
    </section>
  );
}

/** Manage the test accounts and enrollments: suggestions, the current list, adding by search, and the history. */
function TestsTab({ onChanged }) {
  const [nonce, setNonce] = useState(0);
  const { data: x, error } = useFetch(`/portal/exclusions?v=${nonce}`);
  const done = () => { setNonce(n => n + 1); onChanged(); };
  const { busy, msg, change } = useExclusionChange(done);
  const [reason, setReason] = useState('');

  if (error) return <ErrorBox message={error} />;
  if (!x) return <Loading />;

  const addUser = (u, why) => change({ action: 'add', kind: 'user', ids: [u.id], reason: why || reason }, () => `${u.name} is now treated as a test account.`);
  const histTable = {
    columns: [
      { key: 'at', label: 'When', fmt: when }, { key: 'by', label: 'By' },
      { key: 'action', label: 'Change', fmt: (v, r) => `${v === 'add' ? 'Excluded' : 'Counted again'}: ${r.kind === 'user' ? 'account' : 'enrollment'}` },
      { key: 'name', label: 'Student' }, { key: 'course', label: 'Course' }, { key: 'reason', label: 'Reason' },
    ],
    rows: x.log,
  };

  return (
    <div className="space-y-6">
      <div className="card-sm flex gap-3 py-3 text-sm text-zinc-400">
        <Info className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
        <p>
          Anything listed here is left out of enrollments, drops, completion and the drop rate everywhere in the dashboard, its reports and exports.
          Mark a <b className="text-zinc-200">test account</b> when everything a login does is testing (all its enrollments, now and later), or mark single
          <b className="text-zinc-200"> enrollments</b> from the drop records. Use the <i>Test enrollments</i> filter on any page to see the figures with them.
          Every change is recorded below.
        </p>
      </div>
      <Note msg={msg} />

      <section className="card p-0">
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <h3 className="section-title">Likely test accounts</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Student accounts with “test” in the name or login that aren't excluded yet. Check each one before excluding it.</p>
          </div>
          <input className="select w-full sm:w-64" placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <PeopleTable rows={x.suggestions} empty="No likely test accounts left to review."
          cols={[['Why', r => r.why], ['Programs', r => r.programs], ['Latest enrollment', r => fmtDate(r.latest)]]}
          action={r => <button disabled={busy} onClick={() => addUser(r, reason || r.why)} className="btn-ghost text-sm"><Plus className="w-3.5 h-3.5" /> Exclude</button>} />
      </section>

      <PasteList busy={busy}
        onExclude={(ids, why) => change({ action: 'add', kind: 'user', ids, reason: why }, n => `${n} test account${n === 1 ? '' : 's'} excluded.`)} />

      <AddBySearch busy={busy} onAdd={u => addUser(u, reason || 'Added by search')} />

      <section className="card p-0">
        <div className="px-5 pt-4 pb-3">
          <h3 className="section-title">Test accounts ({x.users.length})</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Every enrollment these people have is left out.</p>
        </div>
        <PeopleTable rows={x.users.map(u => ({ ...u, ...(u.live || {}), id: u.id, name: u.live?.name || u.name, ce_number: u.live?.ce_number || u.ce }))}
          empty="No test accounts yet."
          cols={[['Reason', r => r.reason || '—'], ['Added', r => `${r.by || '—'}, ${fmtDate(r.at)}`]]}
          action={r => <button disabled={busy} className="btn-ghost text-sm"
            onClick={() => change({ action: 'remove', kind: 'user', ids: [r.id] }, () => `${r.name} counts again.`)}><Trash2 className="w-3.5 h-3.5" /> Remove</button>} />
      </section>

      <section className="card p-0">
        <div className="px-5 pt-4 pb-3">
          <h3 className="section-title">Single test enrollments ({x.enrollments.length})</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Marked from the drop records. The student's other enrollments still count.</p>
        </div>
        <div className="table-scroll mx-3 mb-4 rounded-lg border border-surface-3">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 text-left">
              {['Student', 'CampusCE #', 'Course', 'Status', 'Reason', 'Added', ''].map(h => <th key={h} className="px-3 py-2 bg-surface-1 border-b border-surface-4 whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {x.enrollments.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No single enrollments marked.</td></tr>}
              {x.enrollments.map(r => (
                <tr key={r.id} className="hover:bg-surface-3/50">
                  <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap">{r.live ? <Link href={`/person/${r.live.user_id}`} className="font-medium text-zinc-100 hover:text-accent">{r.live.student}</Link> : r.name}</td>
                  <td className="px-3 py-2 border-b border-surface-3 font-mono text-xs">{r.live?.ce_number || r.ce || '—'}</td>
                  <td className="px-3 py-2 border-b border-surface-3 max-w-[320px] truncate" title={r.live?.course || r.course}>{r.live?.course || r.course}</td>
                  <td className="px-3 py-2 border-b border-surface-3">{r.live?.status || 'Not in Canvas data'}</td>
                  <td className="px-3 py-2 border-b border-surface-3">{r.reason || '—'}</td>
                  <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap">{r.by || '—'}, {fmtDate(r.at)}</td>
                  <td className="px-3 py-2 border-b border-surface-3 text-right">
                    <button disabled={busy} className="btn-ghost text-sm" onClick={() => change({ action: 'remove', kind: 'enrollment', ids: [r.id] }, () => 'Enrollment counts again.')}><Trash2 className="w-3.5 h-3.5" /> Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-0">
        <div className="px-5 pt-4 pb-3 flex items-center gap-3">
          <div className="flex-1">
            <h3 className="section-title">Change history</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Who excluded or restored what, and why.</p>
          </div>
          <ExportMenu compact
            onPDF={() => downloadPDF({ title: 'Test enrollment changes', reports: [{ title: 'Test enrollment changes', table: histTable }] })}
            onExcel={() => downloadExcel({ title: 'Test enrollment changes', sheets: [{ title: 'Changes', table: histTable }] })} />
        </div>
        <div className="table-scroll mx-3 mb-4 rounded-lg border border-surface-3">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 text-left">
              {histTable.columns.map(c => <th key={c.key} className="px-3 py-2 bg-surface-1 border-b border-surface-4 whitespace-nowrap">{c.label}</th>)}
            </tr></thead>
            <tbody>
              {x.log.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-500">No changes yet.</td></tr>}
              {x.log.map((r, i) => (
                <tr key={i} className="hover:bg-surface-3/50">
                  {histTable.columns.map(c => <td key={c.key} className="px-3 py-2 border-b border-surface-3 whitespace-nowrap">{(c.fmt ? c.fmt(r[c.key], r) : r[c.key]) || '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PeopleTable({ rows, cols, action, empty }) {
  return (
    <div className="table-scroll mx-3 mb-4 rounded-lg border border-surface-3">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 text-left">
          {['Student', 'CampusCE #', 'Enrollments', 'Dropped', ...cols.map(c => c[0]), ''].map(h => (
            <th key={h} className={clsx('px-3 py-2 bg-surface-1 border-b border-surface-4 whitespace-nowrap', ['Enrollments', 'Dropped'].includes(h) && 'text-right')}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5 + cols.length} className="px-3 py-8 text-center text-zinc-500">{empty}</td></tr>}
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-surface-3/50">
              <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap"><Link href={`/person/${r.id}`} className="font-medium text-zinc-100 hover:text-accent">{r.name}</Link></td>
              <td className="px-3 py-2 border-b border-surface-3 font-mono text-xs">{r.ce_number || '—'}</td>
              <td className="px-3 py-2 border-b border-surface-3 text-right tabular-nums">{fmtNum(r.enrollments ?? 0)}</td>
              <td className="px-3 py-2 border-b border-surface-3 text-right tabular-nums">{fmtNum(r.dropped ?? 0)}</td>
              {cols.map(([h, fn]) => <td key={h} className="px-3 py-2 border-b border-surface-3 max-w-[280px] truncate">{fn(r)}</td>)}
              <td className="px-3 py-2 border-b border-surface-3 text-right">{action(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Paste a list from CampusCE (names, CE numbers or emails), check the matches, exclude them together. */
function PasteList({ busy, onExclude }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [looking, setLooking] = useState(false);
  const [err, setErr] = useState(null);

  const check = async () => {
    const lines = text.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setLooking(true); setErr(null);
    try {
      const r = await post('/portal/exclusions', { action: 'resolve', lines });
      setRes(r.results);
      // tick the clear matches: exactly one account for the line, not already excluded
      setSel(new Set(r.results.filter(x => x.matches.length === 1 && !x.matches[0].excluded).map(x => x.matches[0].id)));
    } catch (e) { setErr(e.message); } finally { setLooking(false); }
  };
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const missing = res ? res.filter(x => !x.matches.length).length : 0;

  return (
    <section className="card p-0">
      <div className="px-5 pt-4 pb-3">
        <h3 className="section-title">Exclude a list of test accounts</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Paste the accounts CampusCE uses for testing, one per line: CampusCE number (CE1234567), TTU email or login, or full name.
          Check the matches, then exclude them in one go.
        </p>
      </div>
      <div className="px-5 pb-4 space-y-3">
        <textarea className="select w-full min-h-[120px] font-mono text-xs" value={text} onChange={e => { setText(e.target.value); setRes(null); }}
          placeholder={'CE1002125\nbonnie.cordell+test@ttu.edu\nTest StudentOne'} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost text-sm" onClick={check} disabled={looking || !text.trim()}>
            {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Find accounts
          </button>
          {err && <span className="text-sm text-accent">{err}</span>}
        </div>

        {res && (<>
          <div className="table-scroll rounded-lg border border-surface-3">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 text-left">
                {['', 'You entered', 'Account', 'CampusCE #', 'Enrollments', 'Dropped'].map(h => (
                  <th key={h} className={clsx('px-3 py-2 bg-surface-1 border-b border-surface-4 whitespace-nowrap', ['Enrollments', 'Dropped'].includes(h) && 'text-right')}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {res.flatMap(x => (x.matches.length ? x.matches : [null]).map((m, i) => (
                  <tr key={`${x.input}-${m?.id || 'none'}`} className={clsx('hover:bg-surface-3/50', !m && 'text-zinc-500')}>
                    <td className="px-3 py-2 border-b border-surface-3 w-8">
                      {m && !m.excluded && <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Exclude ${m.name}`} />}
                    </td>
                    <td className="px-3 py-2 border-b border-surface-3 font-mono text-xs whitespace-nowrap">{i === 0 ? x.input : ''}</td>
                    <td className="px-3 py-2 border-b border-surface-3 whitespace-nowrap">
                      {m ? <>
                        <Link href={`/person/${m.id}`} className="font-medium text-zinc-100 hover:text-accent">{m.name}</Link>
                        {m.excluded && <span className="ml-2 text-xs text-zinc-500">already excluded</span>}
                        {x.matches.length > 1 && i === 0 && <span className="ml-2 text-xs text-accent">{x.matches.length} accounts match; pick the right one</span>}
                      </> : 'No Canvas account found'}
                    </td>
                    <td className="px-3 py-2 border-b border-surface-3 font-mono text-xs">{m?.ce_number || (m ? '—' : '')}</td>
                    <td className="px-3 py-2 border-b border-surface-3 text-right tabular-nums">{m ? fmtNum(m.enrollments) : ''}</td>
                    <td className="px-3 py-2 border-b border-surface-3 text-right tabular-nums">{m ? fmtNum(m.dropped) : ''}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          {missing > 0 && <p className="text-xs text-zinc-500">{missing} line{missing === 1 ? '' : 's'} matched no account. Check the spelling, or try the CampusCE number.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input className="select flex-1 min-w-[200px]" placeholder="Reason, e.g. CampusCE test logins (list from Bonnie, Nov 23)" value={reason} onChange={e => setReason(e.target.value)} />
            <button className="btn-primary text-sm" disabled={busy || !sel.size}
              onClick={() => { onExclude([...sel], reason || 'Test account list from CampusCE'); setSel(new Set()); setRes(null); setText(''); }}>
              Exclude {sel.size} account{sel.size === 1 ? '' : 's'}
            </button>
          </div>
        </>)}
      </div>
    </section>
  );
}

function AddBySearch({ busy, onAdd }) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState(null);
  const [looking, setLooking] = useState(false);
  const search = async e => {
    e.preventDefault();
    if (term.trim().length < 2) return;
    setLooking(true);
    try { setFound((await get(`/portal/search?q=${encodeURIComponent(term.trim())}`)).people || []); }
    catch { setFound([]); } finally { setLooking(false); }
  };
  return (
    <section className="card p-0">
      <form onSubmit={search} className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <h3 className="section-title">Add a test account</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Find a login by name or CampusCE number.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className="select pl-8 w-64" placeholder="Name or CE number" value={term} onChange={e => setTerm(e.target.value)} />
        </div>
        <button className="btn-ghost text-sm" type="submit">{looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}</button>
      </form>
      {found && (
        <ul className="mx-5 mb-4 divide-y divide-surface-3 rounded-lg border border-surface-3">
          {found.length === 0 && <li className="px-3 py-3 text-sm text-zinc-500">No one found.</li>}
          {found.map(p => (
            <li key={p.id} className="px-3 py-2 flex items-center gap-3 text-sm">
              <Link href={`/person/${p.id}`} className="font-medium text-zinc-100 hover:text-accent">{p.name}</Link>
              {p.ce_number && <span className="font-mono text-xs text-zinc-500">{p.ce_number}</span>}
              {p.roles && <span className="text-xs text-zinc-500">{p.roles}</span>}
              <button disabled={busy} className="ml-auto btn-ghost text-sm" onClick={() => onAdd(p)}><Plus className="w-3.5 h-3.5" /> Exclude</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DropsPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
