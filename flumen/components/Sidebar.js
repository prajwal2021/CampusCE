'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, GitBranch, ArrowLeftRight, Activity, Droplets } from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { href: '/flumen',            label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/flumen/data',       label: 'Data',       icon: Database },
  { href: '/flumen/topology',   label: 'Topology',   icon: GitBranch },
  { href: '/flumen/comparison', label: 'Comparison', icon: ArrowLeftRight },
  { href: '/flumen/activity',   label: 'Activity',   icon: Activity },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 bg-surface-1 border-r border-surface-4 flex flex-col">
      {/* Brand */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-surface-4">
        <Droplets className="w-6 h-6 text-accent" />
        <span className="text-lg font-semibold tracking-tight text-zinc-100">Flumen</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/flumen' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-zinc-400 hover:bg-surface-3 hover:text-zinc-200'
              )}
            >
              <Icon className="w-4.5 h-4.5" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-surface-4">
        <p className="text-[11px] text-zinc-600">CampusCE Pipeline</p>
        <p className="text-[11px] text-zinc-600">TTU OIT</p>
      </div>
    </aside>
  );
}
