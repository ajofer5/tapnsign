import Link from 'next/link';
import type { Metadata } from 'next';
import { webRoutes } from '../../lib/routes';

export const metadata: Metadata = {
  title: 'Support — Ophinia',
  description: 'Get help with Ophinia accounts, official prints, payouts, and orders.',
};

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#F2F2F4]">
      <nav className="border-b border-[#D8DDE8] bg-white px-6 py-4">
        <Link href={webRoutes.landing}>
          <img src="/ophinia-logo.png" alt="Ophinia" className="h-9" />
        </Link>
      </nav>

      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="web-panel border border-[#E1E5EF] p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#001B5C]">
            Support
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-[#111111] md:text-4xl">
            How can we help?
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-600">
            Contact Ophinia support for help with your account, official print orders,
            shipping updates, damage or lost-print claims, creator payouts, or content reports.
          </p>

          <div className="mt-8 rounded-lg border border-[#D8DDE8] bg-[#F8FAFC] p-5">
            <h2 className="text-lg font-bold text-[#111111]">Email support</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Send a message to{' '}
              <a className="font-semibold text-[#001B5C] underline" href="mailto:hello@ophinia.com">
                hello@ophinia.com
              </a>
              . Please include the email address on your account and any relevant order,
              profile, or certificate details.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <SupportItem
              title="Official print orders"
              text="For order questions, include your order email, the creator name, and the approximate purchase date."
            />
            <SupportItem
              title="Damage or lost prints"
              text="For damage or lost-print support, include clear photos where applicable and your shipping details."
            />
            <SupportItem
              title="Creator payouts"
              text="For payout setup questions, include your account email and any Stripe Connect status shown in your account."
            />
            <SupportItem
              title="Reports and safety"
              text="For impersonation, inappropriate content, or safety concerns, include the profile or certificate link when possible."
            />
          </div>

          <div className="mt-8 flex flex-wrap gap-4 border-t border-[#E1E5EF] pt-6 text-sm">
            <Link href={webRoutes.privacy} className="font-semibold text-[#001B5C] underline">
              Privacy Policy
            </Link>
            <Link href={webRoutes.terms} className="font-semibold text-[#001B5C] underline">
              Terms of Service
            </Link>
            <Link href={webRoutes.landing} className="font-semibold text-[#001B5C] underline">
              Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SupportItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-[#E1E5EF] bg-white p-4">
      <h2 className="text-sm font-bold text-[#111111]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
    </div>
  );
}
