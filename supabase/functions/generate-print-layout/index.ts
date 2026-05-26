/**
 * generate-print-layout
 *
 * Generates a 1500×2250px (5×7.5 @ 300 DPI) print layout for Prodigi SKU GLOBAL-PHO-5X7.
 *
 * Layout:
 *   Canvas:      1500×2250px, black background
 *   Card area:   1200×1800px (4×6 @ 300 DPI), centered horizontally
 *                150px from top, 150px left/right (0.5" borders)
 *   Bottom strip: 300px (1") — logo left, metadata center, QR right (white on black)
 *   Card:        frame 12 photo (cover-fit) + full signature strokes overlay
 */

import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.4.1';
import {
  assert,
  handleRequest,
  HttpError,
  json,
  parseJson,
  requireString,
  requireUser,
  supabaseAdmin,
} from '../_shared/utils.ts';
import { OPHINIA_LOGO_WHITE_DATA_URI } from '../_shared/ophinia-logo-white.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_BUCKET = 'autograph-videos';

// Canvas: 5×7.5 inches @ 300 DPI
const CANVAS_W = 1500;
const CANVAS_H = 2250;

// Card area: 4×6 inches @ 300 DPI, 0.5" (150px) borders top/left/right
const BORDER = 150;
const CARD_W = 1200; // 4"
const CARD_H = 1800; // 6"
const CARD_X = BORDER;
const CARD_Y = BORDER;

// Bottom strip: remaining 300px (1")
const STRIP_Y = CARD_Y + CARD_H; // 1950
const STRIP_H = CANVAS_H - STRIP_Y; // 300

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSmoothPath(points: { x: number; y: number }[]): string {
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

function strokesToSvgPaths(
  strokes: { id: string; points: { x: number; y: number; t?: number }[] }[],
  strokeColor: string,
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
): string {
  const scaleX = targetW / (sourceW || 1);
  const scaleY = targetH / (sourceH || 1);
  const strokeWidth = Math.max(3, 6 * Math.min(scaleX, scaleY));
  const isGold = strokeColor === '#F1C168' || strokeColor === '#C9A84C';

  const paths = strokes.flatMap((stroke) => {
    if (!stroke.points.length) return [];
    const scaled = stroke.points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
    const d = buildSmoothPath(scaled);
    if (!d) return [];
    if (isGold) {
      return [
        `<path d="${d}" stroke="#D9AF4C" stroke-width="${strokeWidth * 1.2}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`,
        `<path d="${d}" stroke="#FFF0A0" stroke-width="${strokeWidth * 0.48}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"/>`,
      ];
    }
    return [`<path d="${d}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`];
  });

  return paths.join('\n');
}

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`fetchAsBase64 failed: ${res.status} ${url}`);
    return '';
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  const base64 = btoa(chunks.join(''));
  const ct = res.headers.get('content-type') ?? 'image/jpeg';
  return `data:${ct};base64,${base64}`;
}

// Rewrite storage public URL to use image transform at a given size
function toTransformUrl(originalUrl: string, width: number, height: number): string {
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

function getStoragePublicUrl(path: string): string {
  return supabaseAdmin.storage.from(OUTPUT_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------
// WASM init
// ---------------------------------------------------------------------------

let _wasmReady = false;
async function ensureWasm() {
  if (!_wasmReady) {
    await initWasm(fetch('https://esm.sh/@resvg/resvg-wasm@2.4.1/index_bg.wasm'));
    _wasmReady = true;
  }
}

// ---------------------------------------------------------------------------
// SVG builder
// ---------------------------------------------------------------------------

function buildLayoutSvg(params: {
  frameDataUri: string;
  strokes: { id: string; points: { x: number; y: number; t?: number }[] }[];
  strokeColor: string;
  captureWidth: number;
  captureHeight: number;
  creatorName: string;
  sequenceNumber: number | null;
  printSequenceNumber: number;
  seriesName: string | null;
  capturedAt: string;
  qrCodeDataUri: string | null;
}): string {
  const {
    frameDataUri,
    strokes,
    strokeColor,
    captureWidth,
    captureHeight,
    creatorName,
    sequenceNumber,
    printSequenceNumber,
    seriesName,
    capturedAt,
    qrCodeDataUri,
  } = params;

  const date = new Date(capturedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const elements: string[] = [];

  // Black background
  elements.push(`<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#000000"/>`);

  // Card photo (frame 12, cover-fit into card area)
  if (frameDataUri) {
    elements.push(`
      <defs>
        <clipPath id="card_clip">
          <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}"/>
        </clipPath>
      </defs>
      <image
        href="${frameDataUri}"
        x="${CARD_X}" y="${CARD_Y}"
        width="${CARD_W}" height="${CARD_H}"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#card_clip)"
      />
    `);
  } else {
    elements.push(`<rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" fill="#1a1a1a"/>`);
  }

  // Signature strokes over card
  const strokePaths = strokesToSvgPaths(strokes, strokeColor, captureWidth, captureHeight, CARD_W, CARD_H);
  if (strokePaths) {
    elements.push(`
      <g clip-path="url(#card_clip)" transform="translate(${CARD_X}, ${CARD_Y})">
        ${strokePaths}
      </g>
    `);
  }

  // Thin separator line between card and strip
  elements.push(`
    <line x1="${BORDER}" y1="${STRIP_Y}" x2="${CANVAS_W - BORDER}" y2="${STRIP_Y}"
      stroke="white" stroke-width="1" opacity="0.25"/>
  `);

  // Bottom strip content
  const stripCenterY = STRIP_Y + STRIP_H / 2;

  // Logo — left side
  const logoH = 36;
  const logoW = 120;
  elements.push(`
    <image
      href="${OPHINIA_LOGO_WHITE_DATA_URI}"
      x="${BORDER}"
      y="${stripCenterY - logoH / 2}"
      width="${logoW}"
      height="${logoH}"
      preserveAspectRatio="xMidYMid meet"
      opacity="0.9"
    />
  `);

  // Center text: Name · Date · Print info
  const nameLabel = sequenceNumber != null
    ? `${creatorName.toUpperCase()} #${sequenceNumber}`
    : creatorName.toUpperCase();
  const printLine = seriesName
    ? `Print ${printSequenceNumber} · ${seriesName}`
    : `Print ${printSequenceNumber}`;
  const lines = [nameLabel, date, printLine];
  const lineHeight = 26;
  const totalH = lines.length * lineHeight;
  const textStartY = stripCenterY - totalH / 2 + lineHeight * 0.8;

  lines.forEach((line, i) => {
    const fontSize = i === 0 ? 20 : 14;
    const opacity = i === 0 ? 1 : 0.7;
    elements.push(`
      <text
        x="${CANVAS_W / 2}"
        y="${textStartY + i * lineHeight}"
        text-anchor="middle"
        font-family="Georgia, serif"
        font-size="${fontSize}"
        fill="white"
        opacity="${opacity}"
        letter-spacing="${i === 0 ? 2 : 0.5}"
      >${escapeXml(line)}</text>
    `);
  });

  // QR code — right side
  if (qrCodeDataUri) {
    const qrSize = STRIP_H - 40;
    elements.push(`
      <image
        href="${qrCodeDataUri}"
        x="${CANVAS_W - BORDER - qrSize}"
        y="${STRIP_Y + 20}"
        width="${qrSize}"
        height="${qrSize}"
        preserveAspectRatio="xMidYMid meet"
      />
    `);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  ${elements.join('\n  ')}
</svg>`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve((req) =>
  handleRequest(async (request) => {
    // Accept service role key or internal secret as valid caller
    const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
    const isInternal = (serviceRoleKey && bearer === serviceRoleKey) ||
      (internalSecret && (bearer === internalSecret || request.headers.get('x-internal-secret') === internalSecret));

    console.log('[generate-print-layout] isInternal:', isInternal);

    const body = await parseJson(request);
    const autographId = requireString(body.autograph_id, 'autograph_id');
    const printId = requireString(body.print_id, 'print_id');

    let userId: string;
    if (isInternal) {
      const { data: autographOwner } = await supabaseAdmin
        .from('autographs')
        .select('owner_id')
        .eq('id', autographId)
        .maybeSingle();
      assert(!!autographOwner, 404, 'Autograph not found.');
      userId = autographOwner.owner_id;
    } else {
      const user = await requireUser(request);
      userId = user.id;
    }

    // Fetch autograph
    const { data: autograph, error: autographError } = await supabaseAdmin
      .from('autographs')
      .select('id, owner_id, creator_id, status, strokes_json, stroke_color, capture_width, capture_height, preview_frame_urls, creator_sequence_number, series_id, created_at')
      .eq('id', autographId)
      .maybeSingle();

    assert(!autographError && !!autograph, 404, 'Autograph not found.');
    assert(autograph.status === 'active', 409, 'Autograph is not active.');
    assert(autograph.owner_id === userId, 403, 'You do not own this autograph.');

    // Fetch print record
    const { data: printRecord, error: printError } = await supabaseAdmin
      .from('autograph_prints')
      .select('id, autograph_id, print_sequence_number, print_layout_url')
      .eq('id', printId)
      .maybeSingle();

    assert(!printError && !!printRecord, 404, 'Print record not found.');
    assert(printRecord.autograph_id === autographId, 409, 'Print does not match autograph.');

    // Return cached layout if already generated
    if (printRecord.print_layout_url) {
      console.log('[generate-print-layout] returning cached URL');
      return json({ print_layout_url: printRecord.print_layout_url });
    }

    // Fetch creator profile
    const { data: creatorProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', autograph.creator_id)
      .maybeSingle();
    const creatorName = creatorProfile?.display_name ?? 'Unknown';

    // Fetch series name
    let seriesName: string | null = null;
    if (autograph.series_id) {
      const { data: series } = await supabaseAdmin
        .from('series')
        .select('name')
        .eq('id', autograph.series_id)
        .maybeSingle();
      seriesName = series?.name ?? null;
    }

    // Fetch frame 12 (index 11) — the final signed frame
    const frameUrls: string[] = autograph.preview_frame_urls ?? [];
    assert(frameUrls.length > 0, 422, 'No preview frames available for this autograph.');

    const frame12Url = frameUrls[11] ?? frameUrls[frameUrls.length - 1];
    const transformedUrl = toTransformUrl(frame12Url, CARD_W, CARD_H);
    console.log('[generate-print-layout] fetching frame 12');
    const frameDataUri = await fetchAsBase64(transformedUrl);
    console.log('[generate-print-layout] frame fetched, building SVG');

    const strokes = Array.isArray(autograph.strokes_json) ? autograph.strokes_json : [];

    const svgContent = buildLayoutSvg({
      frameDataUri,
      strokes,
      strokeColor: autograph.stroke_color ?? '#FA0909',
      captureWidth: autograph.capture_width ?? 1080,
      captureHeight: autograph.capture_height ?? 1610,
      creatorName,
      sequenceNumber: autograph.creator_sequence_number ?? null,
      printSequenceNumber: printRecord.print_sequence_number,
      seriesName,
      capturedAt: autograph.created_at,
      qrCodeDataUri: null,
    });

    // Render SVG → PNG
    console.log('[generate-print-layout] rendering SVG to PNG, SVG size:', svgContent.length);
    await ensureWasm();
    const resvg = new Resvg(svgContent, { fitTo: { mode: 'width', value: CANVAS_W } });
    const rendered = resvg.render();
    const pngBuffer = rendered.asPng();
    console.log('[generate-print-layout] PNG size:', pngBuffer.byteLength, 'bytes');

    // Upload PNG
    const pngPath = `${userId}/print_layouts/${autographId}_print_${printId}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .upload(pngPath, pngBuffer, { contentType: 'image/png', upsert: true });

    console.log('[generate-print-layout] upload:', uploadError?.message ?? 'success');
    assert(!uploadError, 500, uploadError?.message ?? 'Failed to upload print layout.');

    const printLayoutUrl = getStoragePublicUrl(pngPath);

    // Cache on print record
    await supabaseAdmin
      .from('autograph_prints')
      .update({ print_layout_url: printLayoutUrl })
      .eq('id', printId);

    return json({ print_layout_url: printLayoutUrl });
  }, req)
);
