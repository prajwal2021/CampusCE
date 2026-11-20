'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { KeyRound, LogOut, Moon, Sun, X, Loader2, CheckCircle2, LayoutDashboard, Shield } from 'lucide-react';
import clsx from 'clsx';
import { get, post } from '@/lib/api';
import { useTheme } from '@/components/theme';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

function nameOf(user) {
  const local = String(user || '').split('@')[0];
  return local.split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ') || 'Account';
}
function initialsOf(user) {
  const parts = String(user || '').split('@')[0].split(/[._-]+/).filter(p => p.length > 1 || /[a-z]/i.test(p));
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function Avatar({ user, size = 'sm' }) {
  return (
    <span className={clsx('inline-flex items-center justify-center rounded-full bg-accent text-accent-fg font-semibold select-none shrink-0',
      size === 'lg' ? 'w-11 h-11 text-base' : 'w-8 h-8 text-xs')}>
      {initialsOf(user)}
    </span>
  );
}

/**
 * Profile button with a menu: who is signed in, light/dark theme, change password, sign out.
 * placement: 'down' for the top bar, 'up' for the bottom of the admin sidebar.
 */
export default function ProfileMenu({ placement = 'down', showName = false }) {
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const ref = useRef(null);

  useEffect(() => { get('/auth/me').then(setMe).catch(() => {}); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const signOut = async () => {
    try { await post('/auth/logout', {}); } catch {}
    window.location.href = `${BASE}/login`;
  };

  const inAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith(`${BASE}/admin`);
  const item = 'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-surface-3 hover:text-zinc-100 transition-colors';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile and settings"
        className={clsx('flex items-center gap-2.5 transition-colors',
          showName ? 'w-full rounded-xl px-2 py-1.5 hover:bg-nav-line/10' : 'rounded-full p-0.5 hover:ring-2 hover:ring-nav-accent/60')}
      >
        <Avatar user={me?.user} />
        {showName && (
          <span className="min-w-0 text-left leading-tight">
            <span className="block text-sm font-medium text-nav-fg truncate">{me ? nameOf(me.user) : ' '}</span>
            <span className="block text-[11px] text-nav-muted capitalize">{me?.role === 'admin' ? 'Administrator' : me ? 'Viewer' : ''}</span>
          </span>
        )}
      </button>

      {open && (
        <div role="menu"
          className={clsx('pop-in absolute z-40 w-72 rounded-2xl border border-surface-4 bg-surface-2 shadow-pop p-2',
            placement === 'up' ? 'bottom-full mb-2 left-0' : 'top-full mt-2 right-0')}>
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar user={me?.user} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100 truncate">{me ? nameOf(me.user) : 'Signed in'}</p>
              <p className="text-xs text-zinc-500 truncate">{me?.user}</p>
              <span className={clsx('mt-1', me?.role === 'admin' ? 'badge-info' : 'badge-ok')}>
                {me?.role === 'admin' ? <><Shield className="w-3 h-3" /> Administrator</> : 'Viewer'}
              </span>
            </div>
          </div>

          <div className="mx-1 my-1 border-t border-surface-4" />

          <div className="px-3 py-2">
            <p className="metric-label mb-2">Appearance</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-1 p-1" role="group" aria-label="Theme">
              {[{ v: 'light', label: 'Light', Icon: Sun }, { v: 'dark', label: 'Dark', Icon: Moon }].map(({ v, label, Icon }) => (
                <button key={v} onClick={() => setTheme(v)} aria-pressed={theme === v}
                  className={clsx('flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                    theme === v ? 'bg-surface-2 text-zinc-100 shadow-card' : 'text-zinc-500 hover:text-zinc-200')}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-1 my-1 border-t border-surface-4" />

          {me?.role === 'admin' && (
            <Link href={inAdmin ? '/' : '/admin'} className={item} onClick={() => setOpen(false)} role="menuitem">
              <LayoutDashboard className="w-4 h-4" /> {inAdmin ? 'Open overview' : 'Open admin panel'}
            </Link>
          )}
          <button className={item} onClick={() => { setOpen(false); setPwOpen(true); }} role="menuitem">
            <KeyRound className="w-4 h-4" /> Change password
          </button>
          <button className={item} onClick={signOut} role="menuitem">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}

      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function PasswordDialog({ onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const current = String(fd.get('current') || '');
    const next = String(fd.get('next') || '');
    const confirm = String(fd.get('confirm') || '');
    if (!current || !next) return setError('Enter your current and new password.');
    if (next.length < 8) return setError('The new password must be at least 8 characters.');
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await post('/auth/password', { current, next });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={e => e.stopPropagation()}
        className="pop-in w-full max-w-sm rounded-2xl border border-surface-4 bg-surface-2 shadow-pop p-6 space-y-4"
        role="dialog" aria-modal="true" aria-labelledby="pw-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="pw-title" className="text-lg font-semibold text-zinc-100">Change password</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Use at least 8 characters.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-surface-3" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <p className="flex items-center gap-2 text-sm text-emerald-400 py-4">
            <CheckCircle2 className="w-5 h-5" /> Password changed.
          </p>
        ) : (
          <>
            {[
              { name: 'current', label: 'Current password', auto: 'current-password' },
              { name: 'next', label: 'New password', auto: 'new-password' },
              { name: 'confirm', label: 'Confirm new password', auto: 'new-password' },
            ].map((f, i) => (
              <div key={f.name} className="space-y-1.5">
                <label htmlFor={`pw-${f.name}`} className="text-xs font-medium text-zinc-400">{f.label}</label>
                <input id={`pw-${f.name}`} name={f.name} type="password" autoComplete={f.auto} autoFocus={i === 0} className="input" />
              </div>
            ))}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
              <button type="submit" disabled={busy} className="btn-primary">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save password
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
