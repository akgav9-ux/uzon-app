import { z } from "zod";
import { db } from "@/db";
import { visitorAnalytics } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, toResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const visitSchema = z.object({
  visitorId: z.string().uuid(),
  sessionId: z.string().uuid(),
  path: z.string().min(1).max(300).regex(/^\/(?!\/)/),
  referrerHost: z.string().max(180).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(120).optional().nullable(),
  deviceType: z.enum(["mobile", "tablet", "desktop", "unknown"]).default("unknown"),
  browser: z.string().max(60).optional().nullable(),
  os: z.string().max(60).optional().nullable(),
});

function classifySource(utmSource?: string | null, referrerHost?: string | null) {
  const source = (utmSource ?? "").toLowerCase();
  const host = (referrerHost ?? "").toLowerCase();
  if (source) {
    if (/instagram|instagr\.am/.test(source)) return "instagram";
    if (/telegram|t\.me/.test(source)) return "telegram";
    if (/whatsapp|wa\.me/.test(source)) return "whatsapp";
    if (/google|bing|yandex|yahoo/.test(source)) return "search";
    return "campaign";
  }
  if (!host) return "direct";
  if (/instagram|instagr\.am/.test(host)) return "instagram";
  if (/telegram|t\.me/.test(host)) return "telegram";
  if (/whatsapp|wa\.me/.test(host)) return "whatsapp";
  if (/google\.|bing\.|yandex\.|yahoo\./.test(host)) return "search";
  if (host.endsWith("uzon-app.vercel.app") || host.endsWith("uzon.uz")) return "internal";
  return "referral";
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = visitSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(422, "invalid_analytics_event");
    const input = parsed.data;

    await rateLimit(`visitor-analytics:${input.visitorId}`, 90, 60);
    const user = await getSessionUser(req);
    const country = req.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;
    const countryCode = country && /^[A-Z]{2}$/.test(country) ? country : null;
    const referrerHost = input.referrerHost?.toLowerCase().replace(/^www\./, "") || null;

    await db.insert(visitorAnalytics).values({
      visitorId: input.visitorId,
      sessionId: input.sessionId,
      userId: user?.id ?? null,
      path: input.path,
      source: classifySource(input.utmSource, referrerHost),
      referrerHost,
      utmSource: input.utmSource?.trim() || null,
      utmMedium: input.utmMedium?.trim() || null,
      utmCampaign: input.utmCampaign?.trim() || null,
      countryCode,
      deviceType: input.deviceType,
      browser: input.browser?.trim() || null,
      os: input.os?.trim() || null,
    });

    return ok({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toResponse(error);
  }
}
