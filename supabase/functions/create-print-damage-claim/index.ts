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

    const printId = requireString(body.print_id, 'print_id');
    const damageFrontPhotoUrl = requireString(body.damage_front_photo_url, 'damage_front_photo_url');
    const damageBackPhotoUrl = requireString(body.damage_back_photo_url, 'damage_back_photo_url');

    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');

    // Load the print record and confirm ownership
    const { data: print, error: printError } = await supabaseAdmin
      .from('autograph_prints')
      .select('id, autograph_id, owner_id_at_print, status, fulfillment_status, vendor_order_id')
      .eq('id', printId)
      .single();

    if (printError || !print) throw new HttpError(404, 'Print record not found.');
    assert(print.owner_id_at_print === user.id, 403, 'You do not own this print.');
    assert(print.status === 'created', 409, 'Print is not active.');
    assert(
      ['submitted', 'shipped', 'delivered'].includes(print.fulfillment_status),
      409,
      'Print has not been fulfilled yet. Damage claims can only be submitted after the print has shipped.'
    );

    // Only one active claim per print
    const { data: existingClaim } = await supabaseAdmin
      .from('print_damage_claims')
      .select('id, status')
      .eq('print_id', printId)
      .maybeSingle();

    if (existingClaim) {
      if (['pending', 'evidence_requested', 'destruction_requested'].includes(existingClaim.status)) {
        throw new HttpError(409, 'A damage claim for this print is already in progress.');
      }
      if (existingClaim.status === 'approved') {
        throw new HttpError(409, 'This print already has an approved damage claim.');
      }
      // Rejected claim — allow a new one
    }

    const now = new Date().toISOString();

    const { data: claim, error: claimError } = await supabaseAdmin
      .from('print_damage_claims')
      .upsert(
        {
          print_id: printId,
          claimant_id: user.id,
          status: 'pending',
          damage_front_photo_url: damageFrontPhotoUrl,
          damage_back_photo_url: damageBackPhotoUrl,
          damage_submitted_at: now,
          // Reset destruction fields in case this replaces a rejected claim
          destruction_photo_url: null,
          destruction_submitted_at: null,
          reviewed_by: null,
          reviewed_at: null,
          reviewer_notes: null,
          reprint_authorized_at: null,
        },
        { onConflict: 'print_id' }
      )
      .select('id')
      .single();

    if (claimError || !claim) throw new HttpError(500, 'Could not create damage claim.');

    // Notify admin
    if (TAPNSIGN_ADMIN_USER_ID) {
      const label = await getAutographDisplayLabel(print.autograph_id);
      await notifyUser(
        TAPNSIGN_ADMIN_USER_ID,
        'New Print Damage Claim',
        `A damage claim was submitted for ${label}. Review it in the admin panel.`
      );
    }

    return json({
      claim: {
        id: claim.id,
        print_id: printId,
        status: 'pending',
      },
    });
  }, req)
);
