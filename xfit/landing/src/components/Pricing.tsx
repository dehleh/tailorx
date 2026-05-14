const TIERS = [
  {
    name: 'Starter',
    price: '₦45,000',
    cadence: '/ month',
    blurb: 'For independent tailors and boutique studios.',
    features: ['250 scans / month', '1 brand portal', 'Email support', 'Standard API access'],
    cta: 'Join waitlist',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '₦180,000',
    cadence: '/ month',
    blurb: 'For brands scaling fit and reducing returns.',
    features: ['2,000 scans / month', 'Up to 10 staff seats', 'Custom branding', 'Webhooks & priority support'],
    cta: 'Join waitlist',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    blurb: 'For chains, marketplaces, and global brands.',
    features: ['Unlimited scans', 'SSO & dedicated infra', 'On-prem option', 'SLAs & success manager'],
    cta: 'Talk to sales',
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="bg-mist/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-widest text-accentDark">Pricing</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-ink md:text-5xl">
            Simple, scan-based pricing.
          </h2>
          <p className="mt-4 text-slate1">
            Pay for what you use. Pilot starts free for selected brands.
          </p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TIERS.map(t => (
            <div
              key={t.name}
              className={
                'flex flex-col rounded-2xl border p-7 transition ' +
                (t.highlight
                  ? 'border-accent bg-ink text-white shadow-soft'
                  : 'border-mist bg-white text-ink hover:border-accent/40')
              }
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{t.name}</h3>
                {t.highlight && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink">
                    Popular
                  </span>
                )}
              </div>
              <p className={'mt-2 text-sm ' + (t.highlight ? 'text-white/70' : 'text-slate1')}>{t.blurb}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">{t.price}</span>
                <span className={t.highlight ? 'text-white/70' : 'text-slate2'}>{t.cadence}</span>
              </div>
              <ul className={'mt-6 space-y-3 text-sm ' + (t.highlight ? 'text-white/85' : 'text-slate1')}>
                {t.features.map(f => (
                  <li key={f} className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.highlight ? '#5EEAD4' : '#14B8A6'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                className={
                  'mt-8 rounded-full px-5 py-3 text-center text-sm font-semibold transition ' +
                  (t.highlight
                    ? 'bg-accent text-ink hover:bg-accentDark hover:text-white'
                    : 'bg-ink text-white hover:bg-ink/90')
                }
              >
                {t.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
