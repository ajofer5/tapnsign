import Link from 'next/link';
import { webRoutes } from '../lib/routes';

export default function HomePage() {
  return (
    <main>
      <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-[#D8DDE8] bg-white/92 px-6 py-4 backdrop-blur">
        <img src="/ophinia-logo.png" alt="Ophinia" className="h-8" />
        <div className="flex items-center gap-4">
          <Link href={webRoutes.marketplace} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
            Marketplace
          </Link>
          <Link href={webRoutes.login} className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
            Sign In
          </Link>
          <Link
            href={webRoutes.signup}
            className="rounded-full bg-[#001B5C] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
          >
            Create Account
          </Link>
        </div>
      </nav>

      <section className="bg-white px-6 pb-12 pt-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-start pt-10 text-center md:pt-14">
          <img src="/ophinia-logo.png" alt="Ophinia" className="mb-8 w-[27rem] md:w-[36rem]" />
          <h1 className="text-2xl font-semibold leading-none tracking-tight text-[#111111] md:text-4xl">
            Capture the moment.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-gray-600 md:text-xl">
            Seamlessly create and share memorabilia prints with fans in real time.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={webRoutes.marketplace}
              className="inline-flex items-center gap-3 rounded-full bg-[#001B5C] px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-[#00144A]"
            >
              Browse Marketplace
            </Link>
            <Link
              href={webRoutes.signup}
              className="inline-flex items-center gap-3 rounded-full border border-[#001B5C] px-8 py-4 text-lg font-bold text-[#001B5C] transition-colors hover:bg-[#001B5C] hover:text-white"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>


      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">
            Capture and share the moment in under 15 seconds.
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-gray-500">
            Create authenticated memorabilia, grow fan engagement, and earn from every print sold.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SquareCard text="Payout setup through Stripe Connect." />
            <SquareCard text="Capture authenticated moments in seconds." />
            <SquareCard text="Securely store the digital rights to your moments." />
            <SquareCard text="Certificate of authenticity tied to every moment." />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">
            Purchase authenticated memorabilia.
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-gray-500">
            Every 8x10 memorabilia print includes a signing storyboard, signature panel, capture date, and QR code linked to its certificate of authenticity.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SquareCard text="Order official prints directly from your favorite creators." />
            <SquareCard text="Save your favorite creators to keep up with new releases." />
            <SquareCard text="Save your favorite moments to keep up with promotional discounts." />
            <SquareCard text="Share moments with friends and family." />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-24 text-center">
        <img src="/ophinia-logo.png" alt="Ophinia" className="mx-auto mb-8 h-28" />
        <h2 className="mb-4 text-3xl font-black text-black md:text-4xl">
          Ready to browse?
        </h2>
        <p className="mb-10 text-lg text-gray-600">
          Explore official prints on the web, then use the app to capture new moments.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={webRoutes.marketplace}
            className="inline-flex items-center gap-3 rounded-full bg-[#001B5C] px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-[#00144A]"
          >
            Browse Marketplace
          </Link>
          <Link
            href={webRoutes.signup}
            className="inline-flex items-center gap-3 rounded-full border border-[#001B5C] px-8 py-4 text-lg font-bold text-[#001B5C] transition-colors hover:bg-[#001B5C] hover:text-white"
          >
            Create Account
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#D8DDE8] bg-white px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 md:flex-row">
          <img src="/ophinia-logo.png" alt="Ophinia" className="h-10" />
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href={webRoutes.privacy} className="transition-colors hover:text-black">
              Privacy Policy
            </Link>
            <Link href={webRoutes.terms} className="transition-colors hover:text-black">
              Terms of Service
            </Link>
            <Link href={webRoutes.support} className="transition-colors hover:text-black">
              Support
            </Link>
            <a href="mailto:support@ophinia.com" className="transition-colors hover:text-black">
              Contact
            </a>
          </div>
          <div className="text-xs text-gray-600">© 2026 Ophinia</div>
        </div>
      </footer>
    </main>
  );
}


function SquareCard({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#E1E5EF] bg-white p-4">
      <span className="mt-0.5 h-3 w-3 shrink-0 bg-[#6722F7]" />
      <p className="leading-snug text-gray-700">{text}</p>
    </div>
  );
}
