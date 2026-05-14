export default function Hero() {
  return (
    <section id="top" className="gradient-bg relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 md:grid-cols-2 md:py-32">
        <div className="flex flex-col justify-center">
          <span className="mb-4 inline-flex w-max items-center gap-2 rounded-full border border-accent/30 bg-white/70 px-3 py-1 text-xs font-medium text-accentDark">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            Now onboarding pilot brands
          </span>
          <h1 className="font-display text-4xl font-bold leading-tight text-ink text-balance md:text-6xl">
            Body measurements that <span className="text-accent">actually fit</span>, in seconds.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-slate1 text-balance">
            Tailor-X turns any phone camera into a precision measurement studio.
            Brands cut returns, tailors scale beyond their atelier, and customers
            never wonder about size again.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#waitlist"
              className="rounded-full bg-ink px-6 py-3 text-center text-base font-semibold text-white shadow-soft transition hover:bg-ink/90"
            >
              Join the waitlist
            </a>
            <a
              href="#how"
              className="rounded-full border border-ink/15 bg-white px-6 py-3 text-center text-base font-semibold text-ink transition hover:border-ink/40"
            >
              See how it works
            </a>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-mist pt-6 text-sm">
            <div>
              <dt className="text-slate2">Accuracy</dt>
              <dd className="text-2xl font-semibold text-ink">±1.2 cm</dd>
            </div>
            <div>
              <dt className="text-slate2">Capture time</dt>
              <dd className="text-2xl font-semibold text-ink">≈ 30s</dd>
            </div>
            <div>
              <dt className="text-slate2">Returns saved</dt>
              <dd className="text-2xl font-semibold text-ink">up to 38%</dd>
            </div>
          </dl>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 -z-10 rounded-[3rem] bg-white/40 backdrop-blur-2xl" />
          <div className="relative aspect-[9/16] w-72 rounded-[2.5rem] border border-mist bg-white p-4 shadow-soft">
            <div className="flex h-full flex-col rounded-[1.75rem] bg-ink p-5 text-white">
              <div className="flex items-center justify-between text-[10px] opacity-70">
                <span>9:41</span>
                <span>●●●●●</span>
              </div>
              <div className="mt-6 text-xs uppercase tracking-widest text-accent">Scan</div>
              <h3 className="mt-1 text-lg font-semibold">Stand here</h3>
              <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                <svg viewBox="0 0 80 160" className="h-48 w-auto text-accent/80">
                  <circle cx="40" cy="20" r="10" fill="currentColor" />
                  <rect x="32" y="32" width="16" height="50" rx="6" fill="currentColor" />
                  <rect x="14" y="40" width="14" height="6" rx="3" fill="currentColor" />
                  <rect x="52" y="40" width="14" height="6" rx="3" fill="currentColor" />
                  <rect x="32" y="84" width="6" height="60" rx="3" fill="currentColor" />
                  <rect x="42" y="84" width="6" height="60" rx="3" fill="currentColor" />
                </svg>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-white/10 p-2">
                  <div className="text-white/60">Chest</div>
                  <div className="font-semibold">98.4 cm</div>
                </div>
                <div className="rounded-lg bg-white/10 p-2">
                  <div className="text-white/60">Waist</div>
                  <div className="font-semibold">82.1 cm</div>
                </div>
                <div className="rounded-lg bg-white/10 p-2">
                  <div className="text-white/60">Hip</div>
                  <div className="font-semibold">102.7 cm</div>
                </div>
                <div className="rounded-lg bg-accent p-2 text-ink">
                  <div className="opacity-70">Suggested</div>
                  <div className="font-semibold">Size M</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
