import Link from 'next/link';
import { Compass, Home, FileBarChart2, Users } from 'lucide-react';

export const metadata = { title: 'Page not found · CampusCE Analytics' };

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-0">
      <div className="card max-w-md w-full text-center py-10">
        <span className="mx-auto w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
          <Compass className="w-6 h-6" />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-accent">404</p>
        <h1 className="page-title mt-1">This page doesn’t exist</h1>
        <p className="page-sub">The link may be old or mistyped. Admin pages now live under /admin.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/" className="btn-primary"><Home className="w-4 h-4" /> Home</Link>
          <Link href="/enrollments" className="btn-outline"><Users className="w-4 h-4" /> Enrollments</Link>
          <Link href="/reports" className="btn-outline"><FileBarChart2 className="w-4 h-4" /> Reports</Link>
        </div>
      </div>
    </div>
  );
}
