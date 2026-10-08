'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, GitBranch, ArrowLeftRight, Activity, Droplets, TerminalSquare, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { post } from '@/lib/api';

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

  const signOut = async () => {
    try { await post('/auth/logout', {}); } catch {}
    window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/login`;
  };

  return (
    <aside className="w-56 flex-shrink-0 bg-surface-1 border-r border-surface-4 flex flex-col">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-surface-4">
        <Droplets className="w-6 h-6 text-accent" />
        <div className="leading-tight">
          <span className="block text-lg font-semibold tracking-tight text-zinc-100">Flumen</span>
          <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Admin</span>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
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

      <div className="px-3 py-3 border-t border-surface-4">
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:bg-surface-3 hover:text-zinc-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
        <p className="px-3 pt-2 text-[11px] text-zinc-600">CampusCE Pipeline · TTU OIT</p>
      </div>
    </aside>
  );
}
