'use client';

import { LogOut } from 'lucide-react';
import { post } from '@/lib/api';

export default function SignOut() {
  const signOut = async () => {
    try { await post('/auth/logout', {}); } catch {}
    window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/login`;
  };
  return (
    <button onClick={signOut}
      className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-surface-3 transition-colors shrink-0">
      <LogOut className="w-4 h-4" /> Sign out
    </button>
  );
}
