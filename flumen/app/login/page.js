'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/api';
import { GraduationCap, Loader2, Lock, User } from 'lucide-react';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');
    if (!username || !password) { setError('Enter your username and password.'); return; }
    setBusy(true);
    setError(null);
    try {
      const { role } = await post('/auth/login', { username, password });
      const next = params.get('next') || '';
      const safe = next.startsWith('/') && !next.startsWith('//') ? next : '';
      const target = role === 'admin' ? (safe || '/admin') : (safe.startsWith('/admin') ? '/' : (safe || '/'));
      window.location.href = `${BASE}${target}`;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const field = 'input pl-9 py-2.5';

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-5">
      <div>
        <div className="flex items-center gap-2.5 lg:hidden mb-6">
          <span className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-accent" />
          </span>
          <p className="text-lg font-semibold text-zinc-100">CampusCE</p>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Welcome back</h1>
        <p className="text-sm text-zinc-500 mt-1">Sign in with your username or TTU email.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="username" className="text-xs font-medium text-zinc-400">Username</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input id="username" name="username" type="text" autoFocus autoComplete="username" autoCapitalize="none"
            className={field} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-medium text-zinc-400">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input id="password" name="password" type="password" autoComplete="current-password"
            className={field} />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-2.5">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Sign in
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-nav text-nav-fg p-12 relative overflow-hidden">
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full bg-nav-accent/10" />
        <div className="absolute right-24 top-32 w-40 h-40 rounded-full border-[18px] border-nav-accent/15" />
        <div className="flex items-center gap-3 relative">
          <span className="w-10 h-10 rounded-xl bg-nav-accent/15 flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-nav-accent" />
          </span>
          <span className="text-xl font-semibold tracking-tight">CampusCE</span>
        </div>
        <div className="relative max-w-md">
          <p className="text-4xl font-bold leading-tight tracking-tight">
            Courses, learners and progress, <span className="text-nav-accent">in one place.</span>
          </p>
          <p className="text-nav-muted mt-4">Enrollment, completion and program reporting for the CampusCE team.</p>
        </div>
        <p className="text-xs text-nav-muted relative">Texas Tech University · CampusCE Overview</p>
      </aside>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
