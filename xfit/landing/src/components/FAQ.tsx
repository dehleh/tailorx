'use client';
import { useState } from 'react';

const ITEMS = [
  {
    q: 'How accurate are the measurements really?',
    a: 'Our pipeline targets ±1.2 cm on key circumferences (chest, waist, hip) when calibration and lighting guidance are followed. Accuracy improves further with multi-pose capture, which is the default.',
  },
  {
    q: 'Do customers need to install an app?',
    a: 'No. They can scan from a branded mobile web link. We also offer a native iOS / Android SDK for embedded experiences.',
  },
  {
    q: 'How is privacy handled?',
    a: 'Frames are processed in-memory and discarded. Only derived measurements persist. Consent is captured upfront and end users can request deletion at any time.',
  },
  {
    q: 'Can I plug it into my existing storefront?',
    a: 'Yes — Shopify, WooCommerce, Magento, and headless storefronts are supported through our REST API and webhooks.',
  },
  {
    q: 'What does the pilot include?',
    a: 'A free branded portal, your size charts integrated, a workshop with our team, and 30 days of unlimited scans to evaluate fit accuracy on your real customers.',
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
