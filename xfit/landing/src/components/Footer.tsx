export default function Footer() {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://tailorx-admin-production.up.railway.app';
  return (
    <footer className="border-t border-mist bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-4">
        <div>
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
          { label: 'Contact', href: 'mailto:hello@tailor-xfit.app' },
        ]} />
        <FooterCol title="Legal" links={[
          { label: 'Privacy', href: '/privacy' },
          { label: 'Terms', href: '/terms' },
        ]} />
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
