import { assert, getAutographForUpdate, getProfile, handleRequest, json, parseJson, requireString, requireUser, supabaseAdmin } from '../_shared/utils.ts';

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
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    const body = await parseJson(request);
    const autographId = requireString(body.autograph_id, 'autograph_id');
    const autograph = await getAutographForUpdate(autographId);

    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id === user.id, 403, 'You do not own this autograph.');

    const { data: existingOwnerPrint, error: existingOwnerPrintError } = await supabaseAdmin
      .from('autograph_prints')
      .select('id, print_sequence_number, created_at')
      .eq('autograph_id', autographId)
      .eq('owner_id_at_print', user.id)
      .eq('status', 'created')
      .limit(1)
      .maybeSingle();

    assert(!existingOwnerPrintError, 500, existingOwnerPrintError?.message ?? 'Could not create print.');
    assert(!existingOwnerPrint, 409, 'You have already created an official print for this autograph.');

    const { data: lastPrint, error: lastPrintError } = await supabaseAdmin
      .from('autograph_prints')
      .select('print_sequence_number')
      .eq('autograph_id', autographId)
      .eq('status', 'created')
      .order('print_sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    assert(!lastPrintError, 500, lastPrintError?.message ?? 'Could not create print.');
    const nextSequence = (lastPrint?.print_sequence_number ?? 0) + 1;

    const { data: createdPrint, error: createdPrintError } = await supabaseAdmin
      .from('autograph_prints')
      .insert({
        autograph_id: autographId,
        owner_id_at_print: user.id,
        print_sequence_number: nextSequence,
        status: 'created',
      })
      .select('id, autograph_id, print_sequence_number, created_at')
      .single();

    assert(!createdPrintError && createdPrint, 500, createdPrintError?.message ?? 'Could not create print.');

    return json({
      print: {
        id: createdPrint.id,
        autograph_id: createdPrint.autograph_id,
        print_sequence_number: createdPrint.print_sequence_number,
        print_label: `${formatOrdinal(createdPrint.print_sequence_number)} Print`,
        created_at: createdPrint.created_at,
      },
    });
  }, req)
);
