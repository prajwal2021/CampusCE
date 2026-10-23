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

function Segment({ s }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-sm flex flex-col">
      <p className="text-xs font-medium text-zinc-400 leading-snug min-h-[2rem]">{s.label}</p>
      <p className="metric-value mt-1">{fmtNum(s.count)}</p>
      <p className="text-xs text-zinc-500 mt-1.5 flex-1">{s.note}</p>
      {s.people.length > 0 && (
        <button onClick={() => setOpen(o => !o)} className="mt-3 self-start text-xs text-accent hover:underline inline-flex items-center gap-1" aria-expanded={open}>
          {open ? 'Hide' : 'Show'} people <ChevronDown className={clsx('w-3 h-3 transition-transform', open && 'rotate-180')} />
        </button>
      )}
      {open && (
        <ul className="mt-3 pt-3 border-t border-surface-4 space-y-1 max-h-48 overflow-y-auto">
          {s.people.map(p => (
            <li key={p.user_id} className="text-sm"><Link href={`/person/${p.user_id}`} className={linkCls}>{p.name}</Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Th({ children, num }) {
  return <th className={clsx('px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500 bg-surface-1 border-b border-surface-4 whitespace-nowrap', num ? 'text-right' : 'text-left')}>{children}</th>;
}
const td = 'px-4 py-2.5 border-b border-surface-3 text-zinc-300';

function FreeVsPaid({ data }) {
  const { funnel: f, segments, trackStats, courseStats, pricing, learners } = data;
  const badge = v => <span className={v === 'Completed' ? 'badge-ok' : v === 'Enrolled' ? 'badge-info' : 'text-zinc-600'}>{v}</span>;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Free course to paid courses</h2>
          <p className="text-xs text-zinc-500">
            {fmtNum(f.free_learners)} people took the free course. {fmtNum(f.free_then_paid)} went on to a paid course
            {f.rate_free_to_paid === null ? '' : ` (${f.rate_free_to_paid}%)`} and {fmtNum(f.free_only)} stayed on the free course only.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {segments.map(s => <Segment key={s.key} s={s} />)}
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-4"><h2 className="text-sm font-medium text-zinc-200">By track</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><Th>Track</Th><Th num>Learners</Th><Th num>Took free course</Th><Th num>Free, then paid</Th><Th num>Free only</Th><Th num>Paid without free</Th><Th num>Completed all 6</Th></tr></thead>
            <tbody>
              {trackStats.map(t => (
                <tr key={t.key} className="hover:bg-surface-3/40">
                  <td className={td}>{t.label}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(t.learners)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(t.free_learners)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(t.free_then_paid)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(t.free_only)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(t.paid_no_free)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(t.completed_all_six)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-4"><h2 className="text-sm font-medium text-zinc-200">Free and paid courses</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><Th>Type</Th><Th num>Courses</Th><Th num>Enrolled</Th><Th num>In progress</Th><Th num>Completed</Th><Th num>Dropped</Th></tr></thead>
            <tbody>
              {pricing.map(p => (
                <tr key={p.pricing}>
                  <td className={td}>{p.pricing}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(p.courses)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(p.enrolled)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(p.in_progress)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(p.completed)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(p.dropped)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-4"><h2 className="text-sm font-medium text-zinc-200">By course</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><Th>Course</Th><Th>Price</Th><Th num>Enrolled</Th><Th num>In progress</Th><Th num>Completed</Th><Th num>Dropped</Th></tr></thead>
            <tbody>
              {courseStats.map(c => (
                <tr key={c.sis} className="hover:bg-surface-3/40">
                  <td className={td}>{c.name}</td>
                  <td className={td}><span className={c.pricing === 'Free' ? 'badge-ok' : 'badge-info'}>{c.pricing}</span></td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(c.enrolled)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(c.in_progress)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(c.completed)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{fmtNum(c.dropped)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-4 flex items-center gap-3">
          <h2 className="text-sm font-medium text-zinc-200">By learner</h2>
          <span className="text-xs text-zinc-500 tabular-nums">{fmtNum(learners.length)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><Th>Learner</Th><Th>Free course</Th><Th num>Paid enrolled</Th><Th num>Paid completed</Th><Th num>Leadership (of 6)</Th><Th num>Technical (of 6)</Th><Th num>Communication (of 6)</Th><Th>Microcertificate</Th></tr></thead>
            <tbody>
              {learners.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-zinc-500">No learners yet.</td></tr>}
              {learners.map(l => (
                <tr key={l.user_id} className="hover:bg-surface-3/40">
                  <td className={td}><Link href={`/person/${l.user_id}`} className={linkCls}>{l.name}</Link></td>
                  <td className={td}>{badge(l.free)}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{l.paid_enrolled}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{l.paid_completed}</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{l.done.leadership} / 6</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{l.done.technical} / 6</td>
                  <td className={clsx(td, 'text-right tabular-nums')}>{l.done.communication} / 6</td>
                  <td className={td}>{badge(l.microcert)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
            These numbers come from {fmtNum(config.enrollments_counted)} Canvas enrollments in the {fmtNum(data.courseStats.length)} Career Learning Academy courses,
            and today they are all test accounts, not real learners. {waiting} of the {metrics.length} measures (RFIs and extensions) are not stored in Canvas, so they stay blank until we can read CampusCE.
          </p>
          <p className="text-xs text-zinc-500">
            Free course used for the funnel{config.free_is_assumed ? ' (assumed, to be confirmed)' : ''}: {config.free_courses.join(', ') || 'none set'}. {config.free_note}
            Completion means the Canvas enrollment was concluded. A drop is a deactivated or removed enrollment. A time out is an enrollment
            whose access end date passed before completion.
          </p>
        </div>
      </div>

      <FreeVsPaid data={data} />

      <h2 className="text-sm font-medium text-zinc-200 pt-2">All reporting measures</h2>

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
