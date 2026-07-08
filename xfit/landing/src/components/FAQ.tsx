'use client';
import { useState } from 'react';

const ITEMS = [
  {
    q: 'How accurate are the measurements really?',
    a: 'Pilot scans return confidence-scored estimates. We benchmark each pilot against tape measurements and report mean absolute error by body part before making accuracy claims.',
  },
  {
    q: 'Do customers need to install an app?',
    a: 'Current pilots use the Tailor-X mobile app and branded invite flow. Mobile web and embedded SDK options are roadmap items for selected partners.',
  },
  {
    q: 'How is privacy handled?',
    a: 'Consent is captured upfront. Scan photos may be processed locally or by Tailor-X cloud processors, derived measurements persist, and retention/deletion rules are documented per pilot.',
  },
  {
    q: 'Can I plug it into my existing storefront?',
    a: 'The REST backend is available for pilot integrations. Shopify, WooCommerce, Magento, and webhook packages are planned based on pilot requirements.',
  },
  {
    q: 'What does the pilot include?',
    a: 'A branded portal, trial scan quota, size-chart mapping, a workshop with our team, and an accuracy benchmark against your real customer measurements.',
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="bg-white py-24">
      <div className="mx-auto max-w-3xl px-6">
        <p className="text-center text-xs uppercase tracking-widest text-accentDark">FAQ</p>
        <h2 className="mt-3 text-center font-display text-3xl font-bold text-ink md:text-5xl">
          Questions, answered.
        </h2>
        <div className="mt-12 divide-y divide-mist rounded-2xl border border-mist bg-white">
          {ITEMS.map((item, i) => (
            <FAQItem key={i} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="font-medium text-ink">{q}</span>
        <span className={'inline-flex h-6 w-6 items-center justify-center rounded-full bg-mist text-ink transition ' + (open ? 'rotate-45' : '')}>+</span>
      </button>
      {open && <p className="pb-5 pr-10 text-sm leading-relaxed text-slate1">{a}</p>}
    </div>
  );
}
