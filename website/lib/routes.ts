export const webRoutes = {
  landing: '/',
  home: '/home',
  marketplace: '/marketplace',
  collection: '/collection',
  activity: '/activity',
  account: '/account',
  saved: '/saved',
  personalizedRequests: '/personalized-requests',
  myListings: '/me/listings',
  login: '/login',
  signup: '/signup',
  logout: '/logout',
  privacy: '/privacy',
  terms: '/terms',
  identity: '/identity',
  identityStart: '/identity/start',
  identitySuccess: '/identity/success',
  marketingTips: '/marketing-tips',
  certificateExample: '/verify/demo',
} as const;

export function sanitizeNextPath(
  value: string | FormDataEntryValue | null | undefined,
  fallback: string = webRoutes.home,
): string {
  if (typeof value !== 'string' || !value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export function withNext(path: string, next: string) {
  return `${path}?next=${encodeURIComponent(next)}`;
}

export function withParams(path: string, params: URLSearchParams | Record<string, string | number | undefined | null>) {
  const search = params instanceof URLSearchParams ? params : new URLSearchParams();
  if (!(params instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    }
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function getWebsiteBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export function webRouteToAutograph(id: string) {
  return `/autograph/${id}`;
}

export function webRouteToProfile(id: string) {
  return `/profile/${id}`;
}

export function webRouteToVerify(id: string) {
  return `/verify/${id}`;
}

export function webRouteToCheckout(id: string) {
  return `/checkout/${id}`;
}

export function webRouteToProfilePersonalizedRequestStart(id: string) {
  return `/profile/${id}/personalized-request/start`;
}

export function webRouteToPersonalizedRequestCheckout(id: string) {
  return `/personalized-requests/${id}/checkout`;
}
