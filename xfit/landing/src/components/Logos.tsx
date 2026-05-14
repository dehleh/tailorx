const LOGOS = ['ATELIER 14', 'NORTH&CO', 'STITCHLAB', 'FORMA', 'HALO FIT', 'MERIDIAN'];

export default function Logos() {
  return (
    <section className="border-y border-mist bg-white py-10">
      <div className="mx-auto max-w-7xl px-6">
        <p className="mb-6 text-center text-xs uppercase tracking-widest text-slate2">
          Piloting with forward-thinking brands and ateliers
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {LOGOS.map(name => (
            <span key={name} className="font-display text-sm tracking-[0.2em] text-slate1">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
