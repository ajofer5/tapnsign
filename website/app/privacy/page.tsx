import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — TapnSign',
};

export default function PrivacyPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), '..', 'legal', 'privacy-policy.md'),
    'utf-8'
  );
  const html = String(marked.parse(content));

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="bg-[#F2F2F4] border-b border-gray-200 px-6 py-4">
        <Link href="/">
          <img src="/logo.png" alt="TapnSign" className="h-9" />
        </Link>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-14">
        <div
          className="prose prose-gray max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <footer className="border-t border-gray-200 py-8 px-6 text-center text-sm text-gray-500">
        <Link href="/terms" className="hover:underline mr-4">Terms of Service</Link>
        <Link href="/" className="hover:underline">Home</Link>
      </footer>
    </main>
  );
}
