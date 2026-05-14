const FEATURES = [
  {
    title: 'Studio-grade accuracy',
    body: 'Multi-pose capture, real-time pose feedback, and reference-object calibration converge measurements to within ±1.2 cm.',
    icon: (
      <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
    ),
  },
  {
    title: 'Built for any phone',
    body: 'No depth sensor or LiDAR required. Works on iOS and Android with a clean computer-vision pipeline tuned for low-light environments.',
    icon: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </>
    ),
  },
  {
    title: 'Multi-tenant from day one',
    body: 'Each brand gets a branded portal, staff invites, customer sessions, and quota-aware billing — without writing a line of code.',
    icon: (
      <>
        <path d="M3 21V5a2 2 0 0 1 2-2h6v18" />
        <path d="M11 8h8a2 2 0 0 1 2 2v11" />
      </>
    ),
  },
  {
    title: 'Privacy by default',
    body: 'Frames are processed and discarded; only derived measurements persist. Consent flows are built in. GDPR-ready.',
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </>
    ),
  },
  {
    title: 'Size-chart aware',
    body: 'Your size charts plug straight in. Recommendations follow your fit philosophy — slim, regular, or relaxed.',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </>
    ),
  },
  {
    title: 'API + webhooks',
    body: 'Stream measurements into your PIM, ERP, or storefront. Paystack billing, signed webhooks, and a clean REST surface.',
    icon: (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ),
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-widest text-accentDark">Platform</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-ink md:text-5xl">
            One platform for accurate fit, end-to-end.
          </h2>
          <p className="mt-4 text-slate1">
            From scan capture to size recommendation to billing — Tailor-X
            replaces a stack of fragile tools with a single, opinionated system.
          </p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} className="group rounded-2xl border border-mist bg-white p-6 transition hover:border-accent/40 hover:shadow-soft">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-mist text-ink transition group-hover:bg-accent group-hover:text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate1">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
