import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

const PRINT_PRICE_CENTS = 1000;
const PRINT_ORIGINAL_PRICE_CENTS = PRINT_PRICE_CENTS;
const SHIPPING_CENTS = 699;

async function fetchPrintUrls(autographId: string): Promise<{ layoutUrl: string | null; previewUrl: string | null }> {
  const rendererUrl = process.env.PRINT_RENDERER_URL ?? '';
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ?? '';
  if (!rendererUrl) return { layoutUrl: null, previewUrl: null };

  try {
    const response = await fetch(`${rendererUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ autograph_id: autographId, internal_secret: internalSecret }),
    });
    if (!response.ok) return { layoutUrl: null, previewUrl: null };
    const data = await response.json();
    return {
      layoutUrl: typeof data?.print_layout_url === 'string' ? data.print_layout_url : null,
      previewUrl: typeof data?.print_preview_url === 'string' ? data.print_preview_url : null,
    };
  } catch {
    return { layoutUrl: null, previewUrl: null };
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createWebsiteAdminSupabaseClient();

  const { data, error } = await supabase
    .from('autographs')
    .select(`
      id,
      prints_enabled,
      print_limit,
      thumbnail_url,
      print_layout_url,
      print_preview_url,
      creator_id,
      creator:creator_id ( display_name ),
      print_count:autograph_prints ( count )
    `)
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!data.prints_enabled) {
    return NextResponse.json({ error: 'Prints not available' }, { status: 409 });
  }

  const printCount = (data.print_count as any)?.[0]?.count ?? 0;
  if (typeof data.print_limit === 'number' && printCount >= data.print_limit) {
    return NextResponse.json({ error: 'Print limit reached' }, { status: 409 });
  }

  const creatorName = (data.creator as any)?.display_name ?? 'Creator';

  let layoutUrl: string | null = (data as any).print_layout_url ?? null;
  let previewUrl: string | null = (data as any).print_preview_url ?? null;
  if (!previewUrl) {
    const urls = await fetchPrintUrls(id);
    layoutUrl = layoutUrl ?? urls.layoutUrl;
    previewUrl = urls.previewUrl ?? urls.layoutUrl;
    if (layoutUrl || previewUrl) {
      supabase
        .from('autographs')
        .update({
          ...(layoutUrl ? { print_layout_url: layoutUrl } : {}),
          ...(previewUrl ? { print_preview_url: previewUrl } : {}),
        })
        .eq('id', id)
        .then(() => {});
    }
  }

  return NextResponse.json({
    autograph_id: data.id,
    creator_name: creatorName,
    creator_id: data.creator_id,
    thumbnail_url: previewUrl ?? data.thumbnail_url,
    print_layout_url: layoutUrl,
    print_preview_url: previewUrl,
    prints_enabled: data.prints_enabled,
    item_cents: PRINT_PRICE_CENTS,
    original_price_cents: PRINT_ORIGINAL_PRICE_CENTS,
    shipping_cents: SHIPPING_CENTS,
  });
}
