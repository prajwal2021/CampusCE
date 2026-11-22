/**
 * Shared filters for the enrollment dashboard and the reports: scope, program, course, date range
 * and time grain, read from the query string. Values are validated here, so SQL built from them
 * only ever sees whitelisted keys or bound parameters.
 */
import { GROUPS, groupExpr, scopeCond } from '@/lib/portal';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const GRAINS = ['day', 'week', 'month', 'quarter', 'year'];

export function parseFilters(sp) {
  const iso = v => (ISO.test(v || '') && !Number.isNaN(Date.parse(v)) ? v : null);
  const course = parseInt(sp.get('course'));
  return {
    scope: sp.get('scope') === 'all' ? 'all' : 'ce',
    group: GROUPS[sp.get('group')] ? sp.get('group') : null,
    course: Number.isSafeInteger(course) ? course : null,
    from: iso(sp.get('from')),
    to: iso(sp.get('to')),
    grain: GRAINS.includes(sp.get('grain')) ? sp.get('grain') : 'month',
  };
}

/** Collects bound parameters: p.add(value) returns its placeholder ($1, $2...). */
export class Params {
  constructor() { this.values = []; }
  add(v) { this.values.push(v); return `$${this.values.length}`; }
}

/**
 * WHERE clause for student enrollments joined as e (enrollments) and c (courses).
 * range: { from, to } overrides the filter's dates (used for comparison periods); dates: false drops them.
 */
export function enrollWhere(f, p, { dates = true, range } = {}) {
  const w = [
    `e.type = 'StudentEnrollment'`,
    `e.workflow_state NOT IN ('deleted', 'rejected')`,
    `c.workflow_state <> 'deleted'`,
  ];
  if (scopeCond(f.scope)) w.push(scopeCond(f.scope));
  if (f.group) w.push(`${groupExpr('c')} = '${f.group}'`);
  if (f.course) w.push(`c.id = ${p.add(f.course)}`);
  const from = range ? range.from : f.from;
  const to = range ? range.to : f.to;
  if (dates && from) w.push(`e.created_at >= ${p.add(from)}::date`);
  if (dates && to) w.push(`e.created_at < ${p.add(to)}::date + 1`);
  return w.join(' AND ');
}

const DAY = 86400000;
const isoDay = d => new Date(d).toISOString().slice(0, 10);

/** The period just before [from, to], of the same length; or the same dates a year earlier. */
export function comparisonRange(f, mode = 'prev') {
  if (!f.from || !f.to) return null;
  const a = Date.parse(f.from), b = Date.parse(f.to);
  if (b < a) return null;
  if (mode === 'yoy') {
    const shift = d => { const x = new Date(d); x.setUTCFullYear(x.getUTCFullYear() - 1); return isoDay(x); };
    return { from: shift(a), to: shift(b) };
  }
  const len = b - a + DAY;
  return { from: isoDay(a - len), to: isoDay(a - DAY) };
}

export const IS_DONE = `(e.workflow_state = 'completed' OR e.completed_at IS NOT NULL)`;
export const DONE_AT = `coalesce(e.completed_at, CASE WHEN e.workflow_state = 'completed' THEN e.updated_at END)`;
export const STATE = `CASE WHEN ${IS_DONE} THEN 'Completed'
  WHEN e.workflow_state = 'active' THEN 'Active' WHEN e.workflow_state = 'inactive' THEN 'Dropped'
  WHEN e.workflow_state = 'invited' THEN 'Invited' ELSE initcap(e.workflow_state) END`;
