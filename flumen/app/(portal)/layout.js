import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import SignOut from '@/components/SignOut';
import { ScopeProvider, ScopeToggle } from '@/components/scope';

const LINKS = [
  { href: '/programs', label: 'Programs' },
  { href: '/browse/courses', label: 'Courses' },
  { href: '/browse/students', label: 'Students' },
  { href: '/browse/instructors', label: 'Instructors' },
  { href: '/browse/sections', label: 'Sections' },
  { href: '/browse/enrollments', label: 'Enrollments' },
  { href: '/browse/assignments', label: 'Assignments' },
];

export default function PortalLayout({ children }) {
  return (
    <ScopeProvider>
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-surface-1/90 backdrop-blur border-b border-surface-4">
        <div className="w-full px-4 sm:px-6 lg:px-10 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <GraduationCap className="w-5 h-5 text-accent" />
            <span className="font-semibold text-zinc-100">CampusCE Overview</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {LINKS.map(l => (
              <Link key={l.href} href={l.href}
                className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 whitespace-nowrap transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ScopeToggle />
            <SignOut />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
    </ScopeProvider>
  );
}
