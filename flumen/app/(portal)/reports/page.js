'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { TrendingUp, CheckCircle2, ArrowLeftRight, Layers, Activity, GraduationCap, Info } from 'lucide-react';
import { useFetch, Loading, ErrorBox, PageShell, PageHeader, fmtNum, fmtDateTime } from '@/components/portal';
import { ReportRegistry, useRegistry, ReportCard, TrendChart, Bars, ShareBars, Kpi, Delta, ExportMenu, fmtPeriod, pctChange } from '@/components/charts';
import { FilterBar, useFilters, describe, GRAIN_LABEL } from '@/components/filters';
import { useChartColors } from '@/components/theme';
import { downloadExcel, downloadPDF } from '@/lib/export';

const TABS = [
  { key: 'trends', label: 'Trends', icon: TrendingUp, blurb: 'Enrollments, completions and new students over time.' },
  { key: 'completion', label: 'Completion', icon: CheckCircle2, blurb: 'Completion rates, assignment progress and grades.' },
  { key: 'comparison', label: 'Comparison', icon: ArrowLeftRight, blurb: 'This period against the previous one, or the same period last year.' },
  { key: 'programs', label: 'Programs & courses', icon: Layers, blurb: 'How programs, courses and instructors compare.' },
  { key: 'engagement', label: 'Engagement', icon: Activity, blurb: 'How active enrolled students are.' },
  { key: 'cla', label: 'Career Learning Academy', icon: GraduationCap, blurb: 'Free and paid courses, tracks and conversions.' },
];

const pct = v => (v === null || v === undefined ? '—' : `${v}%`);
const pctFmt = v => (v === null || v === undefined ? '' : `${v}%`);

function ExportTab({ title, filters, dataAsOf }) {
  const reg = useRegistry();
  return (
    <ExportMenu label="Export all"
      onPDF={() => downloadPDF({ title, reports: reg.all(), filters, dataAsOf })}
      onExcel={() => downloadExcel({ title, sheets: reg.all(), filters, dataAsOf })} />
  );
}

function Reports() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = TABS.find(t => t.key === sp.get('tab')) || TABS[0];
  const setTab = key => { const n = new URLSearchParams(sp.toString()); n.set('tab', key); router.replace(`${path}?${n}`, { scroll: false }); };

  const { f, set, query, scope } = useFilters();
  const en = useFetch(`/portal/enrollments?${query}`);
  const rp = useFetch(`/portal/reports?${query}`);

  const programs = en.data?.programs || [];
  const courses = en.data?.courses || [];
  const label = describe(f, { programs, courses, scope });
  const asOf = en.data?.data_as_of;

  return (
    <ReportRegistry key={tab.key}>
    <PageShell>
      <PageHeader eyebrow="Insights" title="Reports"
        description="Ready-made charts for stakeholders. Switch to the table view on any chart, or export one report or the whole tab to PDF or Excel."
        actions={en.data && rp.data && <ExportTab key={tab.key} title={`${tab.label} report`} filters={label} dataAsOf={asOf} />} />

      <div className="flex gap-1 overflow-x-auto border-b border-surface-4 -mx-1 px-1" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab.key === t.key} onClick={() => setTab(t.key)}
            className={clsx('relative flex items-center gap-2 px-3.5 py-2.5 text-sm whitespace-nowrap transition-colors',
              tab.key === t.key ? 'text-zinc-100 font-semibold' : 'text-zinc-500 hover:text-zinc-200')}>
            <t.icon className={clsx('w-4 h-4', tab.key === t.key ? 'text-accent' : '')} />
            {t.label}
            <span className={clsx('absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-accent transition-opacity', tab.key === t.key ? 'opacity-100' : 'opacity-0')} />
          </button>
        ))}
      </div>

      <FilterBar f={f} set={set} programs={programs} courses={courses} showCompare={tab.key === 'comparison'}
        showGrain={['trends', 'comparison'].includes(tab.key)} showCourse={tab.key !== 'cla'} />

      {(en.error || rp.error) && <ErrorBox message={en.error || rp.error} />}
      {(!en.data || !rp.data) && !(en.error || rp.error) ? <Loading /> : en.data && rp.data && (
          <div className={clsx('space-y-6', (en.loading || rp.loading) && 'opacity-60 transition-opacity')}>
            <p className="text-sm text-zinc-500">{tab.blurb}</p>
            {tab.key === 'trends' && <Trends e={en.data} r={rp.data} f={f} label={label} />}
            {tab.key === 'completion' && <Completion e={en.data} r={rp.data} label={label} />}
            {tab.key === 'comparison' && <Comparison r={rp.data} f={f} label={label} asOf={asOf} />}
            {tab.key === 'programs' && <Programs e={en.data} r={rp.data} label={label} />}
            {tab.key === 'engagement' && <Engagement e={en.data} label={label} />}
            {tab.key === 'cla' && <Cla asOf={asOf} />}
            {asOf && <p className="text-xs text-zinc-500">Data as of {fmtDateTime(asOf)} CST. Exports end with the date and time they were generated.</p>}
          </div>
      )}
    </PageShell>
    </ReportRegistry>
  );
}

/* ---------------- tabs ---------------- */

function Trends({ e, r, f, label }) {
  const g = GRAIN_LABEL[f.grain].toLowerCase();
  const periodCol = { key: 'period', label: 'Period', fmt: v => fmtPeriod(v, f.grain, true) };
  return (<>
    <ReportCard title="New enrollments" subtitle={`Enrollments created, ${g}`} filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [periodCol, { key: 'enrollments', label: 'Enrollments', num: true }], rows: e.trend }}>
      <TrendChart data={e.trend} grain={f.grain} kind="bar" height={320} series={[{ key: 'enrollments', label: 'Enrollments' }]} />
    </ReportCard>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ReportCard title="Enrollments and completions" subtitle={`Side by side, ${g}`} filters={label} dataAsOf={e.data_as_of}
        table={{ columns: [periodCol, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completions', label: 'Completions', num: true }], rows: e.trend }}>
        <TrendChart data={e.trend} grain={f.grain} kind="line" series={[{ key: 'enrollments', label: 'Enrollments' }, { key: 'completions', label: 'Completions' }]} />
      </ReportCard>
      <ReportCard title="Cumulative enrollments" subtitle="Running total over the selected range" filters={label} dataAsOf={e.data_as_of}
        table={{ columns: [periodCol, { key: 'cumulative', label: 'Total enrollments', num: true }], rows: e.trend }}>
        <TrendChart data={e.trend} grain={f.grain} kind="area" series={[{ key: 'cumulative', label: 'Total enrollments' }]} />
      </ReportCard>
    </div>
    <ReportCard title="New students" subtitle={`People enrolling for the first time, ${g}, and how many of them went on to take more than one course`} filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [periodCol, { key: 'new_students', label: 'New students', num: true }, { key: 'took_more', label: 'Took 2+ courses', num: true }], rows: r.new_students }}>
      <TrendChart data={r.new_students} grain={f.grain} kind="bar" series={[{ key: 'new_students', label: 'New students' }, { key: 'took_more', label: 'Took 2+ courses' }]} />
    </ReportCard>
  </>);
}

function Completion({ e, r, label }) {
  const k = e.kpis;
  const byProgram = e.by_program.map(p => ({ ...p, rate: p.enrollments ? Math.round((100 * p.completed) / p.enrollments) : 0 }));
  const leaders = [...e.by_course].sort((a, b) => (b.completion_rate ?? 0) - (a.completion_rate ?? 0));
  return (<>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <Kpi label="Completion rate" icon={CheckCircle2} value={pct(k.completion_rate)} sub={`${fmtNum(k.completed)} of ${fmtNum(k.enrollments)} enrollments`} />
      <Kpi label="Completed" value={fmtNum(k.completed)} sub={`${fmtNum(k.active)} still in progress`} />
      <Kpi label="Avg assignment progress" value={pct(k.avg_progress)} sub="Published assignments turned in" />
      <Kpi label="Avg current grade" value={r.grades.avg === null ? '—' : `${r.grades.avg}%`} sub={`${fmtNum(r.grades.graded)} enrollments with a grade`} />
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ReportCard title="Completion rate by program" subtitle="Completed enrollments as a share of all enrollments" filters={label} dataAsOf={e.data_as_of}
        table={{ columns: [{ key: 'label', label: 'Program' }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'rate', label: 'Completion %', num: true, fmt: pctFmt }], rows: byProgram }}>
        <Bars data={byProgram} horizontal catWidth={210} labels valueFmt={v => `${v}%`} series={[{ key: 'rate', label: 'Completion rate' }]} />
      </ReportCard>
      <ReportCard title="Grade distribution" subtitle="Current course score of each graded enrollment" filters={label} dataAsOf={e.data_as_of}
        table={{ columns: [{ key: 'label', label: 'Score band' }, { key: 'value', label: 'Enrollments', num: true }], rows: r.grades.bands }}>
        <Bars data={r.grades.bands} labels series={[{ key: 'value', label: 'Enrollments' }]} />
      </ReportCard>
    </div>
    <ReportCard title="Course completion leaderboard" subtitle="Completion rate of the 15 largest courses" filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [{ key: 'name', label: 'Course', link: { key: 'id', href: x => `/course/${x.id}` } }, { key: 'sku', label: 'SKU' }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'completion_rate', label: 'Completion %', num: true, fmt: pctFmt }], rows: leaders }}>
      <Bars data={leaders} category="name" horizontal catWidth={260} labels valueFmt={v => `${v}%`} series={[{ key: 'completion_rate', label: 'Completion rate' }]} />
    </ReportCard>
    <ReportCard title="Assignment progress" subtitle="Share of published assignments each enrollment has turned in" filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [{ key: 'label', label: 'Progress' }, { key: 'value', label: 'Enrollments', num: true }], rows: e.progress }}>
      <Bars data={e.progress} labels series={[{ key: 'value', label: 'Enrollments' }]} />
    </ReportCard>
  </>);
}

function Comparison({ r, f, label, asOf }) {
  const cmp = r.comparison;
  const nameA = `${cmp.current.from} to ${cmp.current.to}`;
  const nameB = cmp.previous ? `${cmp.previous.from} to ${cmp.previous.to}` : 'Previous';
  const t = cmp.totals;
  const rows = cmp.rows.map(x => ({
    label: x.label,
    cur_enr: x.current.enrollments, prev_enr: x.previous.enrollments, chg_enr: pctChange(x.current.enrollments, x.previous.enrollments),
    cur_comp: x.current.completed, prev_comp: x.previous.completed, chg_comp: pctChange(x.current.completed, x.previous.completed),
    cur_stu: x.current.students, prev_stu: x.previous.students,
  }));
  const chg = v => (v === null ? 'n/a' : `${v > 0 ? '+' : ''}${v}%`);
  const note = !f.from || !f.to ? 'No closed date range is selected, so the last 90 days are compared. ' : '';
  return (<>
    <div className="card-sm flex items-start gap-3 text-sm text-zinc-400">
      <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
      <p>{note}Comparing <span className="font-semibold text-zinc-200">{nameA}</span> with <span className="font-semibold text-zinc-200">{nameB}</span> ({cmp.mode === 'yoy' ? 'same dates last year' : 'the period just before'}).</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Kpi label="Enrollments" value={fmtNum(t.current.enrollments)} delta={<Delta cur={t.current.enrollments} prev={t.previous.enrollments} suffix={`vs ${fmtNum(t.previous.enrollments)}`} />} />
      <Kpi label="Students" value={fmtNum(t.current.students)} delta={<Delta cur={t.current.students} prev={t.previous.students} suffix={`vs ${fmtNum(t.previous.students)}`} />} sub="Counted per program" />
      <Kpi label="Completions" value={fmtNum(t.current.completed)} delta={<Delta cur={t.current.completed} prev={t.previous.completed} suffix={`vs ${fmtNum(t.previous.completed)}`} />} />
    </div>
    <ReportCard title="Enrollments by program: period comparison" subtitle={`${nameA} against ${nameB}`} filters={label} dataAsOf={asOf}
      table={{ columns: [
        { key: 'label', label: 'Program' }, { key: 'cur_enr', label: 'Enrollments (this)', num: true }, { key: 'prev_enr', label: 'Enrollments (before)', num: true },
        { key: 'chg_enr', label: 'Change', num: true, fmt: chg }, { key: 'cur_comp', label: 'Completed (this)', num: true }, { key: 'prev_comp', label: 'Completed (before)', num: true },
        { key: 'chg_comp', label: 'Change', num: true, fmt: chg },
      ], rows }}>
      <Bars data={rows} horizontal catWidth={210} series={[{ key: 'cur_enr', label: nameA }, { key: 'prev_enr', label: nameB }]} />
    </ReportCard>
    <ReportCard title="Completions by program: period comparison" subtitle={`${nameA} against ${nameB}`} filters={label} dataAsOf={asOf}
      table={{ columns: [{ key: 'label', label: 'Program' }, { key: 'cur_comp', label: 'Completed (this)', num: true }, { key: 'prev_comp', label: 'Completed (before)', num: true }, { key: 'chg_comp', label: 'Change', num: true, fmt: chg }], rows }}>
      <Bars data={rows} horizontal catWidth={210} series={[{ key: 'cur_comp', label: nameA }, { key: 'prev_comp', label: nameB }]} />
    </ReportCard>
  </>);
}

function Programs({ e, r, label }) {
  return (<>
    <ReportCard title="Programs side by side" subtitle="Enrollments, students and completions per program" filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [{ key: 'label', label: 'Program' }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'students', label: 'Students', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'dropped', label: 'Dropped', num: true }], rows: e.by_program }}>
      <Bars data={e.by_program} series={[{ key: 'enrollments', label: 'Enrollments' }, { key: 'students', label: 'Students' }, { key: 'completed', label: 'Completed' }]} height={320} />
    </ReportCard>
    <ReportCard title="Courses by outcome" subtitle="The 15 largest courses split into completed, in progress and dropped" filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [{ key: 'name', label: 'Course', link: { key: 'id', href: x => `/course/${x.id}` } }, { key: 'sku', label: 'SKU' }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'active', label: 'In progress', num: true }, { key: 'dropped', label: 'Dropped', num: true }], rows: e.by_course }}>
      <Bars data={e.by_course} category="name" horizontal stacked catWidth={260}
        series={[{ key: 'completed', label: 'Completed', slot: 2 }, { key: 'active', label: 'In progress', slot: 0 }, { key: 'dropped', label: 'Dropped', slot: 7 }]} />
    </ReportCard>
    <ReportCard title="Instructor load" subtitle="Student enrollments in the courses each instructor teaches" filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [{ key: 'name', label: 'Instructor', link: { key: 'id', href: x => `/person/${x.id}` } }, { key: 'courses', label: 'Courses', num: true }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'completion_rate', label: 'Completion %', num: true, fmt: pctFmt }], rows: r.instructors }}>
      <Bars data={r.instructors} category="name" horizontal catWidth={200} series={[{ key: 'enrollments', label: 'Enrollments' }, { key: 'completed', label: 'Completed' }]} />
    </ReportCard>
  </>);
}

function Engagement({ e, label }) {
  const c = useChartColors();
  return (<>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ReportCard title="Last activity" subtitle="When each enrolled student was last active in the course" filters={label} dataAsOf={e.data_as_of}
        table={{ columns: [{ key: 'label', label: 'Last active' }, { key: 'value', label: 'Enrollments', num: true }], rows: e.activity }}>
        <Bars data={e.activity} labels series={[{ key: 'value', label: 'Enrollments' }]} />
      </ReportCard>
      <ReportCard title="Enrollment status" subtitle="Where these enrollments stand" filters={label} dataAsOf={e.data_as_of} minH={240}
        table={{ columns: [{ key: 'label', label: 'Status' }, { key: 'value', label: 'Enrollments', num: true }], rows: e.by_status }}>
        <div className="pt-3"><ShareBars items={e.by_status} colors={[c.series[0], c.series[2], c.series[7], c.series[3]]} /></div>
      </ReportCard>
    </div>
    <ReportCard title="Assignment progress" subtitle="How far students have got through published assignments" filters={label} dataAsOf={e.data_as_of}
      table={{ columns: [{ key: 'label', label: 'Progress' }, { key: 'value', label: 'Enrollments', num: true }], rows: e.progress }}>
      <Bars data={e.progress} labels series={[{ key: 'value', label: 'Enrollments' }]} />
    </ReportCard>
  </>);
}

function Cla({ asOf }) {
  const { data, error, loading } = useFetch('/portal/reporting/cla');
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const { funnel: fu, trackStats, courseStats, pricing } = data;
  const short = s => s.replace(/^.*?for the Workplace:?\s*/, '').replace(/^\((CLAMC-01)\)$/, 'Microcertificate') || s;
  const courseRows = courseStats.map(x => ({ ...x, short: `${x.sis.slice(0, 3)} · ${short(x.name) || 'Microcertificate'}` }));
  const trackRows = trackStats.map(t => ({ ...t, label: t.label.replace(' for the Workplace', '') }));
  const lbl = 'Career Learning Academy courses';
  return (<>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <Kpi label="Learners" value={fmtNum(fu.total_learners)} sub="In any CLA course" />
      <Kpi label="Took a free course" value={fmtNum(fu.free_learners)} sub={`${fmtNum(fu.free_completed)} finished it`} />
      <Kpi label="Free, then paid" value={fmtNum(fu.free_then_paid)} sub={fu.rate_free_to_paid === null ? 'No free learners yet' : `${fu.rate_free_to_paid}% conversion`} />
      <Kpi label="Free course only" value={fmtNum(fu.free_only)} sub="Never enrolled in a paid course" />
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ReportCard title="Free and paid courses" subtitle="Enrollments and outcomes by price" filters={lbl} dataAsOf={asOf}
        table={{ columns: [{ key: 'pricing', label: 'Type' }, { key: 'courses', label: 'Courses', num: true }, { key: 'enrolled', label: 'Enrolled', num: true }, { key: 'in_progress', label: 'In progress', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'dropped', label: 'Dropped', num: true }], rows: pricing }}>
        <Bars data={pricing} category="pricing" series={[{ key: 'enrolled', label: 'Enrolled' }, { key: 'completed', label: 'Completed' }, { key: 'dropped', label: 'Dropped', slot: 7 }]} />
      </ReportCard>
      <ReportCard title="By track" subtitle="Learners in each track and how the free course converts" filters={lbl} dataAsOf={asOf}
        table={{ columns: [{ key: 'label', label: 'Track' }, { key: 'learners', label: 'Learners', num: true }, { key: 'free_learners', label: 'Took free course', num: true }, { key: 'free_then_paid', label: 'Free, then paid', num: true }, { key: 'paid_no_free', label: 'Paid without free', num: true }, { key: 'completed_all_six', label: 'Completed all 6', num: true }], rows: trackRows }}>
        <Bars data={trackRows} series={[{ key: 'learners', label: 'Learners' }, { key: 'free_learners', label: 'Took free course' }, { key: 'free_then_paid', label: 'Free, then paid' }]} />
      </ReportCard>
    </div>
    <ReportCard title="CLA courses" subtitle="Enrolled and completed in each of the 21 offerings" filters={lbl} dataAsOf={asOf}
      table={{ columns: [{ key: 'sis', label: 'SKU' }, { key: 'name', label: 'Course' }, { key: 'kind', label: 'Type' }, { key: 'pricing', label: 'Price' }, { key: 'enrolled', label: 'Enrolled', num: true }, { key: 'in_progress', label: 'In progress', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'dropped', label: 'Dropped', num: true }], rows: courseRows }}>
      <Bars data={courseRows} category="short" horizontal catWidth={280} series={[{ key: 'enrolled', label: 'Enrolled' }, { key: 'completed', label: 'Completed' }]} />
    </ReportCard>
    <p className="text-xs text-zinc-500">
      Free courses are set by hand (Canvas has no price). Payments, RFIs and extensions live in CampusCE and Smartsheet and are not in this data yet; see the
      {' '}<Link href="/group/cla?view=reporting" className="text-accent hover:underline">CLA reporting page</Link> for every measure.
    </p>
  </>);
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <Reports />
    </Suspense>
  );
}
