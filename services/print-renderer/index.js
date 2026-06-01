'use strict';

/**
 * print-renderer — Railway service
 *
 * Renders the 8×10 print layout for Prodigi SKU GLOBAL-PHO-8X10.
 * Uses sharp (librsvg) for SVG→PNG, which honours system fonts — Optima is
 * installed in the Docker image so metadata text renders correctly.
 *
 * POST /render   { autograph_id, print_id, internal_secret? }
 *                Header: x-internal-secret: <INTERNAL_FUNCTION_SECRET>
 * GET  /health
 */

const express = require('express');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PORT = process.env.PORT ?? 8080;
const INTERNAL_SECRET = process.env.INTERNAL_FUNCTION_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const OUTPUT_BUCKET = 'print-layouts';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[print-renderer] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Layout constants — landscape 3000×2400 (10"×8" @ 300 DPI)
// Derived from Figma template at 1008×809px
// ---------------------------------------------------------------------------

const CANVAS_W = 3000; // landscape width  (10")
const CANVAS_H = 2400; // landscape height  (8")

const SX = CANVAS_W / 1008; // ≈ 2.9762
const SY = CANVAS_H / 809;  // ≈ 2.9666
const tx = (v) => Math.round(v * SX);
const ty = (v) => Math.round(v * SY);

const FRAME12 = { x: tx(89),  y: ty(88),  w: tx(373), h: ty(624) };
const SIG_SQ  = { x: tx(600), y: ty(89),  w: tx(273), h: ty(257) };

const _QR_AREA   = { x: tx(793), y: ty(390), w: tx(90), h: ty(88) };
const _LOGO_AREA = { y: ty(492), h: ty(26) };
const BADGE_AREA = {
  x: _QR_AREA.x,
  y: _QR_AREA.y,
  w: _QR_AREA.w,
  h: (_LOGO_AREA.y + _LOGO_AREA.h) - _QR_AREA.y,
};

const META_AREA = { x: tx(499), y: ty(388), w: tx(284), h: ty(142) };

const SF_Y     = ty(573);
const SF_W     = tx(88);
const SF_H     = Math.round(SF_W * 5 / 3);
const SF_TOTAL = tx(930) - tx(533);
const SF_GAP   = Math.round((SF_TOTAL - 4 * SF_W) / 3);
const SMALL_FRAMES = [
  { x: tx(533),                       y: SF_Y, w: SF_W, h: SF_H },
  { x: tx(533) + (SF_W + SF_GAP),     y: SF_Y, w: SF_W, h: SF_H },
  { x: tx(533) + (SF_W + SF_GAP) * 2, y: SF_Y, w: SF_W, h: SF_H },
  { x: tx(533) + (SF_W + SF_GAP) * 3, y: SF_Y, w: SF_W, h: SF_H },
];

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSmoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}

function strokesToSvgPathsCentered(strokes, strokeColor, targetW, targetH) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX)) return '';

  const bboxW = maxX - minX || 1;
  const bboxH = maxY - minY || 1;
  const scale = Math.min((targetW * 0.88) / bboxW, (targetH * 0.88) / bboxH);
  const scaledW = bboxW * scale;
  const scaledH = bboxH * scale;
  const offsetX = (targetW - scaledW) / 2 - minX * scale;
  const offsetY = (targetH - scaledH) / 2 - minY * scale;
  const sw = Math.max(4, Math.round(targetW / 80));

  const isGold = strokeColor === '#F1C168' || strokeColor === '#C9A84C';
  const paths = strokes.flatMap((stroke) => {
    if (!stroke.points.length) return [];
    const transformed = stroke.points.map((p) => ({
      x: p.x * scale + offsetX,
      y: p.y * scale + offsetY,
    }));
    const d = buildSmoothPath(transformed);
    if (!d) return [];
    if (isGold) {
      return [
        `<path d="${d}" stroke="#D9AF4C" stroke-width="${sw * 1.2}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`,
        `<path d="${d}" stroke="#FFF0A0" stroke-width="${sw * 0.48}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"/>`,
      ];
    }
    return [`<path d="${d}" stroke="${strokeColor}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`];
  });
  return paths.join('\n');
}

async function fetchAsBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[print-renderer] fetchAsBase64 failed: ${res.status} ${url}`);
      return '';
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    return `data:${ct};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.error(`[print-renderer] fetchAsBase64 error: ${err.message} ${url}`);
    return '';
  }
}

function toTransformUrl(originalUrl, width, height) {
  try {
    const u = new URL(originalUrl);
    u.pathname = u.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    u.searchParams.set('width', String(width));
    u.searchParams.set('height', String(height));
    u.searchParams.set('resize', 'cover');
    return u.toString();
  } catch {
    return originalUrl;
  }
}

function frameBorderSvg(r, pad = 6, color = 'white', opacity = 0.45) {
  return `
    <rect x="${r.x - pad}" y="${r.y - pad}" width="${r.w + pad * 2}" height="${r.h + pad * 2}"
      fill="none" stroke="${color}" stroke-width="2" opacity="${opacity}"/>
    <rect x="${r.x - pad * 2.5}" y="${r.y - pad * 2.5}" width="${r.w + pad * 5}" height="${r.h + pad * 5}"
      fill="none" stroke="${color}" stroke-width="1" opacity="${opacity * 0.5}"/>`;
}

function buildLayoutSvg({
  frame12DataUri, smallFrameDataUris, strokes,
  creatorName, sequenceNumber, printSequenceNumber, seriesName, capturedAt, badgeDataUri,
}) {
  const date = new Date(capturedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const nameLabel = sequenceNumber != null
    ? `${creatorName.toUpperCase()} #${sequenceNumber}`
    : creatorName.toUpperCase();

  const elements = [];

  // Black background
  elements.push(`<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#000000"/>`);

  // Hero card (frame 4) — large left column
  elements.push(`
    <defs>
      <clipPath id="frame12_clip">
        <rect x="${FRAME12.x}" y="${FRAME12.y}" width="${FRAME12.w}" height="${FRAME12.h}"/>
      </clipPath>
    </defs>
    <image href="${frame12DataUri}"
      x="${FRAME12.x}" y="${FRAME12.y}" width="${FRAME12.w}" height="${FRAME12.h}"
      preserveAspectRatio="xMidYMid slice" clip-path="url(#frame12_clip)"/>
  `);

  // Signature square: black fill + gold strokes centred and scaled
  elements.push(`<rect x="${SIG_SQ.x}" y="${SIG_SQ.y}" width="${SIG_SQ.w}" height="${SIG_SQ.h}" fill="#000000"/>`);
  const centeredPaths = strokesToSvgPathsCentered(strokes, '#F1C168', SIG_SQ.w, SIG_SQ.h);
  if (centeredPaths) {
    elements.push(`<g transform="translate(${SIG_SQ.x}, ${SIG_SQ.y})">${centeredPaths}</g>`);
  }

  // Progression frames (indices 0–3)
  for (let i = 0; i < SMALL_FRAMES.length; i++) {
    const sf = SMALL_FRAMES[i];
    const dataUri = smallFrameDataUris[i];
    if (dataUri) {
      elements.push(`
        <defs>
          <clipPath id="sf_clip_${i}">
            <rect x="${sf.x}" y="${sf.y}" width="${sf.w}" height="${sf.h}"/>
          </clipPath>
        </defs>
        <image href="${dataUri}"
          x="${sf.x}" y="${sf.y}" width="${sf.w}" height="${sf.h}"
          preserveAspectRatio="xMidYMid slice" clip-path="url(#sf_clip_${i})"/>
      `);
    }
  }

  // Verify badge
  elements.push(`
    <image href="${badgeDataUri}"
      x="${BADGE_AREA.x}" y="${BADGE_AREA.y}" width="${BADGE_AREA.w}" height="${BADGE_AREA.h}"
      preserveAspectRatio="xMidYMid meet"/>
  `);

  // Metadata text — Optima installed as system font via Dockerfile
  const metaLines = [
    { text: nameLabel,                         fontSize: 72, opacity: 1.00, bold: true,  letterSpacing: 3 },
    { text: `Captured on ${date}`,             fontSize: 52, opacity: 0.75, bold: false, letterSpacing: 1 },
    { text: `Print #${printSequenceNumber}`,   fontSize: 52, opacity: 0.75, bold: false, letterSpacing: 1 },
    ...(seriesName ? [{ text: seriesName,      fontSize: 48, opacity: 0.65, bold: false, letterSpacing: 1 }] : []),
  ];
  const lineH = 100;
  metaLines.forEach((line, i) => {
    elements.push(`
      <text
        x="${META_AREA.x + 20}"
        y="${META_AREA.y + 72 + i * lineH}"
        font-family="Optima, Optima Nova LT, serif"
        font-size="${line.fontSize}"
        font-weight="${line.bold ? 'bold' : 'normal'}"
        fill="white"
        opacity="${line.opacity}"
        letter-spacing="${line.letterSpacing}"
      >${escapeXml(line.text)}</text>
    `);
  });

  // Decorative borders
  elements.push(`
    <rect x="10" y="10" width="${CANVAS_W - 20}" height="${CANVAS_H - 20}"
      fill="none" stroke="white" stroke-width="3" opacity="0.5"/>
    <rect x="38" y="38" width="${CANVAS_W - 76}" height="${CANVAS_H - 76}"
      fill="none" stroke="white" stroke-width="1.5" opacity="0.3"/>
    ${frameBorderSvg(FRAME12)}
    ${frameBorderSvg(SIG_SQ, 6, '#F1C168', 0.55)}
    ${SMALL_FRAMES.map((sf) => frameBorderSvg(sf, 4)).join('\n')}
  `);

  // Portrait 2400×3000 SVG — landscape content rotated 90°
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${CANVAS_H}" height="${CANVAS_W}" viewBox="0 0 ${CANVAS_H} ${CANVAS_W}">
  <g transform="translate(${CANVAS_H}, 0) rotate(90)">
    ${elements.join('\n  ')}
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function isAuthorized(req) {
  if (!INTERNAL_SECRET) return true; // no secret set → open (local dev)
  const headerSecret = req.headers['x-internal-secret'] ?? '';
  const bodySecret   = req.body?.internal_secret ?? '';
  return headerSecret === INTERNAL_SECRET || bodySecret === INTERNAL_SECRET;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/render', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const autographId = req.body?.autograph_id;
  const printId     = req.body?.print_id;
  if (!autographId || !printId) {
    return res.status(400).json({ error: 'autograph_id and print_id are required' });
  }

  try {
    // Fetch autograph
    const { data: autograph, error: autographError } = await supabase
      .from('autographs')
      .select('id, owner_id, creator_id, status, strokes_json, stroke_color, preview_frame_urls, creator_sequence_number, series_id, created_at, verify_badge_url')
      .eq('id', autographId)
      .maybeSingle();

    if (autographError || !autograph) return res.status(404).json({ error: 'Autograph not found' });
    if (autograph.status !== 'active') return res.status(409).json({ error: 'Autograph is not active' });
    if (!autograph.verify_badge_url) return res.status(422).json({ error: 'Verify badge not found — re-mint this autograph' });

    // Fetch print record
    const { data: printRecord, error: printError } = await supabase
      .from('autograph_prints')
      .select('id, autograph_id, owner_id_at_print, print_sequence_number, print_layout_url')
      .eq('id', printId)
      .maybeSingle();

    if (printError || !printRecord) return res.status(404).json({ error: 'Print record not found' });
    if (printRecord.autograph_id !== autographId) return res.status(409).json({ error: 'Print does not match autograph' });

    // Return cached layout
    if (printRecord.print_layout_url) {
      console.log('[print-renderer] returning cached URL');
      return res.json({ print_layout_url: printRecord.print_layout_url });
    }

    const userId = printRecord.owner_id_at_print;

    // Creator display name
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', autograph.creator_id)
      .maybeSingle();
    const creatorName = creatorProfile?.display_name ?? 'Unknown';

    // Series name
    let seriesName = null;
    if (autograph.series_id) {
      const { data: series } = await supabase
        .from('series')
        .select('name')
        .eq('id', autograph.series_id)
        .maybeSingle();
      seriesName = series?.name ?? null;
    }

    const frameUrls = autograph.preview_frame_urls ?? [];
    if (frameUrls.length < 5) {
      return res.status(422).json({ error: 'At least 5 preview frames are required' });
    }

    // Fetch images at full resolution — no memory constraints on Railway
    console.log('[print-renderer] fetching frames and badge');
    const [frame12DataUri, sf0, sf1, sf2, sf3, badgeDataUri] = await Promise.all([
      fetchAsBase64(toTransformUrl(frameUrls[4], FRAME12.w, FRAME12.h)),
      fetchAsBase64(toTransformUrl(frameUrls[0], SMALL_FRAMES[0].w, SMALL_FRAMES[0].h)),
      fetchAsBase64(toTransformUrl(frameUrls[1], SMALL_FRAMES[1].w, SMALL_FRAMES[1].h)),
      fetchAsBase64(toTransformUrl(frameUrls[2], SMALL_FRAMES[2].w, SMALL_FRAMES[2].h)),
      fetchAsBase64(toTransformUrl(frameUrls[3], SMALL_FRAMES[3].w, SMALL_FRAMES[3].h)),
      fetchAsBase64(autograph.verify_badge_url),
    ]);
    console.log('[print-renderer] assets fetched, building SVG');

    const strokes = Array.isArray(autograph.strokes_json) ? autograph.strokes_json : [];

    const svgContent = buildLayoutSvg({
      frame12DataUri,
      smallFrameDataUris: [sf0, sf1, sf2, sf3],
      strokes,
      creatorName,
      sequenceNumber: autograph.creator_sequence_number ?? null,
      printSequenceNumber: printRecord.print_sequence_number,
      seriesName,
      capturedAt: autograph.created_at,
      badgeDataUri,
    });

    // Render SVG → PNG at full 2400×3000 (300 DPI) via sharp / librsvg
    console.log('[print-renderer] rendering SVG, length:', svgContent.length);
    const pngBuffer = await sharp(Buffer.from(svgContent)).png().toBuffer();
    console.log('[print-renderer] PNG bytes:', pngBuffer.length);

    // Upload to Supabase storage
    const pngPath = `${userId}/print_layouts/${autographId}_print_${printId}.png`;
    const { error: uploadError } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .upload(pngPath, pngBuffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.error('[print-renderer] upload error:', uploadError.message);
      return res.status(500).json({ error: `Upload failed: ${uploadError.message}` });
    }

    const printLayoutUrl = supabase.storage.from(OUTPUT_BUCKET).getPublicUrl(pngPath).data.publicUrl;

    // Cache on print record
    await supabase
      .from('autograph_prints')
      .update({ print_layout_url: printLayoutUrl })
      .eq('id', printId);

    console.log('[print-renderer] done:', printLayoutUrl);
    return res.json({ print_layout_url: printLayoutUrl });

  } catch (err) {
    console.error('[print-renderer] unhandled error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

app.listen(PORT, () => console.log(`[print-renderer] listening on :${PORT}`));
