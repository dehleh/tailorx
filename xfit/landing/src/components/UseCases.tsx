const CASES = [
  {
    tag: 'For fashion brands',
    title: 'Stop the silent revenue leak from returns.',
    points: [
      'Measure size-related return impact in pilot',
      'Personalised size guidance experiments',
      'Storefront integrations planned with pilot partners',
    ],
  },
  {
    tag: 'For tailors & ateliers',
    title: 'Scale beyond your fitting room.',
    points: [
      'Take orders from anywhere in the country',
      'Digital measurement records per customer',
      'Reusable size charts and scan-confidence tracking',
    ],
  },
  {
    tag: 'For fitness & wellness',
    title: 'Track body composition and progress.',
    points: [
      'Repeatable, member-friendly assessments',
      'Branded customer portals',
      'Expiring read-only share links',
    ],
  },
];

export default function UseCases() {
  return (
    <section id="use-cases" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-widest text-accentDark">Who it&apos;s for</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-ink md:text-5xl">
            Built for the people obsessed with fit.
          </h2>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {CASES.map(c => (
            <div key={c.tag} className="flex flex-col rounded-2xl border border-mist bg-gradient-to-b from-mist/30 to-white p-7 transition hover:border-accent/40">
              <p className="text-xs uppercase tracking-widest text-accentDark">{c.tag}</p>
              <h3 className="mt-3 font-display text-2xl font-semibold text-ink">{c.title}</h3>
              <ul className="mt-6 space-y-3 text-sm text-slate1">
                {c.points.map(p => (
                  <li key={p} className="flex items-start gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
