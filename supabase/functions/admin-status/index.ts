import {
  handleRequest,
  json,
  requireInternalRequest,
  stripe,
  supabaseAdmin,
} from '../_shared/utils.ts';

const RETAIL_PRINT_CENTS = 1000;
const FLAT_SHIPPING_CENTS = 699;

Deno.serve((req) =>
  handleRequest(async (request) => {
    requireInternalRequest(request);

    const isSandbox = Deno.env.get('PRODIGI_SANDBOX') === 'true';
    const submissionEnabled = Deno.env.get('PRODIGI_SUBMISSION_ENABLED') !== 'false';
    const dailyCap = parseInt(Deno.env.get('DAILY_PRINT_ORDER_CAP') ?? '50', 10);

    // Stripe mode
    let stripeMode = 'unknown';
    try {
      const balance = await stripe.balance.retrieve();
      stripeMode = (balance as any).livemode === false ? 'test' : 'live';
    } catch (err) {
      stripeMode = `error: ${(err as Error).message}`;
    }

    // Today's order count
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: todayCount } = await supabaseAdmin
      .from('autograph_prints')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString());

    // Recent failures (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFailures } = await supabaseAdmin
      .from('autograph_prints')
      .select('id, autograph_id, created_at, fulfillment_status')
      .eq('fulfillment_status', 'failed')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    // Paid but not submitted (potential stuck orders)
    const { data: stuckOrders } = await supabaseAdmin
      .from('autograph_prints')
      .select('id, autograph_id, created_at, fulfillment_status')
      .eq('fulfillment_status', 'payment_confirmed')
      .is('vendor_order_id', null)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    return json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      stripe: {
        mode: stripeMode,
      },
      prodigi: {
        mode: isSandbox ? 'sandbox' : 'live',
        submission_enabled: submissionEnabled,
      },
      pricing: {
        print_cents: RETAIL_PRINT_CENTS,
        shipping_cents: FLAT_SHIPPING_CENTS,
        total_cents: RETAIL_PRINT_CENTS + FLAT_SHIPPING_CENTS,
      },
      orders_today: {
        count: todayCount ?? 0,
        cap: dailyCap,
        cap_reached: (todayCount ?? 0) >= dailyCap,
      },
      alerts: {
        recent_failures: recentFailures ?? [],
        stuck_orders: stuckOrders ?? [],
      },
    });
  }, req)
);
