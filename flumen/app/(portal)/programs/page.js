'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useFetch, Loading, ErrorBox, PageShell, Crumbs, Panel, fmtNum, linkCls } from '@/components/portal';

export default function ProgramsPage() {
  const { data: s, error, loading } = useFetch('/portal/summary');

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  return (
    <PageShell>
      <div className="space-y-2">
        <Crumbs items={[{ label: 'Overview', href: '/' }, { label: 'Programs' }]} />
        <h1 className="text-2xl font-semibold text-zinc-100">Programs</h1>
        <p className="text-sm text-zinc-500">Courses are grouped into programs by their names and Canvas accounts. Select a program to see everything in it.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {s.groups.map(g => (
          <Link key={g.key} href={`/group/${g.key}`}
            className="card group hover:border-accent/50 hover:bg-surface-3/60 transition-colors flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-medium text-zinc-100">{g.label}</p>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-accent shrink-0 mt-1.5 transition-colors" />
            </div>
            <p className="text-xs text-zinc-500 mt-1 flex-1">{g.blurb}</p>
            <div className="flex gap-6 mt-5">
              <div><p className="metric-value text-xl">{fmtNum(g.courses)}</p><p className="text-xs text-zinc-500">courses</p></div>
              <div><p className="metric-value text-xl">{fmtNum(g.students)}</p><p className="text-xs text-zinc-500">active students</p></div>
              <div><p className="metric-value text-xl">{fmtNum(g.instructors)}</p><p className="text-xs text-zinc-500">instructors</p></div>
            </div>
          </Link>
        ))}
      </div>

      <Panel title="All programs" count={s.groups.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Program', 'Courses', 'Active students', 'Instructors', ''].map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500 bg-surface-1 border-b border-surface-4 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.groups.map(g => (
                <tr key={g.key} className="hover:bg-surface-3/40 transition-colors">
                  <td className="px-4 py-2.5 border-b border-surface-3"><Link href={`/group/${g.key}`} className={linkCls}>{g.label}</Link></td>
                  <td className="px-4 py-2.5 border-b border-surface-3 text-right tabular-nums">{fmtNum(g.courses)}</td>
                  <td className="px-4 py-2.5 border-b border-surface-3 text-right tabular-nums">{fmtNum(g.students)}</td>
                  <td className="px-4 py-2.5 border-b border-surface-3 text-right tabular-nums">{fmtNum(g.instructors)}</td>
                  <td className="px-4 py-2.5 border-b border-surface-3 text-right">
                    <Link href={`/browse/courses?group=${g.key}`} className="text-xs text-accent hover:underline">Courses</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}
