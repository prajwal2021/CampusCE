'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const LINKS = [
  { href: '/', label: 'Overview', exact: true },
  { href: '/programs', label: 'Programs', also: ['/group'] },
  { href: '/browse/courses', label: 'Courses', also: ['/course'] },
  { href: '/browse/students', label: 'Students', also: ['/person'] },
  { href: '/browse/instructors', label: 'Instructors' },
  { href: '/browse/sections', label: 'Sections', also: ['/section'] },
  { href: '/browse/enrollments', label: 'Enrollments' },
  { href: '/browse/assignments', label: 'Assignments', also: ['/assignment'] },
];

export default function TopNav() {
  const path = usePathname();
  const isActive = l => (l.exact ? path === l.href : [l.href, ...(l.also || [])].some(p => path.startsWith(p)));

  return (
    <nav className="flex items-stretch gap-1 overflow-x-auto self-stretch" aria-label="Main">
      {LINKS.map(l => {
        const active = isActive(l);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}
            className={clsx('relative flex items-center px-3 text-sm whitespace-nowrap transition-colors',
              active ? 'text-nav-fg font-semibold' : 'text-nav-muted hover:text-nav-fg')}>
            {l.label}
            <span className={clsx('absolute left-3 right-3 bottom-0 h-[3px] rounded-t-full bg-nav-accent transition-opacity',
              active ? 'opacity-100' : 'opacity-0')} />
          </Link>
        );
      })}
    </nav>
  );
}
