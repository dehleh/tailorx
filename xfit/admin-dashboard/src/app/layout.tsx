import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/authContext';

export const metadata: Metadata = {
  title: 'Tailor-X Admin',
  description: 'Tailor-X enterprise administration dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
