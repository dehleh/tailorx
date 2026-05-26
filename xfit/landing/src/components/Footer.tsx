export default function Footer() {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://tailorx-admin-production.up.railway.app';
  return (
    <footer className="border-t border-mist bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-5">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 font-display text-xl font-bold text-ink">
            <span className="inline-block h-7 w-7 rounded-md bg-gradient-to-br from-accent to-ink" aria-hidden />
            Tailor-X
          </div>
          <p className="mt-4 max-w-xs text-sm text-slate1">
            AI-powered body measurement for brands, tailors, and fitness studios.
          </p>
        </div>
        <FooterCol title="Product" links={[
          { label: 'Features', href: '#features' },
          { label: 'How it works', href: '#how' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'FAQ', href: '#faq' },
        ]} />
        <FooterCol title="Company" links={[
          { label: 'Waitlist', href: '#waitlist' },
          { label: 'Sign in', href: adminUrl },
          { label: 'Privacy', href: '/privacy' },
          { label: 'Terms', href: '/terms' },
        ]} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink">Contact</p>
          <ul className="mt-4 space-y-2 text-sm text-slate1">
            <li>
              <a href="mailto:info@tailorxfit.com" className="transition hover:text-ink">
                info@tailorxfit.com
              </a>
              <span className="block text-xs text-slate2">General &amp; enquiries</span>
            </li>
            <li>
              <a href="mailto:enquiry@tailorxfit.com" className="transition hover:text-ink">
                enquiry@tailorxfit.com
              </a>
              <span className="block text-xs text-slate2">Waitlist &amp; early access</span>
            </li>
            <li>
              <a href="tel:+2348137446304" className="transition hover:text-ink">
                +234 813 744 6304
              </a>
            </li>
            <li className="text-xs leading-relaxed text-slate2">
              5 C &amp; I Leasing Dr,<br />
              Lekki Phase I,<br />
              Lagos 106104, Nigeria
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-mist py-6">
        <p className="text-center text-xs text-slate2">
          © {new Date().getFullYear()} Tailor-X. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-ink">{title}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate1">
        {links.map(l => (
          <li key={l.label}>
            <a href={l.href} className="transition hover:text-ink">{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
