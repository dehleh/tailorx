const STEPS = [
  {
    n: '01',
    title: 'Customer opens your branded link',
    body: 'Sent by email, QR code, or embedded in your storefront. No app install required for the first scan.',
  },
  {
    n: '02',
    title: 'Guided multi-pose capture',
    body: 'Live pose feedback walks them through front, side, and back captures with audible cues.',
  },
  {
    n: '03',
    title: 'AI converts pixels to centimeters',
    body: 'Our pose + segmentation pipeline + your calibration reference produce reliable, repeatable measurements.',
  },
  {
    n: '04',
    title: 'You receive sizes that fit',
    body: 'Recommendations stream into your dashboard, API, or PIM — ready to drive checkout, production, or fittings.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-mist/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-widest text-accentDark">How it works</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-ink md:text-5xl">
            Four steps from camera to confident purchase.
          </h2>
        </div>
        <ol className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(s => (
            <li key={s.n} className="rounded-2xl bg-white p-6 shadow-soft">
              <div className="font-display text-3xl font-bold text-accent">{s.n}</div>
              <h3 className="mt-3 font-display text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate1">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
