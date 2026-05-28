import {
  assert,
  cancelAuthorizedPaymentEvent,
  captureAuthorizedPaymentEvent,
  getProfile,
  handleRequest,
  json,
  notifyUser,
  parseJson,
  requirePositiveInteger,
  requireString,
  requireUser,
  supabaseAdmin,
  updateBuyerCommitmentStatus,
} from '../_shared/utils.ts';

type StrokePoint = { x: number; y: number; t: number };
type Stroke = { id: string; points: StrokePoint[] };

const STORAGE_BUCKET = 'autograph-videos';

async function uploadToBunnyStorage(buffer: ArrayBuffer, path: string): Promise<string> {
  const apiKey = Deno.env.get('BUNNY_STORAGE_API_KEY');
  const zoneName = Deno.env.get('BUNNY_STORAGE_ZONE_NAME');
  const cdnHostname = Deno.env.get('BUNNY_CDN_HOSTNAME');
  const endpoint = Deno.env.get('BUNNY_STORAGE_ENDPOINT') ?? 'storage.bunnycdn.com';

  assert(apiKey && zoneName && cdnHostname, 500, 'Bunny Storage is not configured.');

  const resp = await fetch(`https://${endpoint}/${zoneName}/${path}`, {
    method: 'PUT',
    headers: { 'AccessKey': apiKey, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });

  assert(resp.ok, 500, `Bunny Storage upload failed (HTTP ${resp.status}).`);
  return `https://${cdnHostname}/${path}`;
}

function normalizeStoragePath(value: string, userId: string, field: string) {
  const path = value.replace(/^\/+/, '');
  assert(path.length > 0, 400, `${field} is required.`);
  assert(path.startsWith(`${userId}/`), 403, `${field} must belong to the signed-in user.`);
  return path;
}

function requireStrokeArray(value: unknown): Stroke[] {
  assert(Array.isArray(value), 400, 'strokes_json must be an array.');

  return value.map((stroke, index) => {
    assert(!!stroke && typeof stroke === 'object', 400, `stroke ${index + 1} is invalid.`);
    const anyStroke = stroke as Record<string, unknown>;
    const id = requireString(anyStroke.id, `strokes_json[${index}].id`);
    const rawPoints = anyStroke.points;
    assert(Array.isArray(rawPoints), 400, `strokes_json[${index}].points must be an array.`);

    const points = rawPoints.map((point, pointIndex) => {
      assert(!!point && typeof point === 'object', 400, `strokes_json[${index}].points[${pointIndex}] is invalid.`);
      const anyPoint = point as Record<string, unknown>;
      const x = Number(anyPoint.x);
      const y = Number(anyPoint.y);
      const t = Number(anyPoint.t);
      assert(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(t), 400, `strokes_json[${index}].points[${pointIndex}] must contain numeric x, y, and t.`);
      return { x, y, t };
    });

    return { id, points };
  });
}

function getStoragePublicUrl(path: string) {
  return supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function canonicalizeStrokes(strokes: Stroke[]) {
  return JSON.stringify(
    strokes.map((stroke) => ({
      id: stroke.id,
      points: stroke.points.map((point) => ({
        x: Number(point.x.toFixed(4)),
        y: Number(point.y.toFixed(4)),
        t: Number(point.t.toFixed(4)),
      })),
    }))
  );
}

async function sha256HexFromBuffer(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256HexFromString(value: string) {
  return sha256HexFromBuffer(new TextEncoder().encode(value));
}

async function fetchStorageAsset(path: string) {
  const publicUrl = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(path);
  assert(!error && data, 400, `Could not read uploaded asset at ${path}.`);
  const buffer = await data.arrayBuffer();
  return {
    publicUrl,
    buffer,
    byteSize: buffer.byteLength,
    mimeType: data.type || 'application/octet-stream',
    sha256: await sha256HexFromBuffer(buffer),
  };
}

async function removeUploadedAssets(paths: string[]) {
  if (!paths.length) return;
  try {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(paths);
  } catch {}
}

Deno.serve((req) =>
  handleRequest(async (request) => {
    const user = await requireUser(request);
    const profile = await getProfile(user.id);
    assert(!profile.suspended_at, 403, 'Account is suspended.');
    assert(profile.role === 'verified' && profile.verification_status === 'verified', 403, 'Only verified accounts can mint autographs.');

    const body = await parseJson(request);
    // video_path is optional — new captures use only frame images (no video)
    const videoPath = body.video_path
      ? normalizeStoragePath(requireString(body.video_path, 'video_path'), user.id, 'video_path')
      : null;
    const thumbnailPath = body.thumbnail_path ? normalizeStoragePath(requireString(body.thumbnail_path, 'thumbnail_path'), user.id, 'thumbnail_path') : null;
    const personalizedRequestId = typeof body.personalized_request_id === 'string' && body.personalized_request_id.trim().length
      ? body.personalized_request_id.trim()
      : null;
    const previewFramePaths = Array.isArray(body.preview_frame_paths)
      ? body.preview_frame_paths.map((value, index) => normalizeStoragePath(requireString(value, `preview_frame_paths[${index}]`), user.id, `preview_frame_paths[${index}]`))
      : [];
    const captureWidth = requirePositiveInteger(body.capture_width, 'capture_width');
    const captureHeight = requirePositiveInteger(body.capture_height, 'capture_height');
    const strokeColor = requireString(body.stroke_color, 'stroke_color');
    const templateId = requireString(body.template_id, 'template_id');
    const strokes = requireStrokeArray(body.strokes_json);

    let personalizedRequest: {
      id: string;
      requester_id: string;
      recipient_name: string;
      inscription_text: string | null;
      status: string;
      expires_at: string;
      buyer_commitment_id: string | null;
      authorization_payment_event_id: string | null;
    } | null = null;

    if (personalizedRequestId) {
      const { data, error } = await supabaseAdmin
        .from('personalized_autograph_requests')
        .select('id, creator_id, requester_id, recipient_name, inscription_text, status, expires_at, buyer_commitment_id, authorization_payment_event_id')
        .eq('id', personalizedRequestId)
        .eq('creator_id', user.id)
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Personalized request not found.');
      }

      if (data.status !== 'accepted') {
        assert(false, 409, 'Personalized request is not ready for capture.');
      }
      if (new Date(data.expires_at).getTime() <= Date.now()) {
        await supabaseAdmin
          .from('personalized_autograph_requests')
          .update({
            status: 'expired',
            responded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
          .eq('status', 'accepted');
        await updateBuyerCommitmentStatus(data.buyer_commitment_id, 'expired');
        await cancelAuthorizedPaymentEvent(data.authorization_payment_event_id);
        assert(false, 409, 'This personalized request has expired and needs a new authorization.');
      }
      personalizedRequest = data;
    }

    const [videoAsset, thumbnailAsset, previewFrameAssets] = await Promise.all([
      videoPath ? fetchStorageAsset(videoPath) : Promise.resolve(null),
      thumbnailPath ? fetchStorageAsset(thumbnailPath).catch(() => null) : Promise.resolve(null),
      Promise.all(previewFramePaths.map((path) => fetchStorageAsset(path))),
    ]);

    const canonicalStrokes = canonicalizeStrokes(strokes);
    const strokesHash = await sha256HexFromString(canonicalStrokes);
    const uploadedPaths = [...(videoPath ? [videoPath] : []), ...(thumbnailPath ? [thumbnailPath] : []), ...previewFramePaths];

    // Upload to Bunny CDN using the already-downloaded bytes (no second download needed)
    const bunnyVideoUrl = videoAsset && videoPath
      ? await uploadToBunnyStorage(videoAsset.buffer, videoPath)
      : null;
    const bunnyThumbnailUrl = thumbnailAsset && thumbnailPath
      ? await uploadToBunnyStorage(thumbnailAsset.buffer, thumbnailPath)
      : null;
    const previewFramePublicUrls = previewFramePaths.map((path) => getStoragePublicUrl(path));
    const fallbackThumbnailUrl = previewFramePublicUrls[previewFramePublicUrls.length - 1] ?? null;

    // Duplicate detection: use video SHA256 when available, otherwise strokes hash alone
    const { data: existingDuplicate } = await supabaseAdmin
      .from('autographs')
      .select('id, certificate_id, status')
      .eq('creator_id', user.id)
      .eq('strokes_sha256', strokesHash)
      .neq('status', 'deleted')
      .limit(1)
      .maybeSingle();

    if (existingDuplicate) {
      await removeUploadedAssets(uploadedPaths);
      assert(false, 409, 'This autograph appears to be a duplicate of one you have already minted.');
    }

    const integrityManifest = JSON.stringify({
      version: 1,
      creator_id: user.id,
      video_sha256: videoAsset?.sha256 ?? null,
      thumbnail_sha256: thumbnailAsset?.sha256 ?? null,
      preview_frame_sha256s: previewFrameAssets.map((asset) => asset.sha256),
      strokes_sha256: strokesHash,
      capture_width: captureWidth,
      capture_height: captureHeight,
      stroke_color: strokeColor,
      template_id: templateId,
    });
    const contentHash = await sha256HexFromString(integrityManifest);

    const { data: autograph, error: autographError } = await supabaseAdmin
      .from('autographs')
      .insert({
        creator_id: user.id,
        owner_id: user.id,
        status: 'active',
        ownership_source: 'capture',
        video_url: bunnyVideoUrl ?? null,
        thumbnail_url: bunnyThumbnailUrl ?? fallbackThumbnailUrl,
        preview_frame_urls: previewFramePublicUrls,
        strokes_json: strokes,
        capture_width: captureWidth,
        capture_height: captureHeight,
        content_hash: contentHash,
        integrity_manifest_hash: contentHash,
        video_sha256: videoAsset?.sha256 ?? null,
        strokes_sha256: strokesHash,
        stroke_color: strokeColor,
        template_id: templateId,
        visibility: 'private',
        sale_state: 'not_for_sale',
        is_for_sale: false,
        open_to_trade: false,
        price_cents: null,
        latest_transfer_id: null,
        personalized_request_id: personalizedRequest?.id ?? null,
        personalized_recipient_name: personalizedRequest?.recipient_name ?? null,
        personalized_inscription_text: personalizedRequest?.inscription_text ?? null,
        reserved_for_user_id: personalizedRequest?.requester_id ?? null,
      })
      .select('id, certificate_id, visibility, sale_state, is_for_sale, creator_sequence_number')
      .single();

    if (autographError || !autograph) {
      await removeUploadedAssets(uploadedPaths);
      throw new Error(autographError?.message ?? 'Could not mint autograph.');
    }

    const mediaAssetRows = [
      ...(videoAsset && videoPath && bunnyVideoUrl ? [{
        autograph_id: autograph.id,
        kind: 'capture_video',
        storage_bucket: STORAGE_BUCKET,
        storage_path: videoPath,
        public_url: bunnyVideoUrl,
        mime_type: videoAsset.mimeType,
        byte_size: videoAsset.byteSize,
        sha256: videoAsset.sha256,
        integrity_status: 'verified',
        created_by: user.id,
      }] : []),
      ...(thumbnailAsset && thumbnailPath && bunnyThumbnailUrl
        ? [{
            autograph_id: autograph.id,
            kind: 'thumbnail',
            storage_bucket: STORAGE_BUCKET,
            storage_path: thumbnailPath,
            public_url: bunnyThumbnailUrl,
            mime_type: thumbnailAsset.mimeType,
            byte_size: thumbnailAsset.byteSize,
            sha256: thumbnailAsset.sha256,
            integrity_status: 'verified',
            created_by: user.id,
          }]
        : []),
      ...previewFrameAssets.map((asset, index) => ({
        autograph_id: autograph.id,
        kind: 'preview_frame' as const,
        storage_bucket: STORAGE_BUCKET,
        storage_path: previewFramePaths[index],
        public_url: previewFramePublicUrls[index],
        mime_type: asset.mimeType,
        byte_size: asset.byteSize,
        sha256: asset.sha256,
        integrity_status: 'verified' as const,
        created_by: user.id,
      })),
    ];

    const { data: insertedAssets, error: mediaAssetError } = await supabaseAdmin
      .from('media_assets')
      .insert(mediaAssetRows)
      .select('id, kind');

    if (mediaAssetError || !insertedAssets?.length) {
      await removeUploadedAssets(uploadedPaths);
      await supabaseAdmin.from('autographs').delete().eq('id', autograph.id);
      throw new Error(mediaAssetError?.message ?? 'Could not store media asset metadata.');
    }

    const videoMediaAssetId = insertedAssets.find((asset) => asset.kind === 'capture_video')?.id ?? null;

    if (videoMediaAssetId) {
      const { error: linkError } = await supabaseAdmin
        .from('autographs')
        .update({ media_asset_id: videoMediaAssetId })
        .eq('id', autograph.id);

      if (linkError) {
        await removeUploadedAssets(uploadedPaths);
        await supabaseAdmin.from('media_assets').delete().eq('autograph_id', autograph.id);
        await supabaseAdmin.from('autographs').delete().eq('id', autograph.id);
        throw new Error(linkError.message);
      }
    }

    if (personalizedRequest) {
      const nowIso = new Date().toISOString();
      const paymentDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: requestUpdateError } = await supabaseAdmin
        .from('personalized_autograph_requests')
        .update({
          status: 'fulfilled',
          minted_autograph_id: autograph.id,
          fulfilled_at: nowIso,
          payment_due_at: paymentDueAt,
          responded_at: nowIso,
        })
        .eq('id', personalizedRequest.id)
        .eq('status', 'accepted');

      if (requestUpdateError) {
        throw new Error(requestUpdateError.message);
      }

      await notifyUser(
        personalizedRequest.requester_id,
        'Personalized Autograph Ready',
        `Your personalized autograph for ${personalizedRequest.recipient_name} is ready. Complete payment within 24 hours.`
      );

      if (personalizedRequest.authorization_payment_event_id) {
        try {
          await captureAuthorizedPaymentEvent(personalizedRequest.authorization_payment_event_id);
          const { error: finalizeError } = await supabaseAdmin.rpc(
            'rpc_finalize_personalized_request_purchase',
            {
              p_request_id: personalizedRequest.id,
              p_payment_event_id: personalizedRequest.authorization_payment_event_id,
              p_buyer_id: personalizedRequest.requester_id,
            },
          );

          if (finalizeError) {
            throw new Error(finalizeError.message);
          }

          await notifyUser(
            personalizedRequest.requester_id,
            'Personalized Autograph Delivered',
            `Your personalized autograph for ${personalizedRequest.recipient_name} has been completed and added to your collection.`
          );
        } catch (error) {
          console.warn('personalized authorization capture fallback:', error);
        }
      }
    }

    return json({
      autograph: {
        id: autograph.id,
        certificate_id: autograph.certificate_id,
        visibility: autograph.visibility,
        sale_state: autograph.sale_state,
        is_for_sale: autograph.is_for_sale,
        content_hash: contentHash,
        creator_sequence_number: autograph.creator_sequence_number ?? null,
      },
    });
  }, req)
);
