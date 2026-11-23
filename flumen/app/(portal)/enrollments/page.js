'use client';

import { Suspense, useState } from 'react';
import { Users, GraduationCap, PlayCircle, CheckCircle2, UserMinus, TrendingUp } from 'lucide-react';
import { useFetch, Loading, ErrorBox, PageShell, PageHeader, fmtNum, fmtDateTime } from '@/components/portal';
import { ReportRegistry, useRegistry, ReportCard, TrendChart, Bars, ShareBars, Kpi, Delta, ExportMenu, fmtPeriod } from '@/components/charts';
import { FilterBar, useFilters, describe, Segmented, GRAIN_LABEL } from '@/components/filters';
import { useChartColors } from '@/components/theme';
import ListTable from '@/components/ListTable';
import { downloadExcel, downloadPDF } from '@/lib/export';

const pct = v => (v === null || v === undefined ? '—' : `${v}%`);

function ExportAll({ title, filters, dataAsOf }) {
  const reg = useRegistry();
  return (
    <ExportMenu label="Export dashboard"
      onPDF={() => downloadPDF({ title, reports: reg.all(), filters, dataAsOf })}
      onExcel={() => downloadExcel({ title, sheets: reg.all(), filters, dataAsOf })} />
  );
}

function Dashboard() {
  const { f, set, query, scope } = useFilters();
  const { data: d, error, loading } = useFetch(`/portal/enrollments?${query}`);
  const c = useChartColors();
  const [trendKind, setTrendKind] = useState('area');
  const [trendMetric, setTrendMetric] = useState('flow');

  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;
  const first = !d && loading;
  const programs = d?.programs || [];
  const courses = d?.courses || [];
  const label = describe(f, { programs, courses, scope });

  const header = (
    <PageHeader eyebrow="Insights" title="Enrollments"
      description={`${f.group ? (programs.find(x => x.key === f.group)?.label || f.group) : 'All programs'}: who is signing up, how far they get and where they finish. Every chart follows the filters and can be exported.`}
      actions={d && <ExportAll title="Enrollment dashboard" filters={label} dataAsOf={d.data_as_of} />} />
  );
  if (first) return <PageShell>{header}<Loading /></PageShell>;

  const k = d.kpis, p = d.previous;
  const cmp = p ? 'vs previous period' : null;
  const grainName = GRAIN_LABEL[f.grain].toLowerCase();
  const periodCol = { key: 'period', label: 'Period', fmt: v => fmtPeriod(v, f.grain, true) };
  const listExtra = new URLSearchParams({ ...(f.from && { from: f.from }), ...(f.to && { to: f.to }), ...(f.course && { course: f.course }), ...(f.tests && { tests: 'include' }) }).toString();

  return (
    <PageShell>
      {header}
      <FilterBar f={f} set={set} programs={programs} courses={courses} />

      <div className={loading ? 'opacity-60 transition-opacity space-y-6' : 'space-y-6'}>
        <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
          <Kpi label="Enrollments" icon={Users} value={fmtNum(k.enrollments)} delta={cmp && <Delta cur={k.enrollments} prev={p.enrollments} suffix={cmp} />} sub={`${fmtNum(k.courses)} courses`} />
          <Kpi label="Unique students" icon={GraduationCap} value={fmtNum(k.students)} delta={cmp && <Delta cur={k.students} prev={p.students} suffix={cmp} />}
            sub={k.students ? `${(k.enrollments / k.students).toFixed(1)} enrollments per student` : null} />
          <Kpi label="In progress" icon={PlayCircle} value={fmtNum(k.active)} sub={k.enrollments ? `${Math.round((100 * k.active) / k.enrollments)}% of enrollments` : null} />
          <Kpi label="Finished all assignments" icon={CheckCircle2} value={fmtNum(k.finished_all)} sub={`${pct(k.finished_rate)} of enrollments · ${fmtNum(k.completed)} concluded in Canvas`} />
          <Kpi label="Dropped" icon={UserMinus} href="/drops" value={fmtNum(k.dropped)} delta={cmp && <Delta cur={k.dropped} prev={p.dropped} invert suffix={cmp} />} sub={`Drop rate ${pct(k.drop_rate)}`} />
          <Kpi label="Avg assignment progress" icon={TrendingUp} value={pct(k.avg_progress)} sub="Published assignments turned in" />
        </div>

        <ReportCard title="Enrollment trend" filters={label} dataAsOf={d.data_as_of}
          subtitle={trendMetric === 'flow' ? `New enrollments and completions, ${grainName}` : `Running total of enrollments, ${grainName}`}
          right={<div className="hidden md:flex items-center gap-2" data-no-export>
            <Segmented value={trendMetric} onChange={setTrendMetric} options={[{ value: 'flow', label: 'New' }, { value: 'cumulative', label: 'Cumulative' }]} />
            {trendMetric === 'flow' && <Segmented value={trendKind} onChange={setTrendKind} options={[{ value: 'area', label: 'Area' }, { value: 'bar', label: 'Bars' }]} />}
          </div>}
          table={{ columns: [periodCol, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'completions', label: 'Completions', num: true }, { key: 'cumulative', label: 'Cumulative', num: true }], rows: d.trend }}>
          {trendMetric === 'flow'
            ? <TrendChart data={d.trend} grain={f.grain} kind={trendKind} height={320} series={[{ key: 'enrollments', label: 'Enrollments' }, { key: 'completions', label: 'Completions' }]} />
            : <TrendChart data={d.trend} grain={f.grain} kind="area" height={320} series={[{ key: 'cumulative', label: 'Total enrollments' }]} />}
        </ReportCard>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <ReportCard className="xl:col-span-2" title="By program" subtitle="Enrollments and completions in each program" filters={label} dataAsOf={d.data_as_of}
            table={{ columns: [{ key: 'label', label: 'Program' }, { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'students', label: 'Students', num: true }, { key: 'active', label: 'In progress', num: true }, { key: 'completed', label: 'Completed', num: true }, { key: 'dropped', label: 'Dropped', num: true }], rows: d.by_program }}>
            <Bars data={d.by_program} horizontal catWidth={210} labels
              series={[{ key: 'enrollments', label: 'Enrollments' }, { key: 'completed', label: 'Completed' }]}
              onClick={x => { const key = x?.payload?.key || x?.key; if (key) set({ group: key }); }} />
          </ReportCard>
          <ReportCard title="Status" subtitle="Where these enrollments stand" filters={label} dataAsOf={d.data_as_of} minH={220}
            table={{ columns: [{ key: 'label', label: 'Status' }, { key: 'value', label: 'Enrollments', num: true }], rows: d.by_status }}>
            <div className="pt-2"><ShareBars items={d.by_status} colors={[c.series[1], c.series[2], c.series[0], c.series[3]]} /></div>
          </ReportCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ReportCard title="Assignment progress" subtitle="Share of published assignments each enrollment has turned in" filters={label} dataAsOf={d.data_as_of}
            table={{ columns: [{ key: 'label', label: 'Progress' }, { key: 'value', label: 'Enrollments', num: true }], rows: d.progress }}
            footer={d.no_assignments ? `${fmtNum(d.no_assignments)} enrollments are in courses with no published assignments and are left out.` : null}>
            <Bars data={d.progress} series={[{ key: 'value', label: 'Enrollments' }]} labels height={280} />
          </ReportCard>
          <ReportCard title="Last activity" subtitle="When each enrolled student was last active in the course" filters={label} dataAsOf={d.data_as_of}
            table={{ columns: [{ key: 'label', label: 'Last active' }, { key: 'value', label: 'Enrollments', num: true }], rows: d.activity }}>
            <Bars data={d.activity} series={[{ key: 'value', label: 'Enrollments' }]} labels height={280} />
          </ReportCard>
        </div>

        <ReportCard title="Top courses" subtitle="The 15 courses with the most enrollments" filters={label} dataAsOf={d.data_as_of}
          table={{ columns: [
            { key: 'name', label: 'Course', link: { key: 'id', href: r => `/course/${r.id}` } }, { key: 'sku', label: 'SKU' },
            { key: 'enrollments', label: 'Enrollments', num: true }, { key: 'active', label: 'In progress', num: true },
            { key: 'completed', label: 'Completed', num: true }, { key: 'dropped', label: 'Dropped', num: true },
            { key: 'finished_all', label: 'Finished all', num: true }, { key: 'finished_rate', label: 'Finished %', num: true, fmt: v => (v === null ? '' : `${v}%`) },
            { key: 'completion_rate', label: 'Concluded %', num: true, fmt: v => (v === null ? '' : `${v}%`) },
          ], rows: d.by_course }}>
          <Bars data={d.by_course} category="name" horizontal catWidth={320} stacked
            series={[{ key: 'completed', label: 'Completed', slot: 2 }, { key: 'active', label: 'In progress', slot: 1 }, { key: 'dropped', label: 'Dropped', slot: 0 }]}
            onClick={x => { const id = x?.payload?.id || x?.id; if (id) set({ course: String(id) }); }} />
        </ReportCard>

        <div className="space-y-3">
          <div>
            <h2 className="section-title">Enrollment records</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Every enrollment matching the filters above, with CampusCE numbers. Export pulls all matching rows.</p>
          </div>
          <ListTable key={`${scope}-${f.group}-${listExtra}`} type="enrollments" group={f.group} extra={listExtra}
            initialSort="enrolled" initialDir="desc" filtersLabel={label} />
        </div>

        {d.data_as_of && <p className="text-xs text-zinc-500">Data as of {fmtDateTime(d.data_as_of)} CST. Completion means the Canvas enrollment was concluded; a drop is a deactivated enrollment.</p>}
      </div>
    </PageShell>
  );
}

export default function EnrollmentsPage() {
  return (
    <Suspense fallback={null}>
      <ReportRegistry>
        <Dashboard />
      </ReportRegistry>
    </Suspense>
  );
}
