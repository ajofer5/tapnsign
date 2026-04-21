import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TapnSign — Digital Autographs',
  description:
    'The platform for verified digital autographs. Creators sign, fans own, everyone wins.',
  openGraph: {
    title: 'TapnSign',
    description: 'Sign It. Own It. Print It.',
    siteName: 'TapnSign',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
