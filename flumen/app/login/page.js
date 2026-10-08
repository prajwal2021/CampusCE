'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/api';
import { GraduationCap, Loader2, Lock, User } from 'lucide-react';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
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

  const field = 'w-full pl-9 pr-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-accent/50';

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-5">
      <div className="flex items-center gap-2.5">
        <GraduationCap className="w-6 h-6 text-accent" />
        <div className="leading-tight">
          <p className="text-lg font-semibold text-zinc-100">CampusCE</p>
          <p className="text-xs text-zinc-500">Sign in to continue</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="username" className="text-xs font-medium text-zinc-400">Username</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input id="username" type="text" autoFocus autoComplete="username" autoCapitalize="none"
            value={username} onChange={e => setUsername(e.target.value)} className={field} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-medium text-zinc-400">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input id="password" type="password" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} className={field} />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !username || !password} className="btn-primary w-full justify-center">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Sign in
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
