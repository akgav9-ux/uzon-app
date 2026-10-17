import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SUPPORTED_LOCALES = ["ru", "en", "uz-Latn"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** BCP-47 tag used for Intl formatting. uz-Latn is already valid BCP-47. */
export function intlLocale(locale: string): string {
  return SUPPORTED_LOCALES.includes(locale as Locale) ? locale : "en";
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: value >= 10000 ? "compact" : "standard" }).format(
    value,
  );
}

export function formatFullNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatBytes(bytes: number, locale: string): string {
  if (!bytes) return `0 ${locale === "ru" ? "Б" : "B"}`;
  const units = locale === "ru" ? ["Б", "КБ", "МБ", "ГБ"] : ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return "0:00";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(iso: string | Date, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), opts ?? { day: "numeric", month: "short", year: "numeric" }).format(
    date,
  );
}

export function formatTime(iso: string | Date, locale: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" }).format(date);
}

const RELATIVE: Record<string, { s: string; m: string; h: string; d: string }> = {
  ru: { s: "только что", m: "мин назад", h: "ч назад", d: "дн назад" },
  en: { s: "just now", m: "m ago", h: "h ago", d: "d ago" },
  "uz-Latn": { s: "hozir", m: "min oldin", h: "soat oldin", d: "kun oldin" },
};

export function formatRelative(iso: string | Date, locale: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - date.getTime();
  const words = RELATIVE[locale] ?? RELATIVE.en;
  if (Number.isNaN(date.getTime())) return "";
  if (diff < 45_000) return words.s;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} ${words.m}`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} ${words.h}`;
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)} ${words.d}`;
  return formatDate(date, locale);
}

export function slugifyUsername(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.]/g, "")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 30);
}

export function slugifyChannel(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]{2,40}/gu) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase()))).slice(0, 12);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Deterministic brand gradient for avatars without an image. */
export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${hash} 70% 52%), hsl(${(hash + 48) % 360} 78% 42%))`;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
