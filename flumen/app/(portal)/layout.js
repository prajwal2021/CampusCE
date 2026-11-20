import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import TopNav from '@/components/TopNav';
import ProfileMenu from '@/components/ProfileMenu';
import { ScopeProvider, ScopeToggle } from '@/components/scope';

export default function PortalLayout({ children }) {
  return (
    <ScopeProvider>
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-nav text-nav-fg border-b border-nav-line/10 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-10 h-16 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-nav-accent/15 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-nav-accent" />
            </span>
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight">CampusCE</span>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-nav-muted">Overview</span>
            </span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-4 shrink-0">
            <ScopeToggle />
            <ProfileMenu />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
    </ScopeProvider>
  );
}
