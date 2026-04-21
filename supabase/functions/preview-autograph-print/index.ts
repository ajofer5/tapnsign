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

    const [{ data: prints, error: printsError }, { data: ownerPrint, error: ownerPrintError }] = await Promise.all([
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
        .limit(1)
        .maybeSingle(),
    ]);

    assert(!printsError, 500, printsError?.message ?? 'Could not load print preview.');
    assert(!ownerPrintError, 500, ownerPrintError?.message ?? 'Could not load print history.');

    const totalPrints = prints?.length ?? 0;
    const nextSequence = totalPrints + 1;

    return json({
      autograph_id: autographId,
      total_print_count: totalPrints,
      next_print_sequence_number: nextSequence,
      next_print_label: `${formatOrdinal(nextSequence)} Print`,
      owner_has_printed: !!ownerPrint,
      owner_print: ownerPrint
        ? {
            id: ownerPrint.id,
            print_sequence_number: ownerPrint.print_sequence_number,
            print_label: `${formatOrdinal(ownerPrint.print_sequence_number)} Print`,
            created_at: ownerPrint.created_at,
          }
        : null,
    });
  }, req)
);
