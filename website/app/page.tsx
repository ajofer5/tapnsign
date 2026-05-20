import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-[#D8DDE8] bg-white/92 px-6 py-4 backdrop-blur">
        <img src="/logo.png" alt="Ophinia" className="h-8" />
        <div className="flex items-center gap-4">
          <Link href="/marketplace" className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
            Marketplace
          </Link>
          <Link href="/login" className="text-sm font-semibold text-gray-600 transition-colors hover:text-black">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-[#001B5C] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00144A]"
          >
            Create Account
          </Link>
        </div>
      </nav>

      <section className="min-h-screen bg-white px-6 pb-16 pt-20">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col items-center justify-center text-center">
          <img src="/logo.png" alt="Ophinia" className="mb-10 w-[36rem] md:w-[48rem]" />
          <div className="mb-4 inline-flex items-center rounded-full border border-[#D8DDE8] bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#001B5C]">
            Verified Digital Autographs
          </div>
          <h1 className="text-5xl font-black leading-none tracking-tight text-[#111111] md:text-7xl">
            Create.<br />
            Collect.<br />
            Display.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-gray-600 md:text-xl">
            A luxury-minimal marketplace for authenticated creator autographs, collectible ownership, and official prints.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-3 rounded-full bg-[#001B5C] px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-[#00144A]"
            >
              Browse Marketplace
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-3 rounded-full border border-[#001B5C] px-8 py-4 text-lg font-bold text-[#001B5C] transition-colors hover:bg-[#001B5C] hover:text-white"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          <FeatureCard
            icon="✦"
            title="Verified Creators"
            desc="Identity-verified creators sign autographs that fans can trust."
          />
          <FeatureCard
            icon="◌"
            title="Recorded Ownership"
            desc="Every autograph includes a Certificate of Authenticity and persistent ownership history."
          />
          <FeatureCard
            icon="▣"
            title="Official Prints"
            desc="Own the digital autograph, then order an official numbered print when you want to display it."
          />
        </div>
      </section>

      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-3 text-center text-sm font-bold uppercase tracking-widest text-[#6722F7]">
            Creators
          </div>
          <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">
            Your name. Your image. Your terms.
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-gray-500">
            Ophinia gives creators direct control over verified autograph capture, pricing, and collectible ownership without compromising presentation.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BulletCard text="Identity verified through Stripe Identity so fans know it is really you." />
            <BulletCard text="Capture a personalized video autograph in seconds." />
            <BulletCard text="Set your own price and sell directly to your audience." />
            <BulletCard text="Every autograph stays tied to a permanent certificate record." />
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-3 text-center text-sm font-bold uppercase tracking-widest text-[#0066FF]">
            Collectors
          </div>
          <h2 className="mb-4 text-center text-3xl font-black md:text-4xl">
            Browse. Collect. Display.
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-lg text-gray-500">
            Browse authenticated listings, inspect the certificate, and build a collection that can live digitally and on the wall.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BulletCard text="Purchase autographs directly from verified creators." />
            <BulletCard text="Every autograph includes a Certificate of Authenticity with QR verification." />
            <BulletCard text="Save, share, and resell through the marketplace when you are ready." />
            <BulletCard text="Order official prints to display the pieces you actually own." />
          </div>
        </div>
      </section>

      <section className="bg-[#001B5C] px-6 py-20 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 text-sm font-bold uppercase tracking-widest text-[#F1C168]">
            Official Prints
          </div>
          <h2 className="mb-6 text-3xl font-black md:text-4xl">
            Bring the autograph into the room.
          </h2>
          <p className="mx-auto max-w-xl text-lg text-[#D9E2FF]">
            Digital ownership stays primary. Official prints give collectors a physical format without losing the certificate-driven provenance.
          </p>
        </div>
      </section>

      <section className="bg-white px-6 py-24 text-center">
        <img src="/logo.png" alt="Ophinia" className="mx-auto mb-8 h-28" />
        <h2 className="mb-4 text-3xl font-black text-black md:text-4xl">
          Ready to browse?
        </h2>
        <p className="mb-10 text-lg text-gray-600">
          Explore verified listings on the web, then use the app to create new autographs.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-3 rounded-full bg-[#001B5C] px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-[#00144A]"
          >
            Browse Marketplace
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-3 rounded-full border border-[#001B5C] px-8 py-4 text-lg font-bold text-[#001B5C] transition-colors hover:bg-[#001B5C] hover:text-white"
          >
            Create Account
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#D8DDE8] bg-white px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 md:flex-row">
          <img src="/logo.png" alt="Ophinia" className="h-10" />
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="transition-colors hover:text-black">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-black">
              Terms of Service
            </Link>
            <a href="mailto:hello@tapnsign.com" className="transition-colors hover:text-black">
              Contact
            </a>
          </div>
          <div className="text-xs text-gray-600">© 2026 TAPNSIGN LLC</div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-[1.5rem] border border-[#D8DDE8] bg-white p-7 shadow-sm">
      <div className="mb-4 text-2xl font-black text-[#001B5C]">{icon}</div>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-500">{desc}</p>
    </div>
  );
}

function BulletCard({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#E1E5EF] bg-white p-4">
      <span className="text-lg font-black leading-snug text-[#6722F7]">✦</span>
      <p className="leading-snug text-gray-700">{text}</p>
    </div>
  );
}
