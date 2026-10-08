'use client';

import Link from 'next/link';
import { useFetch, Loading, ErrorBox, Metric, PageShell, fmtNum, fmtDateTime } from '@/components/portal';
import { ArrowRight } from 'lucide-react';

export default function Overview() {
  const { data: s, error, loading } = useFetch('/portal/summary');

  if (loading) return <Loading />;
  if (error) return <PageShell><ErrorBox message={error} /></PageShell>;

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Courses, people and progress across CampusCE. Select any figure to see the full list.
          {s.data_as_of && <span> Data as of {fmtDateTime(s.data_as_of)} CST.</span>}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Metric label="Courses" value={fmtNum(s.courses)} sub={`${fmtNum(s.courses_published)} published`} href="/browse/courses" />
        <Metric label="Students" value={fmtNum(s.students)} sub={`${fmtNum(s.students_active)} active`} href="/browse/students" />
        <Metric label="Instructors" value={fmtNum(s.instructors)} sub={`${fmtNum(s.instructors_active)} active`} href="/browse/instructors" />
        <Metric label="Sections" value={fmtNum(s.sections)} href="/browse/sections" />
        <Metric label="Enrollments" value={fmtNum(s.enrollments)} sub={`${fmtNum(s.enrollments_active)} active`} href="/browse/enrollments" />
        <Metric label="Assignments" value={fmtNum(s.assignments)} sub={`${fmtNum(s.assignments_published)} published`} href="/browse/assignments" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300">Programs</h2>
          <Link href="/programs" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
            View all programs <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {s.groups.map(g => (
            <Link key={g.key} href={`/group/${g.key}`}
              className="card group hover:border-accent/50 hover:bg-surface-3/60 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-medium text-zinc-100">{g.label}</p>
                  <p className="text-xs text-zinc-500 mt-1">{g.blurb}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-accent shrink-0 mt-1 transition-colors" />
              </div>
              <div className="flex gap-6 mt-4">
                <div><p className="metric-value text-xl">{fmtNum(g.courses)}</p><p className="text-xs text-zinc-500">courses</p></div>
                <div><p className="metric-value text-xl">{fmtNum(g.students)}</p><p className="text-xs text-zinc-500">active students</p></div>
                <div><p className="metric-value text-xl">{fmtNum(g.instructors)}</p><p className="text-xs text-zinc-500">instructors</p></div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
