'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, GitBranch, ArrowLeftRight, Activity, Droplets, TerminalSquare } from 'lucide-react';
import clsx from 'clsx';
import ProfileMenu from '@/components/ProfileMenu';

const NAV = [
  { href: '/admin',            label: 'Dashboard',  icon: LayoutDashboard, exact: true },
  { href: '/admin/data',       label: 'Data',       icon: Database },
  { href: '/admin/query',      label: 'Query',      icon: TerminalSquare },
  { href: '/admin/topology',   label: 'Topology',   icon: GitBranch },
  { href: '/admin/comparison', label: 'Comparison', icon: ArrowLeftRight },
  { href: '/admin/activity',   label: 'Activity',   icon: Activity },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 bg-nav text-nav-fg border-r border-nav-line/10 flex flex-col">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-nav-line/10">
        <span className="w-9 h-9 rounded-xl bg-nav-accent/15 flex items-center justify-center">
          <Droplets className="w-5 h-5 text-nav-accent" />
        </span>
        <div className="leading-tight">
          <span className="block text-base font-semibold tracking-tight">Flumen</span>
          <span className="block text-[10px] uppercase tracking-[0.14em] text-nav-muted">Admin</span>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-nav-line/10 text-nav-fg'
                  : 'text-nav-muted hover:bg-nav-line/5 hover:text-nav-fg'
              )}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-nav-accent" />}
              <Icon className={clsx('w-[18px] h-[18px]', active && 'text-nav-accent')} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-nav-line/10">
        <ProfileMenu placement="up" showName />
        <p className="px-2 pt-2 text-[11px] text-nav-muted/70">CampusCE Pipeline · TTU OIT</p>
      </div>
    </aside>
  );
}
