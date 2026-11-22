'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import AppNav from '@/components/AppNav';
import GlobalSearch from '@/components/GlobalSearch';
import { ScopeProvider, ScopeToggle, ProgramSelect } from '@/components/scope';

export default function PortalLayout({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <ScopeProvider>
      <div className="min-h-screen flex">
        <AppNav open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-16 bg-surface-2/90 backdrop-blur border-b border-surface-4">
            <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center gap-4">
              <button className="lg:hidden p-2 -ml-2 rounded-lg text-zinc-400 hover:bg-surface-3" onClick={() => setNavOpen(true)} aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </button>
              <GlobalSearch />
              <div className="ml-auto flex items-center gap-3 shrink-0">
                <ProgramSelect />
                <ScopeToggle />
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ScopeProvider>
  );
}
