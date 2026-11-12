import { en, type Dictionary, type TranslationKey } from "./en";
import { ru } from "./ru";
import { uz } from "./uz";

export type { Dictionary, TranslationKey };
export { en, ru, uz };

export const dictionaries: Record<string, Dictionary> = { en, ru, uz };

export const LOCALES = [
  { code: "uz", label: "Oʻzbekcha", short: "UZ" },
  { code: "ru", label: "Русский", short: "RU" },
  { code: "en", label: "English", short: "EN" },
] as const;

export function normalizeLocale(locale: string): string {
  if (locale === "uz-Latn" || locale.startsWith("uz-")) return "uz";
  return locale === "ru" || locale === "en" ? locale : "uz";
}

export function dictionaryFor(locale: string): Dictionary {
  return dictionaries[normalizeLocale(locale)] ?? en;
}

/**
 * Translate with `{placeholder}` interpolation. Missing keys fall back to
 * English and then to the raw key so a gap is visible instead of crashing.
 */
export function translate(locale: string, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = dictionaryFor(locale);
  const raw = dict[key] ?? en[key] ?? String(key);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function detectBrowserLocale(): string {
  if (typeof navigator === "undefined") return "ru";
  const candidates = [...(navigator.languages ?? []), navigator.language];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower.startsWith("uz")) return "uz";
    if (lower.startsWith("ru")) return "ru";
    if (lower.startsWith("en")) return "en";
  }
  return "ru";
}
