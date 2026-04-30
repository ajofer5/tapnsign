function getStripeSecretKey() {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) throw new Error('STRIPE_SECRET_KEY is required.');
  return value;
}

async function stripeRequest<T>(
  path: string,
  init?: {
    method?: 'GET' | 'POST';
    form?: Record<string, string>;
  }
): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(init?.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: init?.form ? new URLSearchParams(init.form).toString() : undefined,
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Stripe request failed (${response.status})`);
  }
  return data as T;
}

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  status: 'open' | 'complete' | 'expired';
};

export async function createStripeCheckoutSession(input: {
  autographId: string;
  certificateId: string;
  creatorName: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  paymentEventId: string;
  buyerId: string;
  sellerId: string;
}) {
  return stripeRequest<StripeCheckoutSession>('/checkout/sessions', {
    method: 'POST',
    form: {
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(input.amountCents),
      'line_items[0][price_data][product_data][name]': `${input.creatorName} · TapnSign autograph`,
      'line_items[0][price_data][product_data][description]': `Certificate ${input.certificateId}`,
      'line_items[0][quantity]': '1',
      'metadata[purpose]': 'fixed_price_purchase',
      'metadata[autograph_id]': input.autographId,
      'metadata[payment_event_id]': input.paymentEventId,
      'metadata[buyer_id]': input.buyerId,
      'metadata[seller_id]': input.sellerId,
    },
  });
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  return stripeRequest<StripeCheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`
  );
}

export type StripeIdentitySession = {
  id: string;
  url: string | null;
  status: string;
};

export async function createStripeIdentitySession(input: {
  userId: string;
  paymentEventId: string;
  verificationAccess: 'paid_attempt' | 'courtesy_retry';
}) {
  return stripeRequest<StripeIdentitySession>('/identity/verification_sessions', {
    method: 'POST',
    form: {
      type: 'document',
      'metadata[supabase_user_id]': input.userId,
      'metadata[payment_event_id]': input.paymentEventId,
      'metadata[verification_access]': input.verificationAccess,
    },
  });
}

export async function createVerificationCheckoutSession(input: {
  userId: string;
  paymentEventId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripeRequest<StripeCheckoutSession>('/checkout/sessions', {
    method: 'POST',
    form: {
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': '499',
      'line_items[0][price_data][product_data][name]': 'TapnSign Creator Verification',
      'line_items[0][price_data][product_data][description]': 'One-time identity verification fee',
      'line_items[0][quantity]': '1',
      allow_promotion_codes: 'true',
      'metadata[purpose]': 'verification_fee',
      'metadata[user_id]': input.userId,
      'metadata[payment_event_id]': input.paymentEventId,
    },
  });
}
