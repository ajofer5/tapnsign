import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-black/95 backdrop-blur-sm">
        <img src="/logo.png" alt="TapnSign" className="h-20" />
        <a
          href="#download"
          className="bg-[#E53935] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-red-700 transition-colors"
        >
          Download
        </a>
      </nav>

      {/* Hero */}
      <section className="bg-black min-h-screen flex flex-col items-center justify-center text-center px-6 pt-10 pb-8">
        <img src="/logo.png" alt="TapnSign" className="w-[39rem] md:w-[54rem] mb-6" />
        <h1 className="text-white text-5xl md:text-7xl font-black leading-none tracking-tight">
          Sign It.<br />
          Own It.<br />
          Print It.
        </h1>
        <p className="text-gray-400 text-lg md:text-xl mt-8 max-w-md leading-relaxed">
          The platform for verified digital autographs. Creators sign. Fans own. Everyone wins.
        </p>
        <div id="download" className="mt-12 flex flex-col items-center gap-3">
          <a
            href="#"
            className="inline-flex items-center gap-3 bg-[#E53935] text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-red-700 transition-colors"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>
          <span className="text-gray-600 text-sm">iOS · Coming soon</span>
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
            title="Owned Forever"
            desc="Every autograph has a Certificate of Authenticity. Ownership is recorded and transferable."
          />
          <FeatureCard
            icon="🖼️"
            title="Official Prints"
            desc="Order an official 8×12 lustre print shipped to your door. One per owner, guaranteed scarce."
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
            Your signature. Your legacy.
          </h2>
          <p className="text-gray-500 text-center text-lg mb-12 max-w-xl mx-auto">
            Capture a video autograph, add your digital signature, and sell directly to fans — all in the TapnSign app.
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
            Own it. Trade it. Frame it.
          </h2>
          <p className="text-gray-500 text-center text-lg mb-12 max-w-xl mx-auto">
            Purchase autographs from verified creators, trade in the marketplace, and order official prints to display at home.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BulletCard text="Purchase autographs directly from verified creators" />
            <BulletCard text="Every autograph includes a Certificate of Authenticity with QR verification" />
            <BulletCard text="Trade autographs with other collectors in the marketplace" />
            <BulletCard text="Order an official 8×12 print — one per owner, forever yours" />
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
          <p className="text-red-100 text-lg max-w-xl mx-auto mb-8">
            Every autograph owner can order one official 8×12 lustre print, shipped to their door.
            Scarcity is guaranteed — one print per owner, permanently on record.
          </p>
          <div className="inline-block bg-white text-[#E53935] px-8 py-3 rounded-full text-xl font-black">
            $16.99 — Shipping included
          </div>
        </div>
      </section>

      {/* Download CTA */}
      <section className="bg-black py-24 px-6 text-center">
        <img src="/logo.png" alt="TapnSign" className="h-[7.5rem] mx-auto mb-8" />
        <h2 className="text-white text-3xl md:text-4xl font-black mb-4">
          Ready to sign?
        </h2>
        <p className="text-gray-400 text-lg mb-10">
          TapnSign is coming to the App Store soon.
        </p>
        <a
          href="#"
          className="inline-flex items-center gap-3 bg-[#E53935] text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-red-700 transition-colors"
        >
          Download on the App Store
        </a>
      </section>

      {/* Footer */}
      <footer className="bg-black border-t border-white/10 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <img src="/logo.png" alt="TapnSign" className="h-[4.5rem]" />
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:andy@tapnsign.com" className="hover:text-white transition-colors">
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
