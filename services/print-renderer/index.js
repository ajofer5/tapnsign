'use strict';

const express = require('express');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const RENDER_SECRET = process.env.RENDER_SECRET ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const OUTPUT_BUCKET = 'autograph-videos';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Layout constants (2400×3600 @ 300 DPI = 8×12 inches)
// ---------------------------------------------------------------------------

const OUTPUT_WIDTH = 2400;
const OUTPUT_HEIGHT = 3600;
const S = 3; // SVG viewBox was 800×1200

const SMALL_W = 159 * S;  // 477
const SMALL_H = 265 * S;  // 795

// Small card slots [0–10]
const SMALL_CARD_SLOTS = [
  // Top row (frames 1–5)
  { x: 0,        y: 0,        w: SMALL_W, h: SMALL_H },
  { x: 160 * S,  y: 0,        w: SMALL_W, h: SMALL_H },
  { x: 320 * S,  y: 0,        w: SMALL_W, h: SMALL_H },
  { x: 480 * S,  y: 0,        w: SMALL_W, h: SMALL_H },
  { x: 640 * S,  y: 0,        w: SMALL_W, h: SMALL_H },
  // Left column (frames 6, 8, 10)
  { x: 0,        y: 266 * S,  w: SMALL_W, h: SMALL_H },
  { x: 0,        y: 533 * S,  w: SMALL_W, h: SMALL_H },
  { x: 0,        y: 799 * S,  w: SMALL_W, h: SMALL_H },
  // Right column (frames 7, 9, 11)
  { x: 640 * S,  y: 266 * S,  w: SMALL_W, h: SMALL_H },
  { x: 640 * S,  y: 533 * S,  w: SMALL_W, h: SMALL_H },
  { x: 640 * S,  y: 799 * S,  w: SMALL_W, h: SMALL_H },
];

// frame display order → preview_frame_urls index
const SMALL_FRAME_INDICES = [0, 1, 2, 3, 4, 5, 7, 9, 6, 8, 10];

const CENTER_SLOT  = { x: 160 * S, y: 266 * S, w: 478 * S, h: 798 * S };
const CENTER_BORDER = 70;
const CENTER_PHOTO = {
  x: CENTER_SLOT.x + CENTER_BORDER,
  y: CENTER_SLOT.y + CENTER_BORDER,
  w: CENTER_SLOT.w - CENTER_BORDER * 2,
  h: CENTER_SLOT.h - CENTER_BORDER * 2,
};

const SLIP_Y = 1065 * S;
const SLIP_H = 134 * S;

// Frame timestamps in seconds
const FRAME_TIMES_S = [1.0, 1.55, 2.1, 2.65, 3.2, 3.75, 4.3, 4.85, 5.4, 5.95, 6.5, 7.05];

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

function strokesToSvgPaths(strokes, upToTimeSeconds, color, sourceW, sourceH, targetW, targetH) {
  const scaleX = targetW / (sourceW || 1);
  const scaleY = targetH / (sourceH || 1);
  const strokeWidth = Math.max(2, 5 * Math.min(scaleX, scaleY));
  const isGold = color === '#F1C168' || color === '#C9A84C';

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

function octPath(x, y, w, h, c) {
  return [
    `M ${x + c},${y}`, `L ${x + w - c},${y}`, `L ${x + w},${y + c}`,
    `L ${x + w},${y + h - c}`, `L ${x + w - c},${y + h}`,
    `L ${x + c},${y + h}`, `L ${x},${y + h - c}`, `L ${x},${y + c}`, 'Z',
  ].join(' ');
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

  // Fetch all 12 frames at slot size in parallel
  console.log(`[render] fetching ${frameUrls.length} frames`);
  const frameBuffers = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const rawUrl = frameUrls[i];
      if (!rawUrl) return null;
      const [tw, th] = i === 11 ? [CENTER_PHOTO.w, CENTER_PHOTO.h] : [SMALL_W, SMALL_H];
      try {
        const buf = await fetchBuffer(toTransformUrl(rawUrl, tw, th));
        return await sharp(buf).resize(tw, th, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
      } catch (e) {
        console.error(`[render] frame ${i} error:`, e.message);
        return null;
      }
    })
  );
  console.log('[render] frames fetched, compositing');

  // Start with black canvas
  const composites = [];

  // Small cards
  for (let slotIdx = 0; slotIdx < 11; slotIdx++) {
    const slot = SMALL_CARD_SLOTS[slotIdx];
    const frameIdx = SMALL_FRAME_INDICES[slotIdx];
    const buf = frameBuffers[frameIdx];
    const timeSeconds = FRAME_TIMES_S[frameIdx] ?? Infinity;

    if (buf) {
      composites.push({ input: buf, left: slot.x, top: slot.y });
    }

    // Stroke overlay SVG for this slot
    const strokePaths = strokesToSvgPaths(strokes, timeSeconds, strokeColor, captureW, captureH, slot.w, slot.h);
    if (strokePaths) {
      const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${slot.w}" height="${slot.h}">${strokePaths}</svg>`;
      composites.push({ input: Buffer.from(svgOverlay), left: slot.x, top: slot.y });
    }
  }

  // Center card background (black border area)
  composites.push({
    input: await sharp({ create: { width: CENTER_SLOT.w, height: CENTER_SLOT.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(),
    left: CENTER_SLOT.x, top: CENTER_SLOT.y,
  });

  // Center photo
  const centerBuf = frameBuffers[11];
  if (centerBuf) {
    composites.push({ input: centerBuf, left: CENTER_PHOTO.x, top: CENTER_PHOTO.y });
  }

  // Center strokes
  const centerStrokes = strokesToSvgPaths(strokes, Infinity, strokeColor, captureW, captureH, CENTER_PHOTO.w, CENTER_PHOTO.h);
  if (centerStrokes) {
    const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${CENTER_PHOTO.w}" height="${CENTER_PHOTO.h}">${centerStrokes}</svg>`;
    composites.push({ input: Buffer.from(svgOverlay), left: CENTER_PHOTO.x, top: CENTER_PHOTO.y });
  }

  // Octagonal frame on center card
  const oct1 = octPath(CENTER_SLOT.x + 8, CENTER_SLOT.y + 8, CENTER_SLOT.w - 16, CENTER_SLOT.h - 16, 18);
  const oct2 = octPath(CENTER_SLOT.x + 12, CENTER_SLOT.y + 12, CENTER_SLOT.w - 24, CENTER_SLOT.h - 24, 14);
  const octSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
    <path d="${oct1}" fill="none" stroke="white" stroke-width="2.5" opacity="0.7"/>
    <path d="${oct2}" fill="none" stroke="white" stroke-width="1.0" opacity="0.4"/>
  </svg>`;
  composites.push({ input: Buffer.from(octSvg), left: 0, top: 0 });

  // Creator name on center card
  const creatorName = autograph._creatorName ?? 'Unknown';
  const sequenceNumber = autograph.creator_sequence_number ?? null;
  const nameY = CENTER_SLOT.y + 46;
  const nameLabel = sequenceNumber != null ? `${creatorName.toUpperCase()} #${sequenceNumber}` : creatorName.toUpperCase();
  const nameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
    <text x="${CENTER_SLOT.x + CENTER_SLOT.w / 2}" y="${nameY}"
      text-anchor="middle" font-family="Georgia, serif" font-size="28" font-weight="bold"
      fill="white" letter-spacing="2">${escapeXml(nameLabel)}</text>
  </svg>`;
  composites.push({ input: Buffer.from(nameSvg), left: 0, top: 0 });

  // Print slip background
  composites.push({
    input: await sharp({ create: { width: OUTPUT_WIDTH, height: SLIP_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(),
    left: 0, top: SLIP_Y,
  });

  // Print slip text
  const date = new Date(autograph.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const seriesName = autograph._seriesName ?? null;
  const printSeq = printRecord.print_sequence_number;
  const printLine = seriesName ? `Print ${printSeq} · ${seriesName} · Series 3` : `Print ${printSeq}`;
  const slipCenterY = SLIP_Y + SLIP_H / 2;
  const lineHeight = 22;
  const lines = [nameLabel, date, printLine];
  const textStartY = slipCenterY - (lines.length * lineHeight) / 2 + lineHeight * 0.8;

  const linesSvg = lines.map((line, i) => {
    const fontSize = i === 0 ? 18 : 13;
    const opacity = i === 0 ? 1 : 0.7;
    return `<text x="${OUTPUT_WIDTH / 2}" y="${textStartY + i * lineHeight}"
      text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}"
      fill="white" opacity="${opacity}" letter-spacing="${i === 0 ? 2 : 0.5}"
    >${escapeXml(line)}</text>`;
  }).join('\n');

  const slipSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
    <line x1="40" y1="${SLIP_Y + 1}" x2="${OUTPUT_WIDTH - 40}" y2="${SLIP_Y + 1}" stroke="white" stroke-width="0.8" opacity="0.2"/>
    ${linesSvg}
  </svg>`;
  composites.push({ input: Buffer.from(slipSvg), left: 0, top: 0 });

  console.log('[render] compositing to PNG');
  const pngBuffer = await sharp({
    create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toBuffer();

  console.log(`[render] PNG size: ${pngBuffer.byteLength} bytes`);
  return pngBuffer;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

app.post('/render-print-layout', async (req, res) => {
  try {
    // Auth
    const secret = req.headers['x-render-secret'] ?? '';
    if (!RENDER_SECRET || secret !== RENDER_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { autograph_id, print_id } = req.body;
    if (!autograph_id || !print_id) {
      return res.status(400).json({ error: 'autograph_id and print_id are required' });
    }

    console.log(`[render] request: autograph=${autograph_id} print=${print_id}`);

    // Fetch autograph
    const { data: autograph, error: autographError } = await supabase
      .from('autographs')
      .select('id, owner_id, creator_id, status, strokes_json, stroke_color, capture_width, capture_height, preview_frame_urls, creator_sequence_number, series_id, created_at')
      .eq('id', autograph_id)
      .maybeSingle();

    if (autographError || !autograph) return res.status(404).json({ error: 'Autograph not found' });
    if (autograph.status !== 'active') return res.status(409).json({ error: 'Autograph is not active' });

    // Fetch print record
    const { data: printRecord, error: printError } = await supabase
      .from('autograph_prints')
      .select('id, autograph_id, print_sequence_number, print_layout_url, owner_id_at_print')
      .eq('id', print_id)
      .maybeSingle();

    if (printError || !printRecord) return res.status(404).json({ error: 'Print record not found' });
    if (printRecord.autograph_id !== autograph_id) return res.status(409).json({ error: 'Print does not match autograph' });

    // Return cached layout if already generated
    if (printRecord.print_layout_url) {
      console.log(`[render] returning cached URL`);
      return res.json({ print_layout_url: printRecord.print_layout_url });
    }

    if (!autograph.preview_frame_urls?.length) {
      return res.status(422).json({ error: 'No preview frames available for this autograph' });
    }

    // Fetch creator name
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', autograph.creator_id)
      .maybeSingle();
    autograph._creatorName = creatorProfile?.display_name ?? 'Unknown';

    // Fetch series name
    if (autograph.series_id) {
      const { data: series } = await supabase
        .from('series')
        .select('name')
        .eq('id', autograph.series_id)
        .maybeSingle();
      autograph._seriesName = series?.name ?? null;
    }

    // Render
    const pngBuffer = await renderPrintLayout({ autograph, printRecord });

    // Upload to Supabase storage
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

    // Cache on print record
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
