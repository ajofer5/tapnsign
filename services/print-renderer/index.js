'use strict';

/**
 * print-renderer — Railway service
 *
 * Renders the 8×10 print layout for Prodigi SKU GLOBAL-PHO-8X10.
 * Uses sharp (librsvg) for SVG→PNG, which honours system fonts — Optima is
 * installed in the Docker image so metadata text renders correctly.
 *
 * POST /render   { autograph_id, print_id?, internal_secret? }
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
const RENDERER_VERSION = 'print-template-v4';
const PREVIEW_VERSION = 'preview-v3';
const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY ?? '';
const BUNNY_STORAGE_ZONE_NAME = process.env.BUNNY_STORAGE_ZONE_NAME ?? '';
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME ?? '';
const BUNNY_STORAGE_ENDPOINT = process.env.BUNNY_STORAGE_ENDPOINT ?? 'storage.bunnycdn.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[print-renderer] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function normalizeBunnyStorageEndpoint(endpoint) {
  const trimmed = String(endpoint || '').trim();
  if (!trimmed) return 'storage.bunnycdn.com';
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0] || 'storage.bunnycdn.com';
  }
}

const NORMALIZED_BUNNY_STORAGE_ENDPOINT = normalizeBunnyStorageEndpoint(BUNNY_STORAGE_ENDPOINT);

function normalizeHostname(hostname) {
  const trimmed = String(hostname || '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0];
  }
}

const NORMALIZED_BUNNY_CDN_HOSTNAME = normalizeHostname(BUNNY_CDN_HOSTNAME);

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

const BADGE_AREA = { x: tx(802), y: ty(440), w: tx(84), h: ty(84) };

const META_AREA = { x: tx(499), y: ty(388), w: tx(284), h: ty(142) };
const DISCLOSURE_AREA = { x: tx(615), y: ty(765), w: tx(320), h: ty(24) };

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

function getPreviewRect(sourceRect, metadata, previewWidth, previewHeight) {
  const sourceWidth = metadata.width || CANVAS_W;
  const sourceHeight = metadata.height || CANVAS_H;

  if (Math.abs(sourceWidth - CANVAS_W) <= Math.abs(sourceWidth - CANVAS_H)) {
    return {
      x: Math.round(sourceRect.x * (previewWidth / sourceWidth)),
      y: Math.round(sourceRect.y * (previewHeight / sourceHeight)),
      w: Math.round(sourceRect.w * (previewWidth / sourceWidth)),
      h: Math.round(sourceRect.h * (previewHeight / sourceHeight)),
    };
  }

  // Fallback for a portrait intermediate: map landscape coordinates through
  // the 90-degree portrait transform used by the SVG template.
  return {
    x: Math.round(sourceRect.y * (previewWidth / sourceWidth)),
    y: Math.round((CANVAS_W - sourceRect.x - sourceRect.w) * (previewHeight / sourceHeight)),
    w: Math.round(sourceRect.h * (previewWidth / sourceWidth)),
    h: Math.round(sourceRect.w * (previewHeight / sourceHeight)),
  };
}

function buildPreviewProtectionSvg({ width, height, qrRect }) {
  const qrPad = Math.max(8, Math.round(width * 0.014));
  const x = Math.max(0, qrRect.x - qrPad);
  const y = Math.max(0, qrRect.y - qrPad);
  const w = Math.min(width - x, qrRect.w + qrPad * 2);
  const h = Math.min(height - y, qrRect.h + qrPad * 2);
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const fontSize = Math.max(22, Math.round(width * 0.055));
  const smallFontSize = Math.max(10, Math.round(width * 0.018));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g transform="translate(${width / 2} ${height / 2}) rotate(-32)">
    ${[-1, 0, 1].map((row) => `
      <text x="0" y="${row * fontSize * 3.2}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}"
        font-weight="800" fill="#ffffff" opacity="0.22" letter-spacing="8">PREVIEW</text>
    `).join('\n')}
  </g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#050505" opacity="0.94"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.48"/>
  <line x1="${x + 8}" y1="${y + 8}" x2="${x + w - 8}" y2="${y + h - 8}" stroke="#ffffff" stroke-width="4" opacity="0.55"/>
  <line x1="${x + w - 8}" y1="${y + 8}" x2="${x + 8}" y2="${y + h - 8}" stroke="#ffffff" stroke-width="4" opacity="0.55"/>
  <text x="${centerX}" y="${centerY - smallFontSize * 0.3}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${smallFontSize}"
    font-weight="800" fill="#ffffff" opacity="0.92">QR HIDDEN</text>
  <text x="${centerX}" y="${centerY + smallFontSize * 1.1}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(8, Math.round(smallFontSize * 0.78))}"
    font-weight="700" fill="#ffffff" opacity="0.72">IN PREVIEW</text>
</svg>`;
}

async function createProtectedPreviewBuffer(layoutBuffer) {
  const metadata = await sharp(layoutBuffer).metadata();
  const previewWidth = 800;
  const previewHeight = Math.round(previewWidth * ((metadata.height || CANVAS_H) / (metadata.width || CANVAS_W)));
  const qrRect = getPreviewRect(BADGE_AREA, metadata, previewWidth, previewHeight);
  const protectionSvg = buildPreviewProtectionSvg({ width: previewWidth, height: previewHeight, qrRect });

  return sharp(layoutBuffer)
    .resize({ width: previewWidth })
    .composite([{ input: Buffer.from(protectionSvg), top: 0, left: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

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

async function fetchAsBase64(url, options = {}) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[print-renderer] fetchAsBase64 failed: ${res.status} ${url}`);
      return '';
    }
    const sourceBuffer = Buffer.from(await res.arrayBuffer());
    const {
      width,
      height,
      fit = 'cover',
      format = 'jpeg',
      quality = 88,
      background = { r: 0, g: 0, b: 0, alpha: 0 },
    } = options;

    if (width || height) {
      const pipeline = sharp(sourceBuffer)
        .rotate()
        .resize({
          width,
          height,
          fit,
          background,
        });

      if (format === 'png') {
        const buffer = await pipeline.png().toBuffer();
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }

      const buffer = await pipeline.jpeg({ quality }).toBuffer();
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    return `data:${ct};base64,${sourceBuffer.toString('base64')}`;
  } catch (err) {
    console.error(`[print-renderer] fetchAsBase64 error: ${err.message} ${url}`);
    return '';
  }
}

async function bunnyUrlExists(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch (err) {
    console.warn(`[print-renderer] Bunny cache HEAD failed: ${err.message}`);
    return false;
  }
}

async function waitForBunnyUrl(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (await bunnyUrlExists(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  return false;
}

async function uploadToBunnyStorage(buffer, path, contentType = 'image/png') {
  if (!BUNNY_STORAGE_API_KEY || !BUNNY_STORAGE_ZONE_NAME || !NORMALIZED_BUNNY_CDN_HOSTNAME) {
    throw new Error('Bunny Storage is not configured.');
  }

  const uploadUrl = `https://${NORMALIZED_BUNNY_STORAGE_ENDPOINT}/${BUNNY_STORAGE_ZONE_NAME}/${path}`;
  let resp;
  try {
    resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
        'Content-Type': contentType,
      },
      body: buffer,
    });
  } catch (err) {
    throw new Error(`Bunny Storage upload request failed: ${err.message}. Endpoint: ${NORMALIZED_BUNNY_STORAGE_ENDPOINT}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Bunny Storage upload failed (HTTP ${resp.status}): ${body}`);
  }

  const cdnUrl = `https://${NORMALIZED_BUNNY_CDN_HOSTNAME}/${path}`;
  if (!(await waitForBunnyUrl(cdnUrl))) {
    throw new Error(`Bunny CDN URL was not readable after upload: ${cdnUrl}`);
  }

  return cdnUrl;
}

function sanitizeStorageUrl(originalUrl) {
  try {
    const url = new URL(originalUrl);
    if (url.pathname.includes('/storage/v1/render/image/public/')) {
      url.pathname = url.pathname.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/');
      url.searchParams.delete('width');
      url.searchParams.delete('height');
      url.searchParams.delete('resize');
      url.searchParams.delete('quality');
    }
    return url.toString();
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
  creatorName, sequenceNumber, seriesName, capturedAt, badgeDataUri,
}) {
  const date = new Date(capturedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const nameLabel = creatorName.toUpperCase();

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

  // Verify badge (QR code). Keep this isolated so previews can reliably hide it.
  elements.push(`
    <image href="${badgeDataUri}"
      x="${BADGE_AREA.x}" y="${BADGE_AREA.y}" width="${BADGE_AREA.w}" height="${BADGE_AREA.h}"
      preserveAspectRatio="xMidYMid meet"/>
  `);

  // Metadata text — Optima installed as system font via Dockerfile
  const metaLines = [
    { text: nameLabel,                         fontSize: 66, opacity: 1.00, bold: true,  letterSpacing: 3 },
    { text: `Captured on ${date}`,             fontSize: 52, opacity: 0.75, bold: false, letterSpacing: 1 },
    ...(sequenceNumber != null ? [{ text: `Moment #${sequenceNumber}`, fontSize: 46, opacity: 0.82, bold: false, letterSpacing: 1 }] : []),
    ...(seriesName ? [{ text: seriesName,      fontSize: 40, opacity: 0.64, bold: false, letterSpacing: 1 }] : []),
  ];
  const lineH = 76;
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

  // Bottom authenticity disclosure
  const disclosureText = 'Digital authenticity powered by Ophinia.';
  const disclosureFontSize = 32;
  const disclosureY = DISCLOSURE_AREA.y + 18;
  elements.push(`
    <text
      x="${DISCLOSURE_AREA.x}"
      y="${disclosureY}"
      font-family="Optima, Optima Nova LT, serif"
      font-size="${disclosureFontSize}"
      fill="white"
      opacity="0.58"
      letter-spacing="0.8"
    >${escapeXml(disclosureText)}</text>
  `);

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

app.get('/health', (_req, res) => res.json({
  ok: true,
  version: RENDERER_VERSION,
  preview_version: PREVIEW_VERSION,
}));

app.post('/render', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const autographId = req.body?.autograph_id;
  const printId     = req.body?.print_id;
  if (!autographId) {
    return res.status(400).json({ error: 'autograph_id is required' });
  }

  try {
    // Fetch autograph
    const { data: autograph, error: autographError } = await supabase
      .from('autographs')
      .select('id, owner_id, creator_id, status, strokes_json, stroke_color, preview_frame_urls, creator_sequence_number, series_id, created_at, verify_badge_url')
      .eq('id', autographId)
      .maybeSingle();

    if (autographError || !autograph) {
      return res.status(404).json({
        error: `Renderer autograph not found for id ${autographId}`,
        detail: autographError?.message ?? null,
      });
    }
    if (autograph.status !== 'active') return res.status(409).json({ error: 'Autograph is not active' });
    if (!autograph.verify_badge_url) return res.status(422).json({ error: 'Verify badge not found — re-mint this autograph' });

    let printRecord = null;
    if (printId) {
      const { data, error: printError } = await supabase
        .from('autograph_prints')
        .select('id, autograph_id, owner_id_at_print, print_sequence_number, print_layout_url')
        .eq('id', printId)
        .maybeSingle();

      if (printError || !data) return res.status(404).json({ error: 'Print record not found' });
      if (data.autograph_id !== autographId) return res.status(409).json({ error: 'Print does not match autograph' });
      printRecord = data;

      if (printRecord.print_layout_url && await bunnyUrlExists(printRecord.print_layout_url)) {
        const prPreviewPath = `print_previews/${PREVIEW_VERSION}/${autographId}.jpg`;
        const prPreviewUrl = NORMALIZED_BUNNY_CDN_HOSTNAME
          ? `https://${NORMALIZED_BUNNY_CDN_HOSTNAME}/${prPreviewPath}`
          : null;
        const prPreviewExists = prPreviewUrl ? await bunnyUrlExists(prPreviewUrl) : false;

        if (prPreviewExists) {
          console.log('[print-renderer] returning print-record cached URL (both)');
          return res.json({
            print_layout_url: printRecord.print_layout_url,
            print_preview_url: prPreviewUrl,
            cached: true,
            version: RENDERER_VERSION,
          });
        }

        // Preview missing — generate from the cached layout
        console.log('[print-renderer] print-record: layout cached; generating missing preview');
        const prLayoutResp = await fetch(printRecord.print_layout_url);
        if (prLayoutResp.ok) {
          const prLayoutBuffer = Buffer.from(await prLayoutResp.arrayBuffer());
          const prPreviewBuffer = await createProtectedPreviewBuffer(prLayoutBuffer);
          const generatedPreviewUrl = await uploadToBunnyStorage(prPreviewBuffer, prPreviewPath, 'image/jpeg');
          return res.json({
            print_layout_url: printRecord.print_layout_url,
            print_preview_url: generatedPreviewUrl,
            cached: false,
            version: RENDERER_VERSION,
          });
        }
        // Layout fetch failed — fall through to full render
        console.warn('[print-renderer] print-record: failed to fetch cached layout, falling through to full render');
      }
    }

    const layoutBunnyPath = `print_layouts/${RENDERER_VERSION}/${autographId}.png`;
    const previewBunnyPath = `print_previews/${PREVIEW_VERSION}/${autographId}.jpg`;
    const cachedLayoutUrl = NORMALIZED_BUNNY_CDN_HOSTNAME ? `https://${NORMALIZED_BUNNY_CDN_HOSTNAME}/${layoutBunnyPath}` : '';
    const cachedPreviewUrl = NORMALIZED_BUNNY_CDN_HOSTNAME ? `https://${NORMALIZED_BUNNY_CDN_HOSTNAME}/${previewBunnyPath}` : '';

    const [layoutCached, previewCached] = await Promise.all([
      bunnyUrlExists(cachedLayoutUrl),
      bunnyUrlExists(cachedPreviewUrl),
    ]);

    if (layoutCached && previewCached) {
      console.log('[print-renderer] returning both cached URLs');
      if (printRecord) {
        await supabase
          .from('autograph_prints')
          .update({ print_layout_url: cachedLayoutUrl })
          .eq('id', printRecord.id);
      }
      return res.json({
        print_layout_url: cachedLayoutUrl,
        print_preview_url: cachedPreviewUrl,
        cached: true,
        version: RENDERER_VERSION,
      });
    }

    // Layout cached but preview missing — download layout and generate preview only
    if (layoutCached && !previewCached) {
      console.log('[print-renderer] layout cached; generating missing preview');
      const layoutResp = await fetch(cachedLayoutUrl);
      if (!layoutResp.ok) throw new Error(`Failed to fetch cached layout: ${layoutResp.status}`);
      const layoutBuffer = Buffer.from(await layoutResp.arrayBuffer());
      const previewBuffer = await createProtectedPreviewBuffer(layoutBuffer);
      const printPreviewUrl = await uploadToBunnyStorage(previewBuffer, previewBunnyPath, 'image/jpeg');
      if (printRecord) {
        await supabase
          .from('autograph_prints')
          .update({ print_layout_url: cachedLayoutUrl })
          .eq('id', printRecord.id);
      }
      return res.json({
        print_layout_url: cachedLayoutUrl,
        print_preview_url: printPreviewUrl,
        cached: false,
        version: RENDERER_VERSION,
      });
    }

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

    const frameUrls = (autograph.preview_frame_urls ?? []).filter(Boolean);
    if (frameUrls.length < 1) {
      return res.status(422).json({ error: 'At least 1 preview frame is required' });
    }
    while (frameUrls.length < 5) {
      frameUrls.push(frameUrls[frameUrls.length - 1]);
    }

    // Fetch original object URLs and downsize before embedding them in SVG.
    // Embedding unbounded base64 data can exceed librsvg/libxml parser limits.
    const sanitizedFrameUrls = frameUrls.slice(0, 5).map(sanitizeStorageUrl);
    console.log('[print-renderer] version:', RENDERER_VERSION);
    console.log('[print-renderer] fetching frames and badge from:', sanitizedFrameUrls);
    const [frame12DataUri, sf0, sf1, sf2, sf3, badgeDataUri] = await Promise.all([
      fetchAsBase64(sanitizedFrameUrls[4], {
        width: FRAME12.w,
        height: FRAME12.h,
        fit: 'cover',
        format: 'jpeg',
        quality: 90,
      }),
      fetchAsBase64(sanitizedFrameUrls[0], {
        width: SMALL_FRAMES[0].w,
        height: SMALL_FRAMES[0].h,
        fit: 'cover',
        format: 'jpeg',
        quality: 88,
      }),
      fetchAsBase64(sanitizedFrameUrls[1], {
        width: SMALL_FRAMES[1].w,
        height: SMALL_FRAMES[1].h,
        fit: 'cover',
        format: 'jpeg',
        quality: 88,
      }),
      fetchAsBase64(sanitizedFrameUrls[2], {
        width: SMALL_FRAMES[2].w,
        height: SMALL_FRAMES[2].h,
        fit: 'cover',
        format: 'jpeg',
        quality: 88,
      }),
      fetchAsBase64(sanitizedFrameUrls[3], {
        width: SMALL_FRAMES[3].w,
        height: SMALL_FRAMES[3].h,
        fit: 'cover',
        format: 'jpeg',
        quality: 88,
      }),
      fetchAsBase64(sanitizeStorageUrl(autograph.verify_badge_url), {
        width: BADGE_AREA.w,
        height: BADGE_AREA.h,
        fit: 'contain',
        format: 'png',
      }),
    ]);
    console.log('[print-renderer] assets fetched, building SVG');

    const strokes = Array.isArray(autograph.strokes_json) ? autograph.strokes_json : [];

    const svgContent = buildLayoutSvg({
      frame12DataUri,
      smallFrameDataUris: [sf0, sf1, sf2, sf3],
      strokes,
      creatorName,
      sequenceNumber: autograph.creator_sequence_number ?? null,
      seriesName,
      capturedAt: autograph.created_at,
      badgeDataUri,
    });

    // Render SVG, then rotate into the portrait orientation expected by preview/print.
    console.log('[print-renderer] rendering SVG, length:', svgContent.length);
    const pngBuffer = await sharp(Buffer.from(svgContent)).rotate(-90).png().toBuffer();
    console.log('[print-renderer] PNG bytes:', pngBuffer.length);

    // Generate small preview JPG alongside the full layout
    const previewBuffer = await createProtectedPreviewBuffer(pngBuffer);
    console.log('[print-renderer] preview JPG bytes:', previewBuffer.length);

    // Upload both in parallel
    const [printLayoutUrl, printPreviewUrl] = await Promise.all([
      uploadToBunnyStorage(pngBuffer, layoutBunnyPath, 'image/png'),
      uploadToBunnyStorage(previewBuffer, previewBunnyPath, 'image/jpeg'),
    ]);

    if (printRecord) {
      await supabase
        .from('autograph_prints')
        .update({ print_layout_url: printLayoutUrl })
        .eq('id', printRecord.id);
    }

    console.log('[print-renderer] done:', printLayoutUrl, printPreviewUrl);
    return res.json({
      print_layout_url: printLayoutUrl,
      print_preview_url: printPreviewUrl,
      cached: false,
      version: RENDERER_VERSION,
    });

  } catch (err) {
    console.error('[print-renderer] unhandled error:', err);
    return res.status(500).json({ error: err.message ?? 'Internal error' });
  }
});

app.listen(PORT, () => console.log(`[print-renderer] listening on :${PORT} (${RENDERER_VERSION})`));
