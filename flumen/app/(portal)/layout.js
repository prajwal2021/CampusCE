import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import SignOut from '@/components/SignOut';

const LINKS = [
  { href: '/browse/courses', label: 'Courses' },
  { href: '/browse/students', label: 'Students' },
  { href: '/browse/instructors', label: 'Instructors' },
  { href: '/browse/sections', label: 'Sections' },
  { href: '/browse/assignments', label: 'Assignments' },
];

export default function PortalLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-surface-1/90 backdrop-blur border-b border-surface-4">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
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
          <SignOut />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
