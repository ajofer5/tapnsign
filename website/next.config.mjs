const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gsjmawqvazjnodfjdysd.supabase.co',
      },
    ],
  },
  async redirects() {
    return [
      { source: '/app', destination: '/home', permanent: true },
      { source: '/app/account', destination: '/account', permanent: true },
      { source: '/app/activity', destination: '/activity', permanent: true },
      { source: '/app/collection', destination: '/collection', permanent: true },
      { source: '/app/saved', destination: '/saved', permanent: true },
      { source: '/app/personalized-requests', destination: '/personalized-requests', permanent: true },
      { source: '/app/personalized-requests/:path*', destination: '/personalized-requests/:path*', permanent: true },
      { source: '/app/me/listings', destination: '/me/listings', permanent: true },
      { source: '/app/me/offers', destination: '/me/offers', permanent: true },
      { source: '/app/checkout/:path*', destination: '/checkout/:path*', permanent: true },
      { source: '/app/offer/:path*', destination: '/offer/:path*', permanent: true },
      { source: '/app/offers/:path*', destination: '/offers/:path*', permanent: true },
      { source: '/app/listings/:id', destination: '/autograph/:id', permanent: true },
      { source: '/app/verify', destination: '/identity', permanent: true },
      { source: '/app/verify/start', destination: '/identity/start', permanent: true },
      { source: '/app/verify/success', destination: '/identity/success', permanent: true },
    ];
  },
};

export default nextConfig;
