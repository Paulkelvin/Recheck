// WhatsApp Business Cloud API (Meta's official platform for sending
// messages programmatically). Note: this is NOT the same as having the
// consumer WhatsApp Business app installed on a phone -- it needs its own
// setup in Meta's developer console: a Meta app with the WhatsApp product
// added, a registered sender phone number, a permanent access token, and at
// least one message template pre-approved by Meta (required for any
// business-initiated message like "your report is ready").
//
// Graceful no-op when unconfigured, matching the Paystack bypass pattern --
// this never blocks the rest of the pipeline.

function normalizeNigerianPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return null;
}

export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  bodyParams: string[],
): Promise<{ sent: boolean; reason?: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";

  if (!accessToken || !phoneNumberId) {
    console.log("[whatsapp] not configured, skipping message to", toPhone);
    return { sent: false, reason: "not_configured" };
  }

  const to = normalizeNigerianPhone(toPhone);
  if (!to) {
    console.warn("[whatsapp] could not normalize phone number, skipping:", toPhone);
    return { sent: false, reason: "invalid_phone" };
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: bodyParams.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error("[whatsapp] send failed:", res.status, errorBody);
    return { sent: false, reason: `http_${res.status}` };
  }

  return { sent: true };
}
