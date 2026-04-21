import {
  assert,
  getAutographDisplayLabel,
  getProfile,
  handleRequest,
  HttpError,
  json,
  notifyUser,
  parseJson,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

const TAPNSIGN_ADMIN_USER_ID = Deno.env.get('TAPNSIGN_ADMIN_USER_ID') ?? '';

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const body = await parseJson(request);

    const claimId = requireString(body.claim_id, 'claim_id');
    const destructionPhotoUrl = requireString(body.destruction_photo_url, 'destruction_photo_url');

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    // Load the claim and confirm it belongs to this user
    const { data: claim, error: claimError } = await supabaseAdmin
      .from('print_damage_claims')
      .select('id, print_id, claimant_id, status')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) throw new HttpError(404, 'Damage claim not found.');
    assert(claim.claimant_id === user.id, 403, 'This claim does not belong to you.');
    assert(
      claim.status === 'destruction_requested',
      409,
      'Destruction photo can only be submitted after TapnSign has reviewed your damage evidence and requested it.'
    );

    const { error: updateError } = await supabaseAdmin
      .from('print_damage_claims')
      .update({
        destruction_photo_url: destructionPhotoUrl,
        destruction_submitted_at: new Date().toISOString(),
      })
      .eq('id', claimId);

    if (updateError) throw new HttpError(500, 'Could not submit destruction photo.');

    // Notify admin that destruction photo is ready to review
    if (TAPNSIGN_ADMIN_USER_ID) {
      const { data: print } = await supabaseAdmin
        .from('autograph_prints')
        .select('autograph_id')
        .eq('id', claim.print_id)
        .single();

      if (print?.autograph_id) {
        const label = await getAutographDisplayLabel(print.autograph_id);
        await notifyUser(
          TAPNSIGN_ADMIN_USER_ID,
          'Destruction Photo Submitted',
          `Destruction photo received for ${label}. Ready for final review.`
        );
      }
    }

    return json({
      claim: {
        id: claimId,
        status: 'destruction_requested',
        destruction_submitted: true,
      },
    });
  }, req)
);
