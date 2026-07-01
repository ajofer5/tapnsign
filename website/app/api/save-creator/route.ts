import { NextRequest, NextResponse } from 'next/server';
import { createWebsiteAdminSupabaseClient } from '../../../lib/supabase';
import { getWebSessionUser } from '../../../lib/web-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getWebSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { creator_id } = await req.json() as { creator_id: string };
  if (!creator_id) return NextResponse.json({ error: 'Missing creator_id' }, { status: 400 });
  if (creator_id === user.id) return NextResponse.json({ error: 'Cannot save yourself' }, { status: 400 });

  const supabase = createWebsiteAdminSupabaseClient();
  const { error } = await supabase
    .from('saved_creators')
    .insert({ user_id: user.id, creator_id })
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

  const { creator_id } = await req.json() as { creator_id: string };
  if (!creator_id) return NextResponse.json({ error: 'Missing creator_id' }, { status: 400 });

  const supabase = createWebsiteAdminSupabaseClient();
  const { error } = await supabase
    .from('saved_creators')
    .delete()
    .eq('user_id', user.id)
    .eq('creator_id', creator_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: false });
}
