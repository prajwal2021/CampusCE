/**
 * Read-only definitions behind the public overview. Only the columns listed here
 * ever leave the server: names, course facts and progress. No emails, student IDs,
 * logins or IP addresses.
 */

const SUB_STUDENTS = `(SELECT count(*) FROM dbo.canvas_enrollments e WHERE e.course_id = c.id AND e.type = 'StudentEnrollment' AND e.workflow_state = 'active')`;
const SUB_TEACHERS = `(SELECT count(DISTINCT e.user_id) FROM dbo.canvas_enrollments e WHERE e.course_id = c.id AND e.type = 'TeacherEnrollment' AND e.workflow_state = 'active')`;

const COURSE_STATE = `CASE c.workflow_state WHEN 'available' THEN 'Published' WHEN 'claimed' THEN 'Unpublished' WHEN 'completed' THEN 'Concluded' ELSE c.workflow_state END`;
const ENROLL_STATE = `CASE e.workflow_state WHEN 'active' THEN 'Active' WHEN 'inactive' THEN 'Inactive' WHEN 'completed' THEN 'Completed' WHEN 'invited' THEN 'Invited' ELSE e.workflow_state END`;

/**
 * Program groups, derived from course names and Canvas accounts. Order matters:
 * a "CLA-MC01" course is CLA, not MC.
 */
export const GROUPS = {
  cla: {
    label: 'Career Learning Academy (new)',
    short: 'CLA',
    blurb: 'The new open-enrollment Career Learning Academy offerings created in CampusCE: Leadership, Technical Skills and Communication, each a microcertificate plus six short courses.',
    breakdownTitle: 'By track',
    breakdown: `CASE substr(c.sis_source_id, 2, 1) WHEN '0' THEN 'Leadership' WHEN '1' THEN 'Technical Skills' ELSE 'Communication' END`,
  },
  mc: {
    label: 'Microcertificates',
    short: 'MC / 10K',
    blurb: 'Sections coded MC1, MC2 and so on (the 10K program).',
    breakdownTitle: 'By section code',
    breakdown: `'MC' || ((regexp_match(c.name, '-MC([0-9]+)([^0-9]|$)', 'i'))[1])::int`,
  },
  ccfcs: {
    label: 'CCFCS',
    short: 'CCFCS',
    blurb: 'Career and college readiness courses.',
    breakdownTitle: 'By account',
    breakdown: `coalesce(c.account_desc, 'Unassigned')`,
  },
  other: {
    label: 'Everything else',
    short: 'Other',
    blurb: 'Flexible Learning courses, templates, sandboxes, development and migrated courses.',
    breakdownTitle: 'By account',
    breakdown: `coalesce(c.account_desc, 'Unassigned')`,
  },
};

export const groupExpr = (a = 'c') => `CASE
  WHEN ${a}.sis_source_id ~ '^9(0[0-6]|1[0-6]|2[0-6])[.]100[.]OPEN$' THEN 'cla'
  WHEN ${a}.name ~* '-MC[0-9]+([^0-9]|$)' OR ${a}.account_desc = '10K' THEN 'mc'
  WHEN ${a}.account_desc = 'CCFCS' OR ${a}.name ~* '^CCFCS' THEN 'ccfcs'
  ELSE 'other' END`;

/** CampusCE-provisioned courses carry a SIS id of the form <course>.<class>.<term>, e.g. 900.100.OPEN. */
export const CE_PATTERN = '^[0-9]+[.][0-9]+[.][A-Za-z0-9]+$';
export const scopeCond = (scope, a = 'c') => (scope === 'all' ? '' : `${a}.sis_source_id ~ '${CE_PATTERN}'`);

export const groupLabelExpr = (a = 'c') =>
  `CASE ${groupExpr(a)} ${Object.entries(GROUPS).map(([k, g]) => `WHEN '${k}' THEN '${g.label.replace(/'/g, "''")}'`).join(' ')} END`;

const personDerived = (type, group, scope) => `(
  SELECT u.id, u.name, u.sortable_name,
         count(*) AS enrollments,
         count(*) FILTER (WHERE e.workflow_state = 'active') AS active_enrollments,
         count(*) FILTER (WHERE e.workflow_state = 'inactive') AS inactive_enrollments,
         max(e.last_activity_at) AS last_activity
  FROM dbo.canvas_enrollments e
  JOIN dbo.canvas_users u ON u.id = e.user_id
  JOIN dbo.canvas_courses c ON c.id = e.course_id AND c.workflow_state <> 'deleted'
  WHERE e.type = '${type}' AND e.workflow_state NOT IN ('deleted', 'rejected')
    ${group ? `AND ${groupExpr('c')} = '${group}'` : ''}
    ${scopeCond(scope) ? `AND ${scopeCond(scope)}` : ''}
  GROUP BY u.id, u.name, u.sortable_name) p`;

const personType = (title, type, noun) => ({
  title,
  from: (group, scope) => personDerived(type, group, scope),
  where: 'TRUE',
  select: `p.id, p.name,
           CASE WHEN p.active_enrollments > 0 THEN 'Active' ELSE 'Inactive' END AS status,
           p.enrollments AS courses, p.active_enrollments AS active_courses,
           p.last_activity`,
  statusExpr: `CASE WHEN p.active_enrollments > 0 THEN 'active' ELSE 'inactive' END`,
  statuses: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
  search: ['p.name'],
  columns: [
    { key: 'name', label: noun },
    { key: 'status', label: 'Status', badge: true },
    { key: 'courses', label: 'Courses', num: true },
    { key: 'active_courses', label: 'Active courses', num: true },
    { key: 'last_activity', label: 'Last activity', date: true },
  ],
  sort: { name: 'p.sortable_name', status: 'status', courses: 'p.enrollments', active_courses: 'p.active_enrollments', last_activity: 'p.last_activity' },
  defaultSort: 'name',
  link: { kind: 'person', key: 'id' },
});

export const TYPES = {
  courses: {
    title: 'Courses',
    from: 'dbo.canvas_courses c',
    where: `c.workflow_state <> 'deleted'`,
    select: `c.id, c.name, c.course_code AS code, ${COURSE_STATE} AS status,
             ${groupExpr('c')} AS program_key, ${groupLabelExpr('c')} AS program,
             ${SUB_STUDENTS} AS students, ${SUB_TEACHERS} AS instructors, c.created_at AS created`,
    statusExpr: 'c.workflow_state',
    statuses: [
      { value: 'available', label: 'Published' },
      { value: 'claimed', label: 'Unpublished' },
      { value: 'completed', label: 'Concluded' },
    ],
    search: ['c.name', 'c.course_code'],
    columns: [
      { key: 'name', label: 'Course' },
      { key: 'program', label: 'Program', programLink: true },
      { key: 'status', label: 'Status', badge: true },
      { key: 'students', label: 'Students', num: true },
      { key: 'instructors', label: 'Instructors', num: true },
      { key: 'created', label: 'Created', date: true },
    ],
    sort: { name: 'c.name', program: 'program', status: 'status', students: 'students', instructors: 'instructors', created: 'c.created_at' },
    defaultSort: 'name',
    link: { kind: 'course', key: 'id' },
  },

  sections: {
    title: 'Sections',
    from: 'dbo.canvas_course_sections s JOIN dbo.canvas_courses c ON c.id = s.course_id',
    where: `s.workflow_state <> 'deleted' AND c.workflow_state <> 'deleted'`,
    select: `s.id, c.id AS course_id, s.name, c.name AS course,
             CASE s.workflow_state WHEN 'active' THEN 'Active' ELSE s.workflow_state END AS status,
             (SELECT count(*) FROM dbo.canvas_enrollments e WHERE e.course_section_id = s.id AND e.type = 'StudentEnrollment' AND e.workflow_state = 'active') AS students,
             s.created_at AS created`,
    statusExpr: 's.workflow_state',
    statuses: [{ value: 'active', label: 'Active' }],
    search: ['s.name', 'c.name'],
    columns: [
      { key: 'name', label: 'Section' },
      { key: 'course', label: 'Course', courseLink: true },
      { key: 'students', label: 'Students', num: true },
      { key: 'created', label: 'Created', date: true },
    ],
    sort: { name: 's.name', course: 'c.name', students: 'students', created: 's.created_at' },
    defaultSort: 'name',
    link: { kind: 'section', key: 'id' },
  },

  students: personType('Students', 'StudentEnrollment', 'Student'),
  instructors: personType('Instructors', 'TeacherEnrollment', 'Instructor'),

  enrollments: {
    title: 'Enrollments',
    from: `dbo.canvas_enrollments e
           JOIN dbo.canvas_users u ON u.id = e.user_id
           JOIN dbo.canvas_courses c ON c.id = e.course_id
           LEFT JOIN dbo.canvas_course_sections s ON s.id = e.course_section_id`,
    where: `e.type = 'StudentEnrollment' AND e.workflow_state NOT IN ('deleted', 'rejected') AND c.workflow_state <> 'deleted'`,
    select: `e.id, u.id AS user_id, c.id AS course_id, u.name AS student, c.name AS course, s.name AS section,
             ${ENROLL_STATE} AS status, e.created_at AS enrolled, e.last_activity_at AS last_activity`,
    statusExpr: 'e.workflow_state',
    statuses: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'completed', label: 'Completed' },
      { value: 'invited', label: 'Invited' },
    ],
    search: ['u.name', 'c.name', 's.name'],
    columns: [
      { key: 'student', label: 'Student' },
      { key: 'course', label: 'Course', courseLink: true },
      { key: 'section', label: 'Section' },
      { key: 'status', label: 'Status', badge: true },
      { key: 'enrolled', label: 'Enrolled', date: true },
      { key: 'last_activity', label: 'Last activity', date: true },
    ],
    sort: { student: 'u.sortable_name', course: 'c.name', section: 's.name', status: 'status', enrolled: 'e.created_at', last_activity: 'e.last_activity_at' },
    defaultSort: 'student',
    link: { kind: 'person', key: 'user_id' },
  },

  assignments: {
    title: 'Assignments',
    from: `dbo.canvas_assignments a JOIN dbo.canvas_courses c ON c.id = a.context_id AND a.context_type = 'Course'`,
    where: `a.workflow_state <> 'deleted' AND c.workflow_state <> 'deleted'`,
    select: `a.id, c.id AS course_id, a.title, c.name AS course,
             CASE a.workflow_state WHEN 'published' THEN 'Published' WHEN 'unpublished' THEN 'Unpublished' ELSE a.workflow_state END AS status,
             a.points_possible AS points, a.due_at AS due`,
    statusExpr: 'a.workflow_state',
    statuses: [{ value: 'published', label: 'Published' }, { value: 'unpublished', label: 'Unpublished' }],
    search: ['a.title', 'c.name'],
    columns: [
      { key: 'title', label: 'Assignment' },
      { key: 'course', label: 'Course', courseLink: true },
      { key: 'status', label: 'Status', badge: true },
      { key: 'points', label: 'Points', num: true },
      { key: 'due', label: 'Due', date: true },
    ],
    sort: { title: 'a.title', course: 'c.name', status: 'status', points: 'a.points_possible', due: 'a.due_at' },
    defaultSort: 'due',
    defaultDir: 'desc',
    link: { kind: 'assignment', key: 'id' },
  },
};

export const escapeLike = s => s.replace(/[\\%_]/g, m => '\\' + m);

/**
 * Career Learning Academy offerings created in CampusCE. The SIS id is the CampusCE SKU:
 * 90x Leadership, 91x Technical Skills, 92x Communication; x0 is the microcertificate, x1 to x6 the short courses.
 */
export const CLA_TRACKS = [
  { key: 'leadership', label: 'Leadership for the Workplace', digit: '0' },
  { key: 'technical', label: 'Technical Skills for the Workplace', digit: '1' },
  { key: 'communication', label: 'Communication for the Workplace', digit: '2' },
];
export const trackOfSku = sis => CLA_TRACKS.find(t => t.digit === String(sis)[1]) || null;

const E = (sis, canvas_id, name) => ({ sis, canvas_id, name, kind: sis[2] === '0' ? 'Microcertificate' : 'Short course', track: trackOfSku(sis).key });
export const CLA_EXPECTED = [
  E('900.100.OPEN', 1678, 'Leadership for the Workplace (CLAMC-01)'),
  E('901.100.OPEN', 1683, 'Leadership for the Workplace: Putting Your People First'),
  E('902.100.OPEN', 1679, 'Leadership for the Workplace: The Role of Foresight'),
  E('903.100.OPEN', 1680, 'Leadership for the Workplace: The Role of Character'),
  E('904.100.OPEN', 1681, 'Leadership for the Workplace: The Leadership Triangle'),
  E('905.100.OPEN', 1682, 'Leadership for the Workplace: Skilled Collaboration'),
  E('906.100.OPEN', 1684, 'Leadership for the Workplace: Leadership as Service'),
  E('910.100.OPEN', 1690, 'Technical Skills for the Workplace: AI (CLAMC-01)'),
  E('911.100.OPEN', 1685, 'Technical Skills for the Workplace: Introduction to AI'),
  E('912.100.OPEN', 1686, 'Technical Skills for the Workplace: AI in the Workplace'),
  E('913.100.OPEN', 1691, 'Technical Skills for the Workplace: Advanced AI in the Workplace'),
  E('914.100.OPEN', 1687, 'Technical Skills for the Workplace: Applications for AI in Business'),
  E('915.100.OPEN', 1692, 'Technical Skills for the Workplace: Advanced AI Applications in Business'),
  E('916.100.OPEN', 1689, 'Technical Skills for the Workplace: Coding With AI'),
  E('920.100.OPEN', 1699, 'Communication for the Workplace (CLAMC-01)'),
  E('921.100.OPEN', 1694, 'Communication for the Workplace: The Big Picture: Good Communication is Good for Business'),
  E('922.100.OPEN', 1693, 'Communication for the Workplace: Workplace writing and what makes it work'),
  E('923.100.OPEN', 1695, 'Communication for the Workplace: Speaking on the job'),
  E('924.100.OPEN', 1696, 'Communication for the Workplace: Communicating with a team'),
  E('925.100.OPEN', 1697, 'Communication for the Workplace: Communicating with clients, customers, and partners'),
  E('926.100.OPEN', 1698, 'Communication for the Workplace: Navigating the tricky parts'),
];

/** Free courses, as confirmed by the program team. Everything else is paid. */
export const CLA_FREE_SKUS = ['901.100.OPEN', '906.100.OPEN', '911.100.OPEN', '921.100.OPEN'];
export const CLA_MC_SKUS = CLA_EXPECTED.filter(e => e.kind === 'Microcertificate').map(e => e.sis);
export const CLA_CAREER_SKUS = []; // no career certificate courses exist yet
