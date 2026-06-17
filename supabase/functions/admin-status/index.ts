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

    // Today's order count (app + web)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: appTodayCount },
      { count: webTodayCount },
      { data: appRecentFailures },
      { data: webRecentFailures },
      { data: stuckAppOrders },
      { data: stuckWebOrders },
    ] = await Promise.all([
      // App print orders today
      supabaseAdmin
        .from('autograph_prints')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString()),
      // Web print orders today (non-cancelled)
      supabaseAdmin
        .from('web_print_orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString())
        .in('status', ['pending', 'paid', 'submitted']),
      // App failures last 24h
      supabaseAdmin
        .from('autograph_prints')
        .select('id, autograph_id, created_at, fulfillment_status')
        .eq('fulfillment_status', 'failed')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20),
      // Web failures last 24h
      supabaseAdmin
        .from('web_print_orders')
        .select('id, autograph_id, created_at, status')
        .eq('status', 'failed')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20),
      // App orders: paid but not submitted (stuck)
      supabaseAdmin
        .from('autograph_prints')
        .select('id, autograph_id, created_at, fulfillment_status')
        .eq('fulfillment_status', 'payment_confirmed')
        .is('vendor_order_id', null)
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20),
      // Web orders: paid but not submitted (stuck)
      supabaseAdmin
        .from('web_print_orders')
        .select('id, autograph_id, created_at, status')
        .eq('status', 'paid')
        .is('prodigi_order_id', null)
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const totalTodayCount = (appTodayCount ?? 0) + (webTodayCount ?? 0);

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
        app_count: appTodayCount ?? 0,
        web_count: webTodayCount ?? 0,
        total: totalTodayCount,
        cap: dailyCap,
        cap_reached: totalTodayCount >= dailyCap,
      },
      alerts: {
        app_recent_failures: appRecentFailures ?? [],
        web_recent_failures: webRecentFailures ?? [],
        app_stuck_orders: stuckAppOrders ?? [],
        web_stuck_orders: stuckWebOrders ?? [],
      },
    });
  }, req)
);
