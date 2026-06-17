import { assert, assertUsersNotBlocked, getAutographForUpdate, getProfile, handleRequest, HttpError, json, parseJson, requireString, requireUser, supabaseAdmin } from '../_shared/utils.ts';

const PRINT_PRICE_CENTS = 1500;
const PRINT_ORIGINAL_PRICE_CENTS = PRINT_PRICE_CENTS;
const SHIPPING_CENTS = 499;

async function getPrintLayoutUrl(autographId: string) {
  const rendererUrl = Deno.env.get('PRINT_RENDERER_URL') ?? '';
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  assert(rendererUrl.length > 0, 500, 'PRINT_RENDERER_URL is not configured.');

  const layoutResponse = await fetch(`${rendererUrl}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': internalSecret,
    },
    body: JSON.stringify({ autograph_id: autographId, internal_secret: internalSecret }),
  });
  const layoutText = await layoutResponse.text();
  if (!layoutResponse.ok) {
    throw new HttpError(500, `Layout preview generation failed: ${layoutResponse.status} — ${layoutText}`);
  }

  let layoutData: any;
  try {
    layoutData = JSON.parse(layoutText);
  } catch {
    layoutData = {};
  }

  assert(
    typeof layoutData?.print_layout_url === 'string' && layoutData.print_layout_url.length > 0,
    500,
    'Print layout URL missing from print-renderer response.'
  );

  return {
    printLayoutUrl: layoutData.print_layout_url as string,
    printPreviewUrl: typeof layoutData.print_preview_url === 'string' && layoutData.print_preview_url.length > 0
      ? layoutData.print_preview_url as string
      : null,
    printLayoutVersion: typeof layoutData.version === 'string' ? layoutData.version : null,
  };
}

function formatOrdinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    const isSandbox = Deno.env.get('PRODIGI_SANDBOX') === 'true';
    const body = await parseJson(request);

    let user: { id: string; email: string | null };
    if (isSandbox && typeof body.sandbox_user_id === 'string') {
      user = { id: body.sandbox_user_id, email: null };
    } else {
      user = await requireUser(request);
    }

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const autographId = requireString(body.autograph_id, 'autograph_id');
    let autograph: Awaited<ReturnType<typeof getAutographForUpdate>>;
    try {
      autograph = await getAutographForUpdate(autographId);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        throw new HttpError(404, `Print preview autograph not found for id ${autographId}.`);
      }
      throw error;
    }

    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.visibility === 'public' || autograph.owner_id === user.id, 403, 'This autograph is not available for prints.');
    assert(autograph.owner_id === user.id || autograph.prints_enabled === true, 409, 'Prints are not available for this autograph.');
    await assertUsersNotBlocked(user.id, autograph.creator_id, 'You cannot purchase a print from this creator.');
    await assertUsersNotBlocked(user.id, autograph.owner_id, 'You cannot purchase a print from this owner.');

    const [
      { data: prints, error: printsError },
      { data: ownerPrints, error: ownerPrintsError },
    ] = await Promise.all([
      supabaseAdmin
        .from('autograph_prints')
        .select('print_sequence_number')
        .eq('autograph_id', autographId)
        .eq('status', 'created')
        .order('print_sequence_number', { ascending: false }),
      supabaseAdmin
        .from('autograph_prints')
        .select('id, print_sequence_number, created_at')
        .eq('autograph_id', autographId)
        .eq('owner_id_at_print', user.id)
        .eq('status', 'created')
        .order('print_sequence_number', { ascending: false }),
    ]);

    assert(!printsError, 500, printsError?.message ?? 'Could not load print preview.');
    assert(!ownerPrintsError, 500, ownerPrintsError?.message ?? 'Could not load print history.');

    const totalPrints = prints?.length ?? 0;
    const nextSequence = totalPrints + 1;
    const latestOwnerPrint = ownerPrints?.[0] ?? null;
    assert(
      typeof autograph.print_limit !== 'number' || totalPrints < autograph.print_limit,
      409,
      'This autograph has reached its print limit.'
    );

    const { printLayoutUrl, printPreviewUrl, printLayoutVersion } = await getPrintLayoutUrl(autographId);

    return json({
      autograph_id: autographId,
      total_print_count: totalPrints,
      next_print_sequence_number: nextSequence,
      next_print_label: `${formatOrdinal(nextSequence)} Print`,
      print_layout_url: printLayoutUrl,
      print_preview_url: printPreviewUrl,
      print_layout_version: printLayoutVersion,
      owner_print_count: ownerPrints?.length ?? 0,
      latest_owner_print: latestOwnerPrint
        ? {
            id: latestOwnerPrint.id,
            print_sequence_number: latestOwnerPrint.print_sequence_number,
            print_label: `${formatOrdinal(latestOwnerPrint.print_sequence_number)} Print`,
            created_at: latestOwnerPrint.created_at,
          }
        : null,
      item_cents: PRINT_PRICE_CENTS,
      original_price_cents: PRINT_ORIGINAL_PRICE_CENTS,
      shipping_cents: SHIPPING_CENTS,
    });
  }, req)
);
