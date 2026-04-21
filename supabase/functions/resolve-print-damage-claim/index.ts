import {
  assert,
  getAutographDisplayLabel,
  handleRequest,
  HttpError,
  json,
  notifyUser,
  optionalString,
  parseJson,
  requireInternalRequest,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';

// Valid admin actions
type AdminAction = 'request_destruction' | 'approve' | 'reject';

Deno.serve((req) =>
  handleRequest(async (request) => {
    // Admin-only — requires internal secret or service role
    requireInternalRequest(request);

    const user = await requireUser(request);
    const body = await parseJson(request);

    const claimId = requireString(body.claim_id, 'claim_id');
    const action = requireString(body.action, 'action') as AdminAction;
    const reviewerNotes = optionalString(body.reviewer_notes);

    assert(
      ['request_destruction', 'approve', 'reject'].includes(action),
      400,
      'action must be one of: request_destruction, approve, reject.'
    );

    const { data: claim, error: claimError } = await supabaseAdmin
      .from('print_damage_claims')
      .select('id, print_id, claimant_id, status, destruction_photo_url')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) throw new HttpError(404, 'Damage claim not found.');

    const now = new Date().toISOString();

    if (action === 'request_destruction') {
      assert(
        claim.status === 'pending' || claim.status === 'evidence_requested',
        409,
        `Cannot request destruction from status '${claim.status}'.`
      );

      const { error } = await supabaseAdmin
        .from('print_damage_claims')
        .update({
          status: 'destruction_requested',
          reviewed_by: user.id,
          reviewed_at: now,
          reviewer_notes: reviewerNotes,
        })
        .eq('id', claimId);

      if (error) throw new HttpError(500, 'Could not update claim.');

      // Notify collector to submit destruction photo
      await notifyUser(
        claim.claimant_id,
        'Print Claim Update',
        'Your damage evidence has been reviewed. Please cut your print in half and submit a photo to proceed with your reprint.'
      );

      return json({ claim: { id: claimId, status: 'destruction_requested' } });
    }

    if (action === 'approve') {
      assert(
        claim.status === 'destruction_requested',
        409,
        `Cannot approve from status '${claim.status}'. Destruction photo must be submitted first.`
      );
      assert(
        !!claim.destruction_photo_url,
        409,
        'No destruction photo has been submitted yet.'
      );

      // Load the print to get autograph_id for notifications
      const { data: print, error: printError } = await supabaseAdmin
        .from('autograph_prints')
        .select('id, autograph_id')
        .eq('id', claim.print_id)
        .single();

      if (printError || !print) throw new HttpError(404, 'Print record not found.');

      // Cancel the damaged print — removes the one_per_owner unique constraint block
      const { error: printUpdateError } = await supabaseAdmin
        .from('autograph_prints')
        .update({
          status: 'canceled',
          canceled_at: now,
        })
        .eq('id', claim.print_id);

      if (printUpdateError) throw new HttpError(500, 'Could not cancel damaged print record.');

      // Mark claim as approved
      const { error: claimUpdateError } = await supabaseAdmin
        .from('print_damage_claims')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: now,
          reviewer_notes: reviewerNotes,
          reprint_authorized_at: now,
        })
        .eq('id', claimId);

      if (claimUpdateError) throw new HttpError(500, 'Could not approve claim.');

      // Notify collector they can reprint
      const label = await getAutographDisplayLabel(print.autograph_id);
      await notifyUser(
        claim.claimant_id,
        'Reprint Authorized',
        `Your damage claim for ${label} has been approved. You can now order a new print from the app.`
      );

      return json({ claim: { id: claimId, status: 'approved', reprint_authorized_at: now } });
    }

    if (action === 'reject') {
      assert(
        ['pending', 'evidence_requested', 'destruction_requested'].includes(claim.status),
        409,
        `Cannot reject from status '${claim.status}'.`
      );

      const { error } = await supabaseAdmin
        .from('print_damage_claims')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: now,
          reviewer_notes: reviewerNotes,
        })
        .eq('id', claimId);

      if (error) throw new HttpError(500, 'Could not reject claim.');

      await notifyUser(
        claim.claimant_id,
        'Print Claim Update',
        'Your print damage claim has been reviewed. Please contact support at andy@tapnsign.com if you have questions.'
      );

      return json({ claim: { id: claimId, status: 'rejected' } });
    }

    // Unreachable — assert above guards all cases
    throw new HttpError(400, 'Invalid action.');
  }, req)
);
