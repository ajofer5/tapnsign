import QRCode from 'qrcode';

type ProvenanceEvent = {
  event_order: number;
  event_type: string;
  event_date: string;
  price_cents: number | null;
  from_label: string | null;
  to_label: string | null;
};

type CertificateData = {
  creatorName: string;
  creatorVerified: boolean;
  ownerName: string;
  createdAt: string;
  certificateId: string;
  contentHash: string;
  thumbnailUrl: string | null;
  verifyUrl: string;
  provenance: ProvenanceEvent[];
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatEventType(type: string) {
  switch (type) {
    case 'signed': return 'Signed';
    case 'primary_sale':
    case 'secondary_sale': return 'Sold';
    case 'trade': return 'Traded';
    case 'gift': return 'Gifted';
    default: return 'Transferred';
  }
}

function buildProvenanceTable(events: ProvenanceEvent[]): string {
  if (!events.length) return '';
  const rows = events.map((e) => {
    const parties = e.from_label
      ? `${e.from_label} &rarr; ${e.to_label}`
      : e.to_label ?? '';
    const price = e.price_cents != null ? ` &middot; ${formatPrice(e.price_cents)}` : '';
    return `
      <tr>
        <td class="prov-type">${formatEventType(e.event_type)}${price}</td>
        <td class="prov-date">${formatDate(e.event_date)}</td>
        <td class="prov-parties">${parties}</td>
      </tr>`;
  }).join('');

  return `
    <div class="section-label">Provenance</div>
    <table class="prov-table">
      <thead>
        <tr>
          <th>Event</th>
          <th>Date</th>
          <th>Parties</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildTrustSignals(): string {
  const signals = [
    {
      title: 'Integrity Verified',
      detail: 'TapnSign hashes the uploaded media and autograph manifest on the backend to make tampering evident.',
    },
    {
      title: 'Server-Minted Certificate',
      detail: 'Certificate IDs and authenticity records are issued by TapnSign on the server, not by the device.',
    },
    {
      title: 'Original Creator Verified',
      detail: 'Only verified creators can mint new TapnSign autographs.',
    },
    {
      title: 'Ownership Chain Recorded',
      detail: 'Transfers are recorded server-side so collectors can inspect provenance.',
    },
    {
      title: 'Duplicate-Protected Minting',
      detail: 'TapnSign checks for duplicate media and stroke signatures before minting.',
    },
  ];

  const items = signals.map((signal) => `
    <div class="trust-row">
      <div class="trust-check">&#10003;</div>
      <div>
        <div class="trust-label">${signal.title}</div>
        <div class="trust-detail">${signal.detail}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="section-label">Collector Protection</div>
    <div class="trust-block">${items}</div>
  `;
}

export async function buildCertificateHtml(data: CertificateData): Promise<string> {
  const qrSvg = await QRCode.toString(data.verifyUrl, {
    type: 'svg',
    width: 110,
    margin: 1,
    color: { dark: '#111111', light: '#ffffff' },
  });

  const thumbnailHtml = data.thumbnailUrl
    ? `<img class="thumbnail" src="${data.thumbnailUrl}" />`
    : '';

  const provenanceHtml = buildProvenanceTable(data.provenance);
  const trustHtml = buildTrustSignals();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { margin: 28px; size: letter; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      background: #fff;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .frame {
      border: 3px double #E53935;
      border-radius: 10px;
      padding: 28px;
      min-height: calc(100vh - 112px);
      position: relative;
    }
    /* Header row */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #eee;
    }
    .brand { font-size: 26px; font-weight: 800; color: #E53935; line-height: 1; }
    .cert-subtitle {
      font-size: 10px;
      letter-spacing: 3px;
      color: #888;
      text-transform: uppercase;
      margin-top: 5px;
    }
    .badge {
      background: #E53935;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      border-radius: 20px;
      padding: 5px 13px;
    }
    /* Creator */
    .creator-name { font-size: 38px; font-weight: 800; margin: 0 0 4px; line-height: 1.1; }
    .capture-date { color: #777; font-size: 13px; margin-bottom: 18px; }
    /* Two-column layout */
    .two-col { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 18px; }
    .col-main { flex: 1; }
    .col-qr { width: 130px; text-align: center; flex-shrink: 0; }
    .col-qr svg { width: 110px; height: 110px; }
    .qr-label { font-size: 9px; color: #888; margin-top: 5px; line-height: 1.3; }
    /* Thumbnail */
    .thumbnail {
      width: 100%;
      max-height: 180px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 16px;
      display: block;
    }
    /* Details table */
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .details-table td {
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 12px;
    }
    .details-table td:first-child { color: #777; width: 42%; }
    .details-table td:last-child { font-weight: 600; text-align: right; }
    /* Hash block */
    .hash-block {
      background: #f7f7f7;
      border-radius: 7px;
      padding: 12px 14px;
      margin-bottom: 14px;
    }
    .hash-label {
      font-size: 9px;
      color: #aaa;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 3px;
    }
    .hash-value {
      font-family: 'Courier New', monospace;
      font-size: 9px;
      color: #333;
      word-break: break-all;
      line-height: 1.4;
    }
    .trust-block {
      background: #f7f7f7;
      border-radius: 7px;
      padding: 6px 14px;
      margin-bottom: 14px;
    }
    .trust-row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 8px 0;
      border-bottom: 1px solid #ececec;
    }
    .trust-row:last-child { border-bottom: none; }
    .trust-check {
      color: #0F8A4B;
      font-weight: 800;
      font-size: 12px;
      line-height: 1.3;
    }
    .trust-label {
      font-size: 11px;
      font-weight: 700;
      color: #111;
      margin-bottom: 2px;
    }
    .trust-detail {
      font-size: 10px;
      color: #666;
      line-height: 1.4;
    }
    /* Provenance */
    .section-label {
      font-size: 10px;
      font-weight: 700;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin: 14px 0 8px;
    }
    .prov-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
    .prov-table th {
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #aaa;
      padding: 0 0 6px;
      border-bottom: 1px solid #eee;
    }
    .prov-table td { padding: 6px 0; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
    .prov-type { font-weight: 600; width: 28%; }
    .prov-date { color: #777; width: 36%; }
    .prov-parties { color: #444; }
    /* Footer */
    .footer {
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1px solid #eee;
      text-align: center;
      font-size: 9px;
      color: #bbb;
    }
    .footer strong { color: #E53935; }
  </style>
</head>
<body>
  <div class="frame">
    <div class="header">
      <div>
        <div class="brand">TapnSign</div>
        <div class="cert-subtitle">Certificate of Authenticity</div>
      </div>
      <div class="badge">&#10003; Verified Autograph</div>
    </div>

    <div class="creator-name">${data.creatorName}</div>
    <div class="capture-date">Captured ${formatDate(data.createdAt)}</div>

    ${thumbnailHtml}

    <div class="two-col">
      <div class="col-main">
        <table class="details-table">
          <tr><td>Signed by</td><td>${data.creatorName}</td></tr>
          <tr><td>Verified Account</td><td>${data.creatorVerified ? 'Yes' : 'Pending'}</td></tr>
          <tr><td>Current Owner</td><td>${data.ownerName}</td></tr>
          <tr><td>Date Captured</td><td>${formatDate(data.createdAt)}</td></tr>
        </table>

        <div class="hash-block">
          <div class="hash-label">Certificate ID</div>
          <div class="hash-value">${data.certificateId}</div>
          <div class="hash-label" style="margin-top:10px">Content Hash (SHA-256)</div>
          <div class="hash-value">${data.contentHash}</div>
        </div>

        ${trustHtml}
      </div>

      <div class="col-qr">
        ${qrSvg}
        <div class="qr-label">Scan to verify on TapnSign</div>
      </div>
    </div>

    ${provenanceHtml}

    <div class="footer">
      This certificate was issued by <strong>TapnSign</strong>.
      Verify authenticity at ${data.verifyUrl}
    </div>
  </div>
</body>
</html>`;
}
