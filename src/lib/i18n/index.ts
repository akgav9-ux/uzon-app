import { en, type Dictionary, type TranslationKey } from "./en";
import { ru } from "./ru";
import { uz } from "./uz";

export type { Dictionary, TranslationKey };
export { en, ru, uz };

export const dictionaries: Record<string, Dictionary> = { en, ru, "uz-Latn": uz };

export const LOCALES = [
  { code: "ru", label: "Русский", short: "RU" },
  { code: "en", label: "English", short: "EN" },
  { code: "uz-Latn", label: "Oʻzbekcha (lotin)", short: "UZ" },
] as const;

export function dictionaryFor(locale: string): Dictionary {
  return dictionaries[locale] ?? en;
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
    if (lower.startsWith("uz")) return "uz-Latn";
    if (lower.startsWith("ru")) return "ru";
    if (lower.startsWith("en")) return "en";
  }
  return "ru";
}
