'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Home, Users, FileBarChart2, Layers, BookOpen, GraduationCap, UserSquare2, LayoutList, ClipboardList, ListChecks, X,
} from 'lucide-react';
import ProfileMenu from '@/components/ProfileMenu';

const SECTIONS = [
  {
    items: [
      { href: '/', label: 'Home', icon: Home, exact: true },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/enrollments', label: 'Enrollments', icon: Users },
      { href: '/reports', label: 'Reports', icon: FileBarChart2 },
      { href: '/programs', label: 'Programs', icon: Layers, also: ['/group'] },
    ],
  },
  {
    title: 'Directory',
    items: [
      { href: '/browse/courses', label: 'Courses', icon: BookOpen, also: ['/course'] },
      { href: '/browse/students', label: 'Students', icon: GraduationCap, also: ['/person'] },
      { href: '/browse/instructors', label: 'Instructors', icon: UserSquare2 },
      { href: '/browse/sections', label: 'Sections', icon: LayoutList, also: ['/section'] },
      { href: '/browse/enrollments', label: 'Enrollment records', icon: ListChecks },
      { href: '/browse/assignments', label: 'Assignments', icon: ClipboardList, also: ['/assignment'] },
    ],
  },
];

export default function AppNav({ open, onClose }) {
  const path = usePathname();
  const isActive = l => (l.exact ? path === l.href : [l.href, ...(l.also || [])].some(p => path === p || path.startsWith(p + '/')));

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside className={clsx(
        'fixed lg:sticky top-0 left-0 z-50 h-screen w-64 shrink-0 bg-nav text-nav-fg flex flex-col transition-transform lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="h-16 flex items-center gap-3 px-5 border-b border-nav-line/10">
          <span className="w-9 h-9 rounded-xl bg-nav-accent flex items-center justify-center shadow-sm">
            <GraduationCap className="w-5 h-5 text-white" />
          </span>
          <Link href="/" className="leading-tight" onClick={onClose}>
            <span className="block font-semibold tracking-tight">CampusCE</span>
            <span className="block text-[10px] uppercase tracking-[0.16em] text-nav-muted">Analytics</span>
          </Link>
          <button className="ml-auto lg:hidden text-nav-muted hover:text-nav-fg" onClick={onClose} aria-label="Close menu"><X className="w-5 h-5" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Main">
          {SECTIONS.map((s, si) => (
            <div key={si}>
              {s.title && <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-nav-muted/80">{s.title}</p>}
              <ul className="space-y-0.5">
                {s.items.map(l => {
                  const active = isActive(l);
                  const Icon = l.icon;
                  return (
                    <li key={l.href}>
                      <Link href={l.href} onClick={onClose} aria-current={active ? 'page' : undefined}
                        className={clsx('group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          active ? 'bg-nav-line/10 text-nav-fg font-semibold' : 'text-nav-muted hover:text-nav-fg hover:bg-nav-line/5')}>
                        <Icon className={clsx('w-[18px] h-[18px] shrink-0', active ? 'text-nav-accent' : 'text-nav-muted group-hover:text-nav-fg')} />
                        {l.label}
                        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-nav-accent" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-nav-line/10">
          <ProfileMenu placement="up" showName />
        </div>
      </aside>
    </>
  );
}
