// Termii SMS API -- a Nigerian SMS gateway, used as a backup notification
// channel to WhatsApp. Unlike WhatsApp's Cloud API, this doesn't need
// message templates pre-approved by anyone, so it's faster to stand up and
// reaches buyers without WhatsApp/data. Graceful no-op when unconfigured.

import { normalizeNigerianPhone } from "./phone";

export async function sendSms(
  toPhone: string,
  message: string,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;

  if (!apiKey || !senderId) {
    console.log("[sms] not configured, skipping message to", toPhone);
    return { sent: false, reason: "not_configured" };
  }

  const to = normalizeNigerianPhone(toPhone);
  if (!to) {
    console.warn("[sms] could not normalize phone number, skipping:", toPhone);
    return { sent: false, reason: "invalid_phone" };
  }

  const res = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      to,
      from: senderId,
      sms: message,
      type: "plain",
      channel: "generic",
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error("[sms] send failed:", res.status, errorBody);
    return { sent: false, reason: `http_${res.status}` };
  }

  return { sent: true };
}
