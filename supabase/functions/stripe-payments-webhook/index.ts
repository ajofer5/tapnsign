import { corsHeaders, json, stripe, supabaseAdmin } from '../_shared/utils.ts';

async function updatePaymentEventByIntentId(
  paymentIntentId: string,
  updates: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin
    .from('payment_events')
    .update(updates)
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateWebPrintOrderByIntentId(
  paymentIntentId: string,
  updates: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from('web_print_orders')
    .update(updates)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    return;
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const webPrintOrderId =
    typeof paymentIntent.metadata?.web_print_order_id === 'string'
      ? paymentIntent.metadata.web_print_order_id
      : null;

  if (!webPrintOrderId) {
    return;
  }

  const { error: fallbackError } = await supabaseAdmin
    .from('web_print_orders')
    .update(updates)
    .eq('id', webPrintOrderId);

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_PAYMENTS_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    return json({ error: 'Missing stripe signature or webhook secret' }, 400);
  }

  const body = await req.text();

  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    return json({ error: `Webhook signature verification failed: ${err.message}` }, 400);
  }

  try {
    // Deduplication — Stripe retries webhooks on failure; skip events we've already processed.
    // The event record is inserted AFTER processing so that a processing failure leaves no record,
    // allowing Stripe's retry to process the event again rather than being silently skipped.
    const eventId: string = event.id;
    const { data: existing } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('id')
      .eq('stripe_event_id', eventId)
      .maybeSingle();

    if (existing) {
      return json({ received: true, duplicate: true, type: event.type });
    }

    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as any;
      const paymentIntentId =
        typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;

      if (paymentIntentId) {
        const updates = { disputed_at: new Date().toISOString() };
        await updatePaymentEventByIntentId(paymentIntentId, updates);
        await updateWebPrintOrderByIntentId(paymentIntentId, updates);
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as any;
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : null;

      if (paymentIntentId) {
        const amountRefunded = Number(charge.amount_refunded ?? 0);
        const updates = {
          refunded_at: amountRefunded > 0 ? new Date().toISOString() : null,
          refund_amount_cents: amountRefunded > 0 ? amountRefunded : null,
        };
        await updatePaymentEventByIntentId(paymentIntentId, updates);
        await updateWebPrintOrderByIntentId(paymentIntentId, updates);
      }
    }

    // Record the processed event only after successful handling so Stripe retries can re-run
    // processing if this function previously threw before reaching this point.
    await supabaseAdmin
      .from('stripe_webhook_events')
      .upsert(
        { stripe_event_id: eventId, event_type: event.type, processed_at: new Date().toISOString() },
        { onConflict: 'stripe_event_id', ignoreDuplicates: true }
      );

    return json({ received: true, type: event.type });
  } catch (error: any) {
    console.error('stripe-payments-webhook error:', error.message);
    return json({ error: error.message }, 500);
  }
});
