import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';
import { getWebSessionUser } from '../../../lib/web-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getWebSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { autograph_id } = await req.json() as { autograph_id: string };
  if (!autograph_id) return NextResponse.json({ error: 'Missing autograph_id' }, { status: 400 });

  const supabase = createWebsiteAdminSupabaseClient();
  const { error } = await supabase
    .from('watchlist')
    .insert({ user_id: user.id, autograph_id })
    .select()
    .single();

  if (error && error.code !== '23505') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getWebSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { autograph_id } = await req.json() as { autograph_id: string };
  if (!autograph_id) return NextResponse.json({ error: 'Missing autograph_id' }, { status: 400 });

  const supabase = createWebsiteAdminSupabaseClient();
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('autograph_id', autograph_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: false });
}
