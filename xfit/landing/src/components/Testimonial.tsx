export default function Testimonial() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="#14B8A6" className="mx-auto opacity-70">
          <path d="M9.75 15c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3c.36 0 .69.07 1 .18V9c0-2.76 2.24-5 5-5h.5v3H13c-1.66 0-3 1.34-3 3v3.18c.31-.11.64-.18 1-.18 1.66 0 3 1.34 3 3zm10 0c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3c.36 0 .69.07 1 .18V9c0-2.76 2.24-5 5-5h.5v3H23c-1.66 0-3 1.34-3 3v3.18c.31-.11.64-.18 1-.18 1.66 0 3 1.34 3 3z" />
        </svg>
        <blockquote className="mt-6 font-display text-2xl leading-snug text-ink text-balance md:text-3xl">
          “Returns from sizing dropped almost overnight. Customers feel taken care of, and our atelier finally scales beyond Lagos.”
        </blockquote>
        <div className="mt-6 text-sm text-slate1">
          <span className="font-semibold text-ink">Adaeze N.</span> · Founder, Atelier 14
        </div>
      </div>
    </section>
  );
}
