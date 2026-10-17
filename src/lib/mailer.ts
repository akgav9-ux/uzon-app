/**
 * Delivery boundary for transactional email (Resend) and SMS (Twilio).
 *
 * Both integrations are real HTTP calls that activate as soon as credentials
 * are present in the environment. When they are absent the function reports
 * `delivered: false` and the API returns the code to the client **only in demo
 * mode** (UZON_DEMO_MODE !== "false"), clearly labelled as a development aid.
 * Nothing is silently faked.
 */

export type DeliveryResult = { delivered: boolean; provider: "resend" | "twilio" | "none"; reason?: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function isSmsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { delivered: false, provider: "none", reason: "RESEND_API_KEY is not configured" };
  const from = process.env.EMAIL_FROM ?? "UZON <no-reply@uzon.app>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      return { delivered: false, provider: "resend", reason: `Resend responded ${res.status}` };
    }
    return { delivered: true, provider: "resend" };
  } catch (error) {
    return { delivered: false, provider: "resend", reason: error instanceof Error ? error.message : "network error" };
  }
}

export async function sendSms(to: string, body: string): Promise<DeliveryResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { delivered: false, provider: "none", reason: "Twilio credentials are not configured" };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) return { delivered: false, provider: "twilio", reason: `Twilio responded ${res.status}` };
    return { delivered: true, provider: "twilio" };
  } catch (error) {
    return { delivered: false, provider: "twilio", reason: error instanceof Error ? error.message : "network error" };
  }
}

export function authCodeEmail(code: string, locale: string): { subject: string; html: string } {
  const texts = {
    ru: { subject: "Код подтверждения UZON", body: `Ваш код подтверждения: <b>${code}</b>. Действует 10 минут.` },
    en: { subject: "Your UZON verification code", body: `Your verification code is <b>${code}</b>. It expires in 10 minutes.` },
    uz: { subject: "UZON tasdiqlash kodi", body: `Tasdiqlash kodingiz: <b>${code}</b>. 10 daqiqa amal qiladi.` },
  };
  const t = texts[locale as keyof typeof texts] ?? texts.ru;
  return { subject: t.subject, html: `<div style="font-family:sans-serif">${t.body}</div>` };
}

export function authCodeSms(code: string): string {
  return `UZON: ${code} (10 min)`;
}

export function resetEmail(link: string, locale: string): { subject: string; html: string } {
  const texts = {
    ru: { subject: "Сброс пароля UZON", body: `Ссылка для сброса пароля: <a href="${link}">${link}</a>` },
    en: { subject: "Reset your UZON password", body: `Reset link: <a href="${link}">${link}</a>` },
    uz: { subject: "UZON parolini tiklash", body: `Tiklash havolasi: <a href="${link}">${link}</a>` },
  };
  const t = texts[locale as keyof typeof texts] ?? texts.ru;
  return { subject: t.subject, html: `<div style="font-family:sans-serif">${t.body}</div>` };
}
