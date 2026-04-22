import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Creator Marketing Tips — TapnSign',
};

export default function MarketingTipsPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), 'content', 'marketing-tips.md'),
    'utf-8'
  );
  const html = String(marked.parse(content));

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <Link href="/">
          <img src="/logo.png" alt="TapnSign" className="h-[4.5rem]" />
        </Link>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-14">
        <div
          className="prose prose-gray max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
