import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ophinia — Digital Autographs',
  description:
    'The platform for verified digital autographs. Creators sign, fans own, everyone wins.',
  openGraph: {
    title: 'Ophinia',
    description: 'Sign It. Own It. Print It.',
    siteName: 'Ophinia',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
