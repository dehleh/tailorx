'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tailorx-pose-api-production.up.railway.app';

export default function Waitlist() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let aborted = false;
    fetch(`${API_URL}/v1/waitlist/stats`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!aborted && d && typeof d.count === 'number') setCount(d.count); })
      .catch(() => {});
    return () => { aborted = true; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!email || !email.includes('@')) {
      setMessage({ kind: 'err', text: 'Please enter a valid email.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/v1/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, company, role, useCase, source: 'landing' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || 'Could not join the waitlist.');
      }
      const data = await res.json();
      setMessage({
        kind: 'ok',
        text: data.alreadyJoined
          ? "You're already on the list — we'll be in touch soon."
          : "You're in. Check your inbox for a confirmation.",
      });
      setEmail(''); setName(''); setCompany(''); setRole(''); setUseCase('');
      if (count !== null && !data.alreadyJoined) setCount(count + 1);
    } catch (err: any) {
      setMessage({ kind: 'err', text: err.message || 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="waitlist" className="relative overflow-hidden bg-ink py-24 text-white">
      <div className="absolute inset-0 -z-10 opacity-30"
           style={{ background: 'radial-gradient(at 30% 20%, rgba(20,184,166,0.5) 0px, transparent 60%), radial-gradient(at 80% 80%, rgba(20,184,166,0.25) 0px, transparent 50%)' }} />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent">Early access</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-balance md:text-5xl">
            Be among the first brands to ship perfect fit.
          </h2>
          <p className="mt-5 max-w-md text-white/75">
            We&apos;re onboarding a small cohort of brands and ateliers each
            month. Tell us a little about you and we&apos;ll be in touch with a
            tailored pilot offer.
          </p>
          {count !== null && (
            <p className="mt-6 text-sm text-white/60">
              <span className="font-semibold text-accent">{count.toLocaleString()}</span>{' '}
              already on the list.
            </p>
          )}
        </div>
        <form onSubmit={onSubmit} className="rounded-2xl bg-white p-6 text-ink shadow-soft md:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" value={name} onChange={setName} placeholder="Ada Okafor" />
            <Field label="Work email *" value={email} onChange={setEmail} type="email" placeholder="ada@brand.com" required />
            <Field label="Company" value={company} onChange={setCompany} placeholder="Atelier 14" />
            <Field label="Role" value={role} onChange={setRole} placeholder="Founder" />
          </div>
          <label className="mt-4 block text-xs font-medium text-slate1">
            What problem are you trying to solve?
            <textarea
              value={useCase}
              onChange={e => setUseCase(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-mist bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="e.g. Reduce returns from size mismatch on PDPs."
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Request early access'}
          </button>
          {message && (
            <p
              role="status"
              className={
                'mt-4 rounded-lg px-3 py-2 text-sm ' +
                (message.kind === 'ok'
                  ? 'bg-mist text-ink'
                  : 'bg-red-50 text-red-700')
              }
            >
              {message.text}
            </p>
          )}
          <p className="mt-3 text-[11px] text-slate2">
            By submitting, you agree to be contacted about Tailor-X. We never share your email.
          </p>
        </form>
      </div>
    </section>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-medium text-slate1">
      {label}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-mist bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}
