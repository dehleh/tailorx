import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tailorxfit.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Tailor-X - Guided body measurements for fit pilots',
    template: '%s · Tailor-X',
  },
  description:
    'AI-assisted body measurement pilots for fashion brands, tailors, and fitness studios using phone capture, scan confidence, and controlled validation.',
  keywords: [
    'body measurement', 'AI tailoring', 'sizing', 'fashion tech',
    'fit technology', 'returns reduction', 'made-to-measure', 'pose estimation',
  ],
  openGraph: {
    type: 'website',
    title: 'Tailor-X - Guided body measurements for fit pilots',
    description:
      'AI-assisted body measurement pilots for fashion brands, tailors, and fitness studios.',
    url: SITE_URL,
    siteName: 'Tailor-X',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tailor-X - Guided body measurements for fit pilots',
    description:
      'AI-assisted body measurement pilots for fashion brands, tailors, and fitness studios.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
