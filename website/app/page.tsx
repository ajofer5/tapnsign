import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-[#F2F2F4] border-b border-gray-200">
        <img src="/logo.png" alt="TapnSign" className="h-9" />
        <div className="flex items-center gap-4">
          <Link href="/marketplace" className="text-sm font-semibold text-gray-600 hover:text-black transition-colors">
            Marketplace
          </Link>
          <Link href="/login" className="text-sm font-semibold text-gray-600 hover:text-black transition-colors">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="bg-[#E53935] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            Create Account
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#F2F2F4] min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20 pb-16">
        <img src="/logo.png" alt="TapnSign" className="w-[31rem] md:w-[43rem] mb-12" />
        <h1 className="text-black text-5xl md:text-7xl font-black leading-none tracking-tight">
          Create.<br />
          Collect.<br />
          Display.
        </h1>
        <p className="text-gray-600 text-lg md:text-xl mt-8 max-w-md leading-relaxed">
          The marketplace for verified digital autographs.
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-3 bg-[#E53935] text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-red-700 transition-colors"
          >
            Browse Marketplace
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-3 border border-black text-black px-8 py-4 rounded-full text-lg font-bold hover:bg-black hover:text-white transition-colors"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <section className="bg-[#F2F2F4] py-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon="✍️"
            title="Verified Creators"
            desc="Identity-verified creators sign autographs that fans know are 100% authentic."
          />
          <FeatureCard
            icon="🔐"
            title="Secured Ownership"
            desc="Every autograph has a Certificate of Authenticity. Ownership is recorded and transferable."
          />
          <FeatureCard
            icon="🖼️"
            title="Limited Prints"
            desc="One print per owner, guaranteed exclusive. A physical display of something truly yours."
          />
        </div>
      </section>

      {/* For Creators */}
      <section className="bg-white py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-[#E53935] text-sm font-bold uppercase tracking-widest text-center mb-3">
            Creators
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-center mb-4">
            Your name. Your image. Your terms.
          </h2>
          <p className="text-gray-500 text-center text-lg mb-12 max-w-xl mx-auto">
            TapnSign gives talented individuals direct control over monetizing their name, image, and likeness — no middlemen, no gatekeepers. Capture a video autograph, set your price, and sell directly to fans.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BulletCard text="Identity verified through Stripe Identity — fans know it's really you" />
            <BulletCard text="Capture a personalized video autograph in seconds" />
            <BulletCard text="Set your own price and sell to fans directly" />
            <BulletCard text="Your Certificate of Authenticity stays on record permanently" />
          </div>
        </div>
      </section>

      {/* For Collectors */}
      <section className="bg-[#F2F2F4] py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-[#E53935] text-sm font-bold uppercase tracking-widest text-center mb-3">
            Collectors
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-center mb-4">
            Browse. Collect. Display.
          </h2>
          <p className="text-gray-500 text-center text-lg mb-12 max-w-xl mx-auto">
            TapnSign autographs are verified digital collectibles, each authenticated with a unique Certificate of Authenticity. Display them on your public profile or order an official print for your wall.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BulletCard text="Purchase autographs directly from verified creators" />
            <BulletCard text="Every autograph includes a Certificate of Authenticity with QR verification" />
            <BulletCard text="Sell your autographs in the marketplace when you're ready" />
            <BulletCard text="Order an official print — one per owner, guaranteed exclusive" />
          </div>
        </div>
      </section>

      {/* Official Prints */}
      <section className="bg-[#E53935] py-20 px-6 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-red-200 text-sm font-bold uppercase tracking-widest mb-3">
            Official Prints
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-6">
            Hang it on the wall.
          </h2>
          <p className="text-red-100 text-lg max-w-xl mx-auto">
            One print per owner. Designed to protect the value of every autograph you collect.
          </p>
        </div>
      </section>

      {/* Download CTA */}
      <section className="bg-[#F2F2F4] py-24 px-6 text-center">
        <img src="/logo.png" alt="TapnSign" className="h-16 mx-auto mb-8" />
        <h2 className="text-black text-3xl md:text-4xl font-black mb-4">
          Ready to browse?
        </h2>
        <p className="text-gray-600 text-lg mb-10">
          Explore verified creator listings on the web, then use the app to create new autographs.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-3 bg-[#E53935] text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-red-700 transition-colors"
          >
            Browse Marketplace
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-3 border border-black text-black px-8 py-4 rounded-full text-lg font-bold hover:bg-black hover:text-white transition-colors"
          >
            Create Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#F2F2F4] border-t border-gray-200 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <img src="/logo.png" alt="TapnSign" className="h-5" />
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-black transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-black transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:hello@tapnsign.com" className="hover:text-black transition-colors">
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
    <div className="bg-white rounded-2xl p-7">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function BulletCard({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-[#F2F2F4]">
      <span className="text-[#E53935] font-black text-lg leading-snug">✓</span>
      <p className="text-gray-700 leading-snug">{text}</p>
    </div>
  );
}
