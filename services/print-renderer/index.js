'use strict';

const express = require('express');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const OUTPUT_BUCKET = 'print-layouts';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Layout constants
// Generated in landscape 3000×2400 (10"×8" @ 300 DPI),
// then rotated 90° CW → 2400×3000 portrait for Prodigi GLOBAL-PHO-8X10.
// Positions derived from Figma template (assets/print-layout-8x10.png, 1008×809px).
// ---------------------------------------------------------------------------

const CANVAS_W = 3000; // 10"
const CANVAS_H = 2400; //  8"

// Scale from Figma template coords to output pixels
const SX = CANVAS_W / 1008; // 2.9762
const SY = CANVAS_H / 809;  // 2.9666

const tx = (v) => Math.round(v * SX);
const ty = (v) => Math.round(v * SY);

// Large frame 12 — left column
const FRAME12 = { x: tx(89), y: ty(88), w: tx(373), h: ty(624) };

// Signature strokes square (top-right) — gold strokes on black, no photo
const SIG_SQ = { x: tx(600), y: ty(89), w: tx(273), h: ty(257) };

// QR code (right side, middle) — slightly enlarged so exact positioning is forgiving
const QR_AREA = { x: tx(793), y: ty(390), w: tx(90), h: ty(88) };

// Metadata text (left of QR/logo column)
const META_AREA = { x: tx(499), y: ty(388), w: tx(284), h: ty(142) };

// Small frames row — frames 4, 6, 8, 10 (0-indexed: 3, 5, 7, 9)
const SF_Y = ty(573);
const SF_H = ty(142);
const SF_W = tx(88);
const SF_TOTAL = tx(930) - tx(533);
const SF_GAP = Math.round((SF_TOTAL - 4 * SF_W) / 3);

const SMALL_FRAMES = [
  { frameIdx: 3, timeS: 2.65, x: tx(533),                       y: SF_Y, w: SF_W, h: SF_H },
  { frameIdx: 5, timeS: 3.75, x: tx(533) + (SF_W + SF_GAP),     y: SF_Y, w: SF_W, h: SF_H },
  { frameIdx: 7, timeS: 4.85, x: tx(533) + (SF_W + SF_GAP) * 2, y: SF_Y, w: SF_W, h: SF_H },
  { frameIdx: 9, timeS: 5.95, x: tx(533) + (SF_W + SF_GAP) * 3, y: SF_Y, w: SF_W, h: SF_H },
];

// Preload assets from bundled directory
const LOGO_PATH = path.join(__dirname, 'assets', 'ophinia-logo-white.png');
const LOGO_BUF = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
if (!LOGO_BUF) console.warn('[init] ophinia-logo-white.png not found in assets/');

const FONT_PATH = path.join(__dirname, 'assets', 'Optima.ttc');
const FONT_B64 = fs.existsSync(FONT_PATH)
  ? fs.readFileSync(FONT_PATH).toString('base64')
  : null;
if (!FONT_B64) console.warn('[init] Optima.ttc not found in assets/ — falling back to DejaVu Serif');

// Logo area (below QR)
const LOGO_AREA = { x: tx(791), y: ty(492), w: tx(80), h: ty(26) };

// ---------------------------------------------------------------------------
// Helpers
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

// Renders strokes scaled from sourceW×sourceH → targetW×targetH.
// upToTimeSeconds=Infinity for complete signature.
function strokesToSvgPaths(strokes, upToTimeSeconds, color, sourceW, sourceH, targetW, targetH) {
  const scaleX = targetW / (sourceW || 1);
  const scaleY = targetH / (sourceH || 1);
  const strokeWidth = Math.max(3, 6 * Math.min(scaleX, scaleY));
  const isGold = color === '#F1C168' || color === '#C9A84C' || color === 'gold';

  const paths = strokes.flatMap((stroke) => {
    const visible = stroke.points.filter((p) => p.t == null || p.t <= upToTimeSeconds);
    if (!visible.length) return [];
    const scaled = visible.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
    const d = buildSmoothPath(scaled);
    if (!d) return [];
    if (isGold) {
      return [
        `<path d="${d}" stroke="#D9AF4C" stroke-width="${strokeWidth * 1.2}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`,
        `<path d="${d}" stroke="#FFF0A0" stroke-width="${strokeWidth * 0.48}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"/>`,
      ];
    }
    return [`<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`];
  });

  return paths.join('\n');
}

// Renders the complete signature centered and scaled to fill targetW×targetH with padding.
// Used for the signature square where we want the sig to be well-framed regardless of
// where in the capture frame the creator signed.
function strokesToSvgPathsCentered(strokes, color, targetW, targetH) {
  // Compute bounding box of all stroke points
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

  // Scale bounding box to fit target at 88% fill, maintaining aspect ratio
  const scale = Math.min((targetW * 0.88) / bboxW, (targetH * 0.88) / bboxH);

  // Center the scaled bounding box within the target
  const scaledW = bboxW * scale;
  const scaledH = bboxH * scale;
  const offsetX = (targetW - scaledW) / 2 - minX * scale;
  const offsetY = (targetH - scaledH) / 2 - minY * scale;

  const sw = Math.max(4, Math.round(targetW / 80));
  const isGold = color === '#F1C168' || color === '#C9A84C' || color === 'gold';

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
    return [`<path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`];
  });

  return paths.join('\n');
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
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

// ---------------------------------------------------------------------------
// Core render function
// ---------------------------------------------------------------------------

async function renderPrintLayout({ autograph, printRecord }) {
  const frameUrls = autograph.preview_frame_urls ?? [];
  const strokes = Array.isArray(autograph.strokes_json) ? autograph.strokes_json : [];
  const strokeColor = autograph.stroke_color ?? '#FA0909';
  const captureW = autograph.capture_width ?? 1080;
  const captureH = autograph.capture_height ?? 1610;
  const creatorName = autograph._creatorName ?? 'Unknown';
  const sequenceNumber = autograph.creator_sequence_number ?? null;
  const seriesName = autograph._seriesName ?? null;
  const printSeq = printRecord.print_sequence_number;

  // Fetch frame 12 + small frames in parallel
  const framesNeeded = [
    { idx: 11, w: FRAME12.w, h: FRAME12.h },
    ...SMALL_FRAMES.map((sf) => ({ idx: sf.frameIdx, w: sf.w, h: sf.h })),
  ];
  console.log('[render] fetching frames:', framesNeeded.map((f) => f.idx));

  const frameBuffers = await Promise.all(
    framesNeeded.map(async ({ idx, w, h }) => {
      const rawUrl = frameUrls[idx];
      if (!rawUrl) return null;
      try {
        const buf = await fetchBuffer(toTransformUrl(rawUrl, w, h));
        return await sharp(buf).resize(w, h, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
      } catch (e) {
        console.error(`[render] frame ${idx} error:`, e.message);
        return null;
      }
    })
  );

  const frame12Buf = frameBuffers[0];
  const smallFrameBufs = frameBuffers.slice(1);

  console.log('[render] frames fetched, building composites');
  const composites = [];

  // --- Frame 5 (hero card) — strokes already baked in at capture time, no overlay needed ---
  if (frame12Buf) {
    composites.push({ input: frame12Buf, left: FRAME12.x, top: FRAME12.y });
  }

  // --- Signature square: black fill + centered gold strokes ---
  const sigBg = await sharp({
    create: { width: SIG_SQ.w, height: SIG_SQ.h, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();
  composites.push({ input: sigBg, left: SIG_SQ.x, top: SIG_SQ.y });

  const goldPaths = strokesToSvgPathsCentered(strokes, '#F1C168', SIG_SQ.w, SIG_SQ.h);
  if (goldPaths) {
    const sigSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIG_SQ.w}" height="${SIG_SQ.h}">${goldPaths}</svg>`;
    composites.push({ input: Buffer.from(sigSvg), left: SIG_SQ.x, top: SIG_SQ.y });
  }

  // --- Progression frames (1-4) — strokes already baked in at capture time, no overlay needed ---
  for (let i = 0; i < SMALL_FRAMES.length; i++) {
    const sf = SMALL_FRAMES[i];
    const buf = smallFrameBufs[i];
    if (buf) {
      composites.push({ input: buf, left: sf.x, top: sf.y });
    }
  }

  // --- QR code ---
  try {
    const qrUrl = `https://ophinia.com/verify/${autograph.id}`;
    const qrSvg = await QRCode.toString(qrUrl, {
      type: 'svg',
      width: QR_AREA.w,
      margin: 1,
      color: { dark: '#FFFFFF', light: '#000000' },
    });
    composites.push({ input: Buffer.from(qrSvg), left: QR_AREA.x, top: QR_AREA.y });
  } catch (e) {
    console.error('[render] QR generation error:', e.message);
  }

  // --- Ophinia logo ---
  if (LOGO_BUF) {
    try {
      const resizedLogo = await sharp(LOGO_BUF)
        .resize(LOGO_AREA.w, LOGO_AREA.h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      composites.push({ input: resizedLogo, left: LOGO_AREA.x, top: LOGO_AREA.y });
    } catch (e) {
      console.error('[render] logo composite error:', e.message);
    }
  }

  // --- Metadata + borders full-canvas SVG ---
  // Font embedded as base64 so Optima renders correctly on the Railway container.
  const fontFaceDecl = FONT_B64
    ? `<defs><style>@font-face { font-family: 'Optima'; src: url('data:font/truetype;base64,${FONT_B64}'); }</style></defs>`
    : '';
  const fontFamily = FONT_B64 ? 'Optima, DejaVu Serif, serif' : 'DejaVu Serif, Georgia, serif';

  const date = new Date(autograph.created_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const nameLabel = sequenceNumber != null
    ? `${creatorName.toUpperCase()} #${sequenceNumber}`
    : creatorName.toUpperCase();

  const metaLines = [
    { text: nameLabel,             fontSize: 72, opacity: 1.0,  bold: true,  letterSpacing: 3 },
    { text: `Captured on ${date}`, fontSize: 52, opacity: 0.75, bold: false, letterSpacing: 1 },
    { text: `Print #${printSeq}`,  fontSize: 52, opacity: 0.75, bold: false, letterSpacing: 1 },
  ];
  if (seriesName) {
    metaLines.push({ text: seriesName, fontSize: 48, opacity: 0.65, bold: false, letterSpacing: 1 });
  }

  const lineH = 100;
  const metaTextEls = metaLines.map((line, i) => `
    <text
      x="${META_AREA.x + 20}"
      y="${META_AREA.y + 72 + i * lineH}"
      font-family="${fontFamily}"
      font-size="${line.fontSize}"
      font-weight="${line.bold ? 'bold' : 'normal'}"
      fill="white"
      opacity="${line.opacity}"
      letter-spacing="${line.letterSpacing}"
    >${escapeXml(line.text)}</text>`).join('\n');

  // Outer + inner borders drawn programmatically — no dependency on template PNG
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">
    ${fontFaceDecl}
    <rect x="10" y="10" width="${CANVAS_W - 20}" height="${CANVAS_H - 20}"
      fill="none" stroke="white" stroke-width="3" opacity="0.5"/>
    <rect x="38" y="38" width="${CANVAS_W - 76}" height="${CANVAS_H - 76}"
      fill="none" stroke="white" stroke-width="1.5" opacity="0.3"/>
    ${metaTextEls}
  </svg>`;
  composites.push({ input: Buffer.from(overlaySvg), left: 0, top: 0 });

  // --- Composite onto black canvas ---
  console.log('[render] compositing landscape PNG');

  const landscape = await sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toBuffer();

  // Rotate 90° CW → portrait 2400×3000 for Prodigi GLOBAL-PHO-8X10
  const portrait = await sharp(landscape).rotate(90).png({ compressionLevel: 6 }).toBuffer();
  console.log(`[render] portrait PNG: ${portrait.byteLength} bytes`);
  return portrait;
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

app.post('/render-print-layout', async (req, res) => {
  try {
    const secret = req.headers['x-render-secret'] ?? '';
    if (!RENDER_SECRET || secret !== RENDER_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { autograph_id, print_id } = req.body;
    if (!autograph_id || !print_id) {
      return res.status(400).json({ error: 'autograph_id and print_id are required' });
    }

    console.log(`[render] request: autograph=${autograph_id} print=${print_id}`);

    const { data: autograph, error: autographError } = await supabase
      .from('autographs')
      .select('id, owner_id, creator_id, status, strokes_json, stroke_color, capture_width, capture_height, preview_frame_urls, creator_sequence_number, series_id, created_at')
      .eq('id', autograph_id)
      .maybeSingle();

    if (autographError || !autograph) return res.status(404).json({ error: 'Autograph not found' });
    if (autograph.status !== 'active') return res.status(409).json({ error: 'Autograph is not active' });

    const { data: printRecord, error: printError } = await supabase
      .from('autograph_prints')
      .select('id, autograph_id, print_sequence_number, print_layout_url, owner_id_at_print')
      .eq('id', print_id)
      .maybeSingle();

    if (printError || !printRecord) return res.status(404).json({ error: 'Print record not found' });
    if (printRecord.autograph_id !== autograph_id) return res.status(409).json({ error: 'Print does not match autograph' });

    if (printRecord.print_layout_url) {
      console.log('[render] returning cached URL');
      return res.json({ print_layout_url: printRecord.print_layout_url });
    }

    if (!autograph.preview_frame_urls?.length) {
      return res.status(422).json({ error: 'No preview frames available for this autograph' });
    }

    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', autograph.creator_id)
      .maybeSingle();
    autograph._creatorName = creatorProfile?.display_name ?? 'Unknown';

    if (autograph.series_id) {
      const { data: series } = await supabase
        .from('series')
        .select('name')
        .eq('id', autograph.series_id)
        .maybeSingle();
      autograph._seriesName = series?.name ?? null;
    }

    const pngBuffer = await renderPrintLayout({ autograph, printRecord });

    const pngPath = `${printRecord.owner_id_at_print}/print_layouts/${autograph_id}_print_${print_id}.png`;
    const { error: uploadError } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .upload(pngPath, pngBuffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.error('[render] upload error:', uploadError.message);
      return res.status(500).json({ error: `Upload failed: ${uploadError.message}` });
    }

    const { data: { publicUrl } } = supabase.storage.from(OUTPUT_BUCKET).getPublicUrl(pngPath);
    console.log(`[render] uploaded: ${publicUrl}`);

    await supabase
      .from('autograph_prints')
      .update({ print_layout_url: publicUrl })
      .eq('id', print_id);

    return res.json({ print_layout_url: publicUrl });
  } catch (err) {
    console.error('[render] unhandled error:', err);
    return res.status(500).json({ error: err.message ?? 'Unexpected error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`print-renderer listening on port ${PORT}`));
