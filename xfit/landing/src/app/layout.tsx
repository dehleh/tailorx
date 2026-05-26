import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tailorxfit.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Tailor-X — Body measurements that fit, in seconds',
    template: '%s · Tailor-X',
  },
  description:
    'AI-powered body measurement for fashion brands, tailors, and fitness studios. Reduce returns, raise conversion, and delight customers — straight from a phone camera.',
  keywords: [
    'body measurement', 'AI tailoring', 'sizing', 'fashion tech',
    'fit technology', 'returns reduction', 'made-to-measure', 'pose estimation',
  ],
  openGraph: {
    type: 'website',
    title: 'Tailor-X — Body measurements that fit, in seconds',
    description:
      'AI-powered body measurement for fashion brands, tailors, and fitness studios.',
    url: SITE_URL,
    siteName: 'Tailor-X',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tailor-X — Body measurements that fit, in seconds',
    description:
      'AI-powered body measurement for fashion brands, tailors, and fitness studios.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
