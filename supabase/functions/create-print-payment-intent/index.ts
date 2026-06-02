import {
  assert,
  getAutographForUpdate,
  getIdempotencyKey,
  getPlatformFee,
  getProfile,
  getRequestId,
  handleRequest,
  HttpError,
  json,
  parseJson,
  requireString,
  requireUser,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';

const PRODIGI_QUOTE_URL = Deno.env.get('PRODIGI_SANDBOX') === 'true'
  ? 'https://api.sandbox.prodigi.com/v4.0/quotes'
  : 'https://api.prodigi.com/v4.0/quotes';
const PRODIGI_API_KEY = Deno.env.get('PRODIGI_API_KEY') ?? '';
const SKU_8X10 = 'GLOBAL-PHO-8X10';
// Fallback price if Prodigi quote fails
const FALLBACK_PRINT_CENTS = 1699;

async function getProdigiTotalCents(): Promise<number> {
  try {
    const response = await fetch(PRODIGI_QUOTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PRODIGI_API_KEY },
      body: JSON.stringify({
        shippingMethod: 'Standard',
        destinationCountryCode: 'US',
        currencyCode: 'USD',
        items: [{ sku: SKU_8X10, copies: 1, attributes: { finish: 'lustre' }, assets: [{ printArea: 'default' }] }],
      }),
    });
    if (!response.ok) return FALLBACK_PRINT_CENTS;
    const data = await response.json();
    const quote = data?.quotes?.[0];
    if (!quote) return FALLBACK_PRINT_CENTS;
    const item = parseFloat(quote.costSummary?.items?.amount ?? '0');
    const shipping = parseFloat(quote.costSummary?.shipping?.amount ?? '0');
    if (isNaN(item) || isNaN(shipping)) return FALLBACK_PRINT_CENTS;
    return Math.round((item + shipping) * 100);
  } catch {
    return FALLBACK_PRINT_CENTS;
  }
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const autographId = requireString(body.autograph_id, 'autograph_id');
    const idempotencyKey = getIdempotencyKey(request, body, crypto.randomUUID());

    const [autograph, profile, printBundleCents] = await Promise.all([
      getAutographForUpdate(autographId),
      getProfile(user.id),
      getProdigiTotalCents(),
    ]);

    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.is_creator === true, 403, 'You must be 18 or older to purchase prints.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id === user.id, 403, 'You do not own this autograph.');

    // Reuse an existing open payment intent for idempotency
    const { data: existingEvent } = await supabaseAdmin
      .from('payment_events')
      .select('id, stripe_payment_intent_id, amount_cents')
      .eq('user_id', user.id)
      .eq('autograph_id', autographId)
      .eq('purpose', 'print_bundle')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['created', 'requires_action', 'authorized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingEvent?.stripe_payment_intent_id) {
      const existingIntent = await stripe.paymentIntents.retrieve(existingEvent.stripe_payment_intent_id);
      // If already succeeded, mark captured and fall through to create a fresh intent
      if (existingIntent.status === 'succeeded' || existingIntent.status === 'canceled') {
        await supabaseAdmin
          .from('payment_events')
          .update({ status: existingIntent.status === 'succeeded' ? 'captured' : 'canceled' })
          .eq('id', existingEvent.id);
      } else {
        return json({
          client_secret: existingIntent.client_secret,
          payment_intent_id: existingIntent.id,
          payment_event_id: existingEvent.id,
          amount_cents: existingEvent.amount_cents,
          reused: true,
        });
      }
    }

    const requestId = getRequestId();
    const { feeCents } = await getPlatformFee(printBundleCents);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: printBundleCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        request_id: requestId,
        purpose: 'print_bundle',
        autograph_id: autographId,
        user_id: user.id,
      },
    }, { idempotencyKey });

    const { data: paymentEvent, error } = await supabaseAdmin
      .from('payment_events')
      .insert({
        provider: 'stripe',
        purpose: 'print_bundle',
        status: 'created',
        user_id: user.id,
        autograph_id: autographId,
        amount_cents: printBundleCents,
        currency: 'usd',
        idempotency_key: idempotencyKey,
        stripe_payment_intent_id: paymentIntent.id,
        platform_fee_cents: feeCents,
        provider_metadata: { request_id: requestId },
      })
      .select('id')
      .single();

    if (error || !paymentEvent) {
      // Race condition fallback — another request may have inserted first
      const { data: retryEvent } = await supabaseAdmin
        .from('payment_events')
        .select('id, stripe_payment_intent_id, amount_cents')
        .eq('user_id', user.id)
        .eq('autograph_id', autographId)
        .eq('purpose', 'print_bundle')
        .eq('idempotency_key', idempotencyKey)
        .in('status', ['created', 'requires_action', 'authorized'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (retryEvent?.stripe_payment_intent_id) {
        const retryIntent = await stripe.paymentIntents.retrieve(retryEvent.stripe_payment_intent_id);
        return json({
          client_secret: retryIntent.client_secret,
          payment_intent_id: retryIntent.id,
          payment_event_id: retryEvent.id,
          amount_cents: retryEvent.amount_cents,
          reused: true,
        });
      }

      throw new Error(error?.message ?? 'Could not create payment event.');
    }

    return json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      payment_event_id: paymentEvent.id,
      amount_cents: printBundleCents,
      reused: false,
    });
  }, req)
);
