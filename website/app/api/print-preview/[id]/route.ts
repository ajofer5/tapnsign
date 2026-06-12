import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../../lib/supabase';

export const runtime = 'nodejs';

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
      created_at,
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

  return NextResponse.json({
    autograph_id: data.id,
    creator_name: creatorName,
    creator_id: data.creator_id,
    thumbnail_url: (data as any).print_layout_url ?? data.thumbnail_url,
    prints_enabled: data.prints_enabled,
    item_cents: 1500,
    shipping_cents: 499,
  });
}
