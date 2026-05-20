import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import type { Metadata } from 'next';

type Certificate = {
  certificate_id: string;
  created_at: string;
  content_hash: string;
  video_url: string;
  thumbnail_url: string | null;
  creator_name: string;
  creator_verified: boolean;
  owner_name: string;
  is_for_sale: boolean;
  price_cents: number | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Certificate of Authenticity — Ophinia`,
    description: `Verify this Ophinia autograph certificate at tapnsign.com/verify/${id}`,
  };
}

async function getCertificate(id: string): Promise<Certificate | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .rpc('get_public_certificate', { p_certificate_id: id })
    .single();
  return (data as Certificate) ?? null;
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cert = await getCertificate(id);

  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-[#D8DDE8] bg-white px-6 py-4">
        <Link href="/">
          <img src="/ophinia-logo.png" alt="Ophinia" className="h-[4.5rem]" />
        </Link>
        <span className="text-sm text-gray-500">Certificate of Authenticity</span>
      </nav>

      <div className="max-w-lg mx-auto px-6 py-12">
        {cert ? (
          <>
            {/* Verified badge */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-5 py-2.5 rounded-full text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Verified Authentic
              </div>
            </div>

            {/* Thumbnail */}
            {cert.thumbnail_url && (
              <div className="rounded-2xl overflow-hidden mb-6 bg-black aspect-[9/16] max-h-72 mx-auto">
                <img
                  src={cert.thumbnail_url}
                  alt="Autograph"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Certificate card */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between bg-[#001B5C] px-6 py-4">
                <span className="text-white font-bold text-sm tracking-wide uppercase">
                  Certificate of Authenticity
                </span>
                <img src="/ophinia-logo-white.png" alt="Ophinia" className="h-10" />
              </div>
              <div className="px-6 py-5 space-y-4">
                <CertRow
                  label="Creator"
                  value={cert.creator_name}
                  badge={cert.creator_verified ? 'Verified' : undefined}
                />
                <CertRow label="Owner" value={cert.owner_name} />
                <CertRow
                  label="Captured"
                  value={new Date(cert.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                />
                <div className="border-t border-gray-100 pt-4">
                  <CertRow
                    label="Certificate ID"
                    value={cert.certificate_id}
                    mono
                  />
                  <div className="mt-3">
                    <CertRow
                      label="Content Hash"
                      value={`${cert.content_hash?.slice(0, 24)}…`}
                      mono
                    />
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
              This Certificate of Authenticity is maintained by Ophinia and cannot be altered.<br />
              Ownership transfers are permanently recorded on the Ophinia platform.
            </p>
          </>
        ) : (
          <div className="text-center py-20">
            <div className="text-5xl mb-6">🔍</div>
            <h1 className="text-2xl font-bold mb-3">Certificate Not Found</h1>
            <p className="text-gray-500 max-w-sm mx-auto">
              This certificate ID is invalid, or the autograph is no longer active.
            </p>
            <Link
              href="/"
              className="mt-8 inline-block rounded-full bg-[#001B5C] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
            >
              Go to Ophinia
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function CertRow({
  label,
  value,
  badge,
  mono,
}: {
  label: string;
  value: string;
  badge?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 text-sm flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 text-right">
        <span
          className={`text-sm font-medium ${
            mono ? 'font-mono text-xs text-gray-600 break-all' : ''
          }`}
        >
          {value}
        </span>
        {badge && (
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
