import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

async function fetchPrintLayoutUrl(autographId: string): Promise<string | null> {
  const rendererUrl = process.env.PRINT_RENDERER_URL ?? '';
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ?? '';
  if (!rendererUrl) return null;

  try {
    const response = await fetch(`${rendererUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ autograph_id: autographId, internal_secret: internalSecret }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.print_layout_url === 'string' ? data.print_layout_url : null;
  } catch {
    return null;
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

  // Use cached print_layout_url if available; otherwise call renderer and cache it
  let previewUrl: string | null = (data as any).print_layout_url ?? null;
  if (!previewUrl) {
    previewUrl = await fetchPrintLayoutUrl(id);
    if (previewUrl) {
      // Cache for future profile page loads (fire-and-forget)
      supabase.from('autographs').update({ print_layout_url: previewUrl }).eq('id', id).then(() => {});
    }
  }

  return NextResponse.json({
    autograph_id: data.id,
    creator_name: creatorName,
    creator_id: data.creator_id,
    thumbnail_url: previewUrl ?? data.thumbnail_url,
    prints_enabled: data.prints_enabled,
    item_cents: parseInt(process.env.PRINT_PRICE_CENTS ?? '1500', 10),
    original_price_cents: parseInt(process.env.PRINT_ORIGINAL_PRICE_CENTS ?? '1500', 10),
    shipping_cents: parseInt(process.env.SHIPPING_CENTS ?? '499', 10),
  });
}
