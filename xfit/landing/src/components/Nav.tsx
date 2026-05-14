'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://tailorx-admin-production.up.railway.app';
  return (
    <header className="sticky top-0 z-40 w-full border-b border-mist/60 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="#top" className="flex items-center gap-2 font-display text-xl font-bold text-ink">
          <span className="inline-block h-7 w-7 rounded-md bg-gradient-to-br from-accent to-ink" aria-hidden />
          Tailor-X
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate1 md:flex">
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#use-cases" className="hover:text-ink">Use cases</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <a href="#faq" className="hover:text-ink">FAQ</a>
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <a href={adminUrl} className="text-sm text-slate1 hover:text-ink">Sign in</a>
          <a
            href="#waitlist"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-ink/90"
          >
            Join waitlist
          </a>
        </div>
        <button
          aria-label="Toggle menu"
          className="md:hidden rounded-md p-2 text-ink"
          onClick={() => setOpen(v => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="border-t border-mist/60 bg-white px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm">
            <a href="#features" onClick={() => setOpen(false)}>Features</a>
            <a href="#how" onClick={() => setOpen(false)}>How it works</a>
            <a href="#use-cases" onClick={() => setOpen(false)}>Use cases</a>
            <a href="#pricing" onClick={() => setOpen(false)}>Pricing</a>
            <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
            <a href={adminUrl}>Sign in</a>
            <a href="#waitlist" onClick={() => setOpen(false)} className="rounded-full bg-ink px-4 py-2 text-center text-white">Join waitlist</a>
          </nav>
        </div>
      )}
    </header>
  );
}
