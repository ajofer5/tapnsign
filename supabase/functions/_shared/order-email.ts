type PrintOrderEmailParams = {
  to: string | null | undefined;
  orderReference: string;
  momentLabel: string;
  quantity: number;
  totalCents: number | null | undefined;
  shipping: {
    name: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    zip: string;
    country?: string | null;
  };
};

function formatMoney(cents: number | null | undefined) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEmailConfig() {
  return {
    apiKey: Deno.env.get('RESEND_API_KEY') ?? '',
    from: Deno.env.get('ORDER_EMAIL_FROM') ?? 'Ophinia <noreply@ophinia.com>',
    replyTo: Deno.env.get('ORDER_EMAIL_REPLY_TO') ?? 'hello@ophinia.com',
  };
}

function buildAddressLines(shipping: PrintOrderEmailParams['shipping']) {
  return [
    shipping.name,
    shipping.line1,
    shipping.line2 ?? '',
    `${shipping.city}, ${shipping.state} ${shipping.zip}`.trim(),
    shipping.country && shipping.country !== 'US' ? shipping.country : '',
  ].filter((line) => line.trim().length > 0);
}

export async function sendPrintOrderConfirmationEmail(params: PrintOrderEmailParams) {
  const recipient = params.to?.trim();
  if (!recipient) return;

  const config = getEmailConfig();
  if (!config.apiKey) {
    console.warn('print order email skipped: RESEND_API_KEY is not configured');
    return;
  }

  const total = formatMoney(params.totalCents);
  const addressLines = buildAddressLines(params.shipping);
  const escapedAddressHtml = addressLines.map((line) => escapeHtml(line)).join('<br>');
  const textAddress = addressLines.join('\n');
  const itemWord = params.quantity === 1 ? 'print' : 'prints';
  const safeMomentLabel = escapeHtml(params.momentLabel);
  const safeOrderReference = escapeHtml(params.orderReference);

  const text = [
    'Your Ophinia print order is confirmed.',
    '',
    `Moment: ${params.momentLabel}`,
    `Quantity: ${params.quantity} ${itemWord}`,
    total ? `Total paid: ${total}` : null,
    `Order reference: ${params.orderReference}`,
    '',
    'Shipping to:',
    textAddress,
    '',
    'Your order has been submitted for production. If there are any fulfillment issues, we will contact you.',
    '',
    'Questions? Email hello@ophinia.com.',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0b1f3a; line-height: 1.5; max-width: 560px;">
      <h1 style="font-size: 22px; margin: 0 0 16px;">Your Ophinia print order is confirmed</h1>
      <p style="margin: 0 0 18px;">Your official Ophinia print has been submitted for production.</p>
      <div style="border: 1px solid #d9dee8; border-radius: 8px; padding: 16px; margin-bottom: 18px;">
        <p style="margin: 0 0 8px;"><strong>Moment:</strong> ${safeMomentLabel}</p>
        <p style="margin: 0 0 8px;"><strong>Quantity:</strong> ${params.quantity} ${itemWord}</p>
        ${total ? `<p style="margin: 0 0 8px;"><strong>Total paid:</strong> ${total}</p>` : ''}
        <p style="margin: 0;"><strong>Order reference:</strong> ${safeOrderReference}</p>
      </div>
      <p style="margin: 0 0 8px;"><strong>Shipping to</strong></p>
      <p style="margin: 0 0 18px;">${escapedAddressHtml}</p>
      <p style="margin: 0 0 18px;">If there are any fulfillment issues, we will contact you.</p>
      <p style="margin: 0;">Questions? Email <a href="mailto:hello@ophinia.com" style="color: #0b1f3a;">hello@ophinia.com</a>.</p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: recipient,
        reply_to: config.replyTo,
        subject: 'Your Ophinia print order is confirmed',
        text,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('print order email failed:', response.status, body);
    }
  } catch (error) {
    console.warn('print order email failed:', error);
  }
}
