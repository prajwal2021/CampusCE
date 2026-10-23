import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { CLA_EXPECTED, CLA_FREE_SKUS, CLA_MC_SKUS, CLA_CAREER_SKUS, CLA_TRACKS, trackOfSku } from '@/lib/portal';

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

    /* ---- free vs paid layer ---- */
    const shortOf = t => CLA_EXPECTED.filter(e => e.track === t.key && e.kind === 'Short course').map(e => e.sis);
    const live = rows.filter(r => r.state !== 'deleted');
    const byUser = new Map();
    for (const r of live) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, { user_id: r.user_id, name: r.name, rows: [] });
      byUser.get(r.user_id).rows.push(r);
    }
    const learners = [...byUser.values()].map(u => {
      const f = u.rows.find(r => r.free);
      const paid = u.rows.filter(r => !r.free);
      const mcRow = u.rows.find(r => r.mc);
      const firstFree = u.rows.filter(r => r.free).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
      const paidAfterFree = firstFree ? paid.filter(p => new Date(p.created_at).getTime() >= new Date(firstFree.created_at).getTime()) : [];
      const done = {};
      for (const t of CLA_TRACKS) {
        const six = shortOf(t);
        done[t.key] = six.filter(s => u.rows.some(r => r.sis === s && r.done)).length;
      }
      return {
        user_id: u.user_id, name: u.name,
        free: f ? (u.rows.some(r => r.free && r.done) ? 'Completed' : 'Enrolled') : 'No',
        paid_enrolled: paid.length,
        paid_completed: paid.filter(p => p.done).length,
        done,
        microcert: mcRow ? (u.rows.some(r => r.mc && r.done) ? 'Completed' : 'Enrolled') : 'No',
        took_free_then_paid: !!f && paidAfterFree.length > 0,
        free_only: !!f && paid.length === 0,
        paid_no_free: !f && paid.length > 0,
        all_six: Object.fromEntries(CLA_TRACKS.map(t => [t.key, shortOf(t).length > 0 && done[t.key] === shortOf(t).length])),
        // per track: free course taken, and any paid course in the same track
        track: Object.fromEntries(CLA_TRACKS.map(t => {
          const inT = u.rows.filter(r => trackOfSku(r.sis)?.key === t.key);
          const tf = inT.some(r => r.free);
          const tp = inT.some(r => !r.free);
          return [t.key, { free: tf, paid: tp }];
        })),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const seg = (key, label, note, pred) => {
      const list = learners.filter(pred);
      return { key, label, note, count: list.length, people: list.map(l => ({ user_id: l.user_id, name: l.name })).slice(0, 300) };
    };
    const segments = [
      seg('free_only', 'Free course only', 'Enrolled in the free course and in no paid course.', l => l.free_only),
      seg('free_then_paid', 'Free course, then a paid course', 'Enrolled in the free course, then enrolled in at least one paid course.', l => l.took_free_then_paid),
      seg('paid_no_free', 'Paid course without the free course', 'Went straight to a paid course.', l => l.paid_no_free),
      ...CLA_TRACKS.map(t => seg(`all_six_${t.key}`, `Completed all 6 ${t.label.split(' for ')[0]} short courses`, `Concluded all six ${t.label} short courses.`, l => l.all_six[t.key])),
    ];
    const trackStats = CLA_TRACKS.map(t => {
      const ls = learners.filter(l => l.track[t.key].free || l.track[t.key].paid);
      const freeL = learners.filter(l => l.track[t.key].free);
      return {
        key: t.key, label: t.label,
        learners: ls.length,
        free_learners: freeL.length,
        free_then_paid: freeL.filter(l => l.track[t.key].paid).length,
        free_only: freeL.filter(l => !l.track[t.key].paid).length,
        paid_no_free: ls.filter(l => !l.track[t.key].free).length,
        completed_all_six: learners.filter(l => l.all_six[t.key]).length,
      };
    });

    const courseStats = CLA_EXPECTED.map(e => {
      const rs = rows.filter(r => r.sis === e.sis);
      const liveRs = rs.filter(r => r.state !== 'deleted');
      return {
        sis: e.sis, name: e.name, kind: e.kind, track: e.track,
        pricing: CLA_FREE_SKUS.includes(e.sis) ? 'Free' : 'Paid',
        enrolled: liveRs.length,
        completed: liveRs.filter(r => r.done).length,
        in_progress: liveRs.filter(r => !r.done && r.state === 'active').length,
        dropped: rs.filter(r => r.dropped).length,
      };
    });
    const sum = (list, k) => list.reduce((s, c) => s + c[k], 0);
    const pricing = ['Free', 'Paid'].map(p => {
      const cs = courseStats.filter(c => c.pricing === p);
      return { pricing: p, courses: cs.length, enrolled: sum(cs, 'enrolled'), completed: sum(cs, 'completed'), in_progress: sum(cs, 'in_progress'), dropped: sum(cs, 'dropped') };
    });
    const freeLearners = learners.filter(l => l.free !== 'No').length;
    const funnel = {
      free_learners: freeLearners,
      free_completed: learners.filter(l => l.free === 'Completed').length,
      free_then_paid: segments[1].count,
      free_only: segments[0].count,
      rate_free_to_paid: freeLearners ? Math.round((100 * segments[1].count) / freeLearners) : null,
      total_learners: learners.length,
    };

    const m = (key, group, label, list, note, opts = {}) => ({
      key, group, label, note,
      status: opts.unavailable ? 'needs_campusce' : 'canvas',
      value: opts.unavailable ? null : (opts.count ?? uniq(list).length),
      people: opts.unavailable ? [] : people(list),
      need: opts.need || null,
    });
    const rfi = 'RFIs are not in Canvas, and none of the CampusCE views we can see holds them. The closest are Students.InterestArea and Registrations.MarketingCode. Ask CampusCE where RFIs are stored.';
    const ext = 'Not recorded in Canvas. In CampusCE it would come from Registrations.AccessEndDate compared with Sections.AccessDays, or from extension fees in FeeDiscount. Needs CampusCE view access.';

    const pay = 'Payment status is recorded in CampusCE, including cheques that staff mark as paid. Canvas has no payment data. It would come from the Orders view (OrderStatus, BalanceDue, TotalPaid) and Transactions (PayType, PayStatus, PaidDate). Needs CampusCE view access.';

    const metrics = [
      m('unpaid_enrolled', 'Payments', 'Enrolled but not yet paid', [], 'People enrolled in a paid course whose order still has a balance due.', { unavailable: true, need: pay }),
      m('paid_enrolled', 'Payments', 'Enrolled and paid', [], 'People enrolled in a paid course whose order is paid in full, by card or cheque.', { unavailable: true, need: pay }),
      m('pay_trend', 'Payments', 'Enrollment and payment trend', [], 'Enrollments and payments per week, so a gap between the two is visible at a glance.', { unavailable: true, need: pay }),
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

    const SRC = { free_signups: 'CampusCE', conv_additional: 'CampusCE', conv_mc: 'CampusCE', conv_career: 'CampusCE', rfi_count: 'Smartsheet', rfi_conv: 'Smartsheet', ext_granted: 'CampusCE', ext_completed: 'CampusCE', ext_timedout: 'CampusCE', unpaid_enrolled: 'CampusCE', paid_enrolled: 'CampusCE', pay_trend: 'CampusCE' };
    const NEED = {
      rfi_count: 'RFIs are logged in the team's Smartsheet RFI sheet. Needs a read-only Smartsheet token or an export of the sheet.',
      rfi_conv: 'RFIs are logged in the team's Smartsheet RFI sheet. Matching each RFI to an enrollment needs a person column (such as email) in the sheet.',
      ext_granted: 'Extensions arrive by call or email to the Career Learning Academy inbox and David extends the course in CampusCE, so they are not visible in Canvas. Needs CampusCE view access (access end date changes).',
      ext_completed: 'Same source as extensions granted: CampusCE access end dates. Needs CampusCE view access.',
      ext_timedout: 'Same source as extensions granted: CampusCE access end dates. Needs CampusCE view access.',
    };
    for (const mm of metrics) { mm.source = SRC[mm.key] || 'Canvas'; if (NEED[mm.key]) mm.need = NEED[mm.key]; mm.interim = mm.status === 'canvas' && mm.source !== 'Canvas'; }

    const name = sis => CLA_EXPECTED.find(e => e.sis === sis)?.name || sis;
    return NextResponse.json({
      funnel, segments, trackStats, courseStats, pricing, learners,
      metrics,
      config: {
        free_courses: CLA_FREE_SKUS.map(name),
        free_is_assumed: false,
        free_note: 'Free courses, as confirmed by the program team: Putting Your People First, Leadership as Service, Introduction to AI and The Big Picture (Communication). Canvas has no free or paid flag, so this is set by hand; CampusCE would mark it as tuition of $0 once view access is available.',
        enrollments_counted: rows.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load reporting right now.' }, { status: 500 });
  }
}
