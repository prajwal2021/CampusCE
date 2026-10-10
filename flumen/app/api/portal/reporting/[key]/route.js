import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { CLA_EXPECTED, CLA_FREE_SKUS, CLA_MC_SKUS, CLA_CAREER_SKUS } from '@/lib/portal';

export const dynamic = 'force-dynamic';

const uniq = list => [...new Map(list.map(r => [r.user_id, r])).values()];
const people = list => uniq(list).map(r => ({ user_id: r.user_id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300);

/**
 * Career Learning Academy reporting. Everything here is derived from Canvas enrollments of the
 * announced offerings; items that only CampusCE records (RFIs, extensions) are returned unavailable.
 */
export async function GET(request, { params }) {
  try {
    if (params.key !== 'cla') return NextResponse.json({ error: 'Reporting is not set up for this program' }, { status: 404 });

    const res = await q(
      `SELECT e.id, e.user_id, u.name, e.workflow_state AS state, e.created_at, e.updated_at, e.completed_at, e.end_at,
              c.sis_source_id AS sis
       FROM dbo.canvas_enrollments e
       JOIN dbo.canvas_courses c ON c.id = e.course_id AND c.workflow_state <> 'deleted'
       JOIN dbo.canvas_users u ON u.id = e.user_id
       WHERE c.sis_source_id = ANY($1) AND e.type = 'StudentEnrollment' AND e.workflow_state <> 'rejected'`,
      [CLA_EXPECTED.map(e => e.sis)]);

    const now = Date.now();
    const rows = res.rows.map(r => {
      const free = CLA_FREE_SKUS.includes(r.sis);
      const mc = CLA_MC_SKUS.includes(r.sis);
      const career = CLA_CAREER_SKUS.includes(r.sis);
      return {
        ...r, free, mc, career, short: !free && !mc && !career,
        done: r.state === 'completed' || !!r.completed_at,
        dropped: r.state === 'deleted' || r.state === 'inactive',
        doneAt: new Date(r.completed_at || r.updated_at).getTime(),
      };
    });

    const free = rows.filter(r => r.free);
    const freeDone = free.filter(r => r.done);
    const convertedTo = pred => freeDone.filter(f =>
      rows.some(o => o.user_id === f.user_id && !o.free && o.state !== 'deleted' && pred(o) && new Date(o.created_at).getTime() >= f.doneAt));

    const hasEndDates = rows.some(r => r.end_at);
    const timedOut = hasEndDates ? rows.filter(r => !r.done && r.end_at && new Date(r.end_at).getTime() < now) : [];
    const drops = rows.filter(r => r.dropped);

    const m = (key, group, label, list, note, opts = {}) => ({
      key, group, label, note,
      status: opts.unavailable ? 'needs_campusce' : 'canvas',
      value: opts.unavailable ? null : (opts.count ?? uniq(list).length),
      people: opts.unavailable ? [] : people(list),
      need: opts.need || null,
    });
    const rfi = 'The RFI (request for information) list lives in CampusCE, not Canvas.';
    const ext = 'Extensions are granted in CampusCE and are not visible in Canvas.';

    const metrics = [
      m('free_signups', 'Free course', 'Free course sign-ups', free, 'People enrolled in the free course.'),
      m('free_completions', 'Free course', 'Free course completions', freeDone, 'People who finished the free course.'),
      m('conv_additional', 'Free course', 'Free course conversions: additional course', convertedTo(() => true), 'Finished the free course, then signed up for another course.'),
      m('conv_mc', 'Free course', 'Free course conversions: microcertificate', convertedTo(o => o.mc), 'Finished the free course, then signed up for the microcertificate.'),
      m('conv_career', 'Free course', 'Free course conversions: career certificate', convertedTo(o => o.career), CLA_CAREER_SKUS.length ? 'Finished the free course, then signed up for the career certificate.' : 'No career certificate course has been created yet.'),

      m('rfi_count', 'Interest', 'RFI count', [], 'Requests for information received.', { unavailable: true, need: rfi }),
      m('rfi_conv', 'Interest', 'RFI conversion to an enrollment', [], 'RFIs that went on to enroll.', { unavailable: true, need: rfi }),

      m('comp_short', 'Completions', 'Short course completions', rows.filter(r => r.short && r.done), 'People who finished a paid short course.'),
      m('comp_mc', 'Completions', 'Microcertificate completions', rows.filter(r => r.mc && r.done), 'People who finished the microcertificate.'),
      m('comp_career', 'Completions', 'Career certificate completions', rows.filter(r => r.career && r.done), CLA_CAREER_SKUS.length ? 'People who finished the career certificate.' : 'No career certificate course has been created yet.'),

      m('drops', 'Retention', 'Drops', drops, 'Enrollments that were deactivated or removed.', { count: drops.length }),
      hasEndDates
        ? m('timeouts', 'Retention', 'Time out count', timedOut, 'Enrollments whose access end date passed before completion.', { count: timedOut.length })
        : m('timeouts', 'Retention', 'Time out count', [], 'Enrollments whose access end date passed before completion.', { unavailable: true, need: 'No access end dates are present in Canvas yet.' }),
      m('ext_granted', 'Retention', 'Extensions granted', [], 'Access extensions given to enrolled students.', { unavailable: true, need: ext }),
      m('ext_completed', 'Retention', 'Extensions granted and completed', [], 'Students with an extension who then finished.', { unavailable: true, need: ext }),
      m('ext_timedout', 'Retention', 'Extensions granted and timed out', [], 'Students with an extension who still ran out of time.', { unavailable: true, need: ext }),
    ];

    const name = sis => CLA_EXPECTED.find(e => e.sis === sis)?.name || sis;
    return NextResponse.json({
      metrics,
      config: {
        free_courses: CLA_FREE_SKUS.map(name),
        free_is_assumed: true,
        enrollments_counted: rows.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load reporting right now.' }, { status: 500 });
  }
}
