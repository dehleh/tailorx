import BrandLogo from '@/components/BrandLogo';

type InvitePageProps = {
  params: {
    code: string;
  };
};

type InviteLookup = {
  organization: {
    brandName: string;
    primaryColor?: string | null;
    imprint?: string | null;
  };
  invite: {
    label: string;
    landing_headline?: string | null;
  };
  quota: {
    remainingQuota: number;
    canStartSession: boolean;
  };
};

async function loadInvite(code: string): Promise<InviteLookup | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://tailorx-pose-api-production.up.railway.app';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/enterprise/invite/${encodeURIComponent(code)}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateMetadata({ params }: InvitePageProps) {
  const code = decodeURIComponent(params.code);
  return {
    title: `Tailor-Xfit invite ${code}`,
    description: 'Open a tailor or fashion-house measurement invite in the Tailor-Xfit mobile app.',
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const code = decodeURIComponent(params.code);
  const invite = await loadInvite(code);
  const downloadUrl = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL || 'https://tailor-xfit.app/download';
  const deepLink = `tailorxfit://invite/${encodeURIComponent(code)}`;
  const brandColor = invite?.organization.primaryColor || '#0F2B3C';

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-6 py-10 text-ink">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col justify-center">
        <BrandLogo className="mb-10 h-12 w-auto" />
        <div className="rounded-2xl border border-mist bg-white p-6 shadow-soft md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accentDark">
            Measurement invite
          </p>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
            {invite?.invite.landing_headline ||
              `Take your measurements for ${invite?.organization.brandName || 'your tailor'}`}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate1">
            Download or open Tailor-Xfit, enter this invite code, and complete the guided scan.
            Your derived measurements will appear on the tailor&apos;s dashboard after you finish.
          </p>

          <div className="mt-6 rounded-xl border border-mist bg-[#F8FAFC] p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate2">Invite code</p>
            <p className="mt-2 break-all font-mono text-2xl font-bold" style={{ color: brandColor }}>
              {code}
            </p>
          </div>

          {invite && (
            <div className="mt-5 grid gap-3 text-sm text-slate1 md:grid-cols-3">
              <div className="rounded-xl border border-mist p-4">
                <p className="text-xs uppercase tracking-widest text-slate2">Brand</p>
                <p className="mt-1 font-semibold text-ink">{invite.organization.brandName}</p>
              </div>
              <div className="rounded-xl border border-mist p-4">
                <p className="text-xs uppercase tracking-widest text-slate2">Invite</p>
                <p className="mt-1 font-semibold text-ink">{invite.invite.label}</p>
              </div>
              <div className="rounded-xl border border-mist p-4">
                <p className="text-xs uppercase tracking-widest text-slate2">Availability</p>
                <p className="mt-1 font-semibold text-ink">
                  {invite.quota.canStartSession ? `${invite.quota.remainingQuota} scans left` : 'Quota paused'}
                </p>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={deepLink}
              className="rounded-full px-6 py-3 text-center text-base font-semibold text-white shadow-soft transition hover:opacity-90"
              style={{ backgroundColor: brandColor }}
            >
              Open Tailor-Xfit app
            </a>
            <a
              href={downloadUrl}
              className="rounded-full border border-ink/15 bg-white px-6 py-3 text-center text-base font-semibold text-ink transition hover:border-ink/40"
            >
              Download mobile app
            </a>
          </div>

          <p className="mt-5 text-sm leading-6 text-slate2">
            Already installed but the app does not open automatically? Open Tailor-Xfit, choose
            Branded Customer Scan, then paste the invite code above.
          </p>
        </div>
      </section>
    </main>
  );
}
