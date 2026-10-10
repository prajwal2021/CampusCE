'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Info } from 'lucide-react';
import clsx from 'clsx';
import { useFetch, Loading, ErrorBox, fmtNum, linkCls } from '@/components/portal';

const GROUP_ORDER = ['Free course', 'Interest', 'Completions', 'Retention'];
const GROUP_BLURB = {
  'Free course': 'How the free course turns into further enrollments.',
  Interest: 'People who asked for information.',
  Completions: 'Who finished what.',
  Retention: 'Drops, time outs and extensions.',
};

function Tile({ m }) {
  const [open, setOpen] = useState(false);
  const waiting = m.status === 'needs_campusce';
  const canOpen = !waiting && m.people.length > 0;

  return (
    <div className={clsx('card-sm flex flex-col', waiting && 'border-dashed')}>
      <p className="text-xs font-medium text-zinc-400 leading-snug min-h-[2rem]">{m.label}</p>
      <p className={clsx('metric-value mt-1', waiting && 'text-zinc-600')}>{waiting ? '—' : fmtNum(m.value)}</p>
      <p className="text-xs text-zinc-500 mt-1.5 flex-1">{waiting ? m.need : m.note}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={waiting ? 'badge-warn' : 'badge-ok'}>{waiting ? 'Needs CampusCE data' : 'From Canvas'}</span>
        {canOpen && (
          <button onClick={() => setOpen(o => !o)} className="text-xs text-accent hover:underline inline-flex items-center gap-1" aria-expanded={open}>
            {open ? 'Hide' : 'Show'} people <ChevronDown className={clsx('w-3 h-3 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-3 pt-3 border-t border-surface-4 space-y-1 max-h-48 overflow-y-auto">
          {m.people.map(p => (
            <li key={p.user_id} className="text-sm">
              <Link href={`/person/${p.user_id}`} className={linkCls}>{p.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Reporting() {
  const { data, error, loading } = useFetch('/portal/reporting/cla');

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  const { metrics, config } = data;
  const waiting = metrics.filter(m => m.status === 'needs_campusce').length;

  return (
    <div className="space-y-6">
      <div className="card-sm flex items-start gap-3 text-sm text-zinc-400">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Counts are calculated from {fmtNum(config.enrollments_counted)} Canvas enrollments in the seven Career Learning Academy courses,
            so they include the test students. {waiting} of {metrics.length} items need CampusCE data and fill in once that access is available.
          </p>
          <p className="text-xs text-zinc-500">
            Free course used for the funnel{config.free_is_assumed ? ' (assumed, to be confirmed)' : ''}: {config.free_courses.join(', ') || 'none set'}. {config.free_note}
            Completion means the Canvas enrollment was concluded. A drop is a deactivated or removed enrollment. A time out is an enrollment
            whose access end date passed before completion.
          </p>
        </div>
      </div>

      {GROUP_ORDER.map(g => {
        const items = metrics.filter(m => m.group === g);
        if (items.length === 0) return null;
        return (
          <section key={g} className="space-y-3">
            <div>
              <h2 className="text-sm font-medium text-zinc-200">{g}</h2>
              <p className="text-xs text-zinc-500">{GROUP_BLURB[g]}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              {items.map(m => <Tile key={m.key} m={m} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
