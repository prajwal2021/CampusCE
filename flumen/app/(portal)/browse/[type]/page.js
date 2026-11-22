'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { PageShell, Crumbs, PageHeader } from '@/components/portal';
import ListTable from '@/components/ListTable';
import { useScope, programParam } from '@/components/scope';

const BLURB = {
  courses: 'Every course, with its CampusCE SKU, program and enrollment counts.',
  students: 'Everyone enrolled as a student. Search by name or CampusCE number.',
  instructors: 'Everyone teaching a course.',
  sections: 'Course sections and how many active students each has.',
  enrollments: 'One row per student per course. Search by student, CampusCE number, course or SKU.',
  assignments: 'Assignments across all courses.',
};

function Browse() {
  const { type } = useParams();
  const sp = useSearchParams();
  const { program, setProgram, ready } = useScope();
  // a ?group= link (from a program page) wins; otherwise follow the top-bar program
  const group = sp.get('group') || programParam(program);
  const [meta, setMeta] = useState(null);
  const title = meta?.title || type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <PageShell>
      <div className="space-y-3">
        <Crumbs items={[
          { label: 'Home', href: '/' },
          ...(meta?.group ? [{ label: meta.group.label, href: `/group/${meta.group.key}` }] : []),
          { label: title },
        ]} />
        <PageHeader
          title={<>{title}{meta?.group && <span className="text-zinc-500 font-normal text-lg"> · {meta.group.label}</span>}</>}
          description={BLURB[type]}
          actions={group ? (
            <Link href={`/browse/${type}`} onClick={() => setProgram('all')} className="btn-ghost"><X className="w-4 h-4" /> Show all programs</Link>
          ) : null}
        />
      </div>
      {ready && <ListTable key={`${type}-${group}`} type={type} group={group} onMeta={setMeta}
        initialSort={sp.get('sort') || null} initialDir={sp.get('sort') ? 'desc' : 'asc'}
        filtersLabel={meta?.group?.label} />}
    </PageShell>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={null}>
      <Browse />
    </Suspense>
  );
}
