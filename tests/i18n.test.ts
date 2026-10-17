import { describe, expect, it } from "vitest";
import { detectBrowserLocale, dictionaryFor, dictionaries, en, LOCALES, translate } from "@/lib/i18n";
import { formatBytes, formatDuration, formatFullNumber, formatRelative, intlLocale } from "@/lib/utils";

describe("dictionary coverage", () => {
  const keys = Object.keys(en);

  it("ships exactly the three launch locales", () => {
    expect(Object.keys(dictionaries).sort()).toEqual(["en", "ru", "uz-Latn"]);
    expect(LOCALES.map((l) => l.code).sort()).toEqual(["en", "ru", "uz-Latn"]);
  });

  it("has no missing translations", () => {
    for (const locale of ["ru", "uz-Latn"] as const) {
      const dict = dictionaries[locale]!;
      const missing = keys.filter((key) => !dict[key as keyof typeof dict]);
      expect(missing, `${locale} is missing keys`).toEqual([]);
    }
  });

  it("has no untranslated copies of the English text", () => {
    for (const locale of ["ru", "uz-Latn"] as const) {
      const dict = dictionaries[locale]!;
      const identical = keys.filter((key) => dict[key as keyof typeof dict] === en[key as keyof typeof en] && !["app.name", "UZON"].includes(en[key as keyof typeof en]));
      expect(identical, `${locale} copies English for: ${identical.join(", ")}`).toEqual([]);
    }
  });

  it("falls back to English and then to the key", () => {
    expect(dictionaryFor("fr")).toBe(en);
    expect(translate("ru", "nav.home")).toBe("Главная");
    expect(translate("uz-Latn", "nav.home")).toBe("Bosh sahifa");
    expect(translate("en", "nav.home")).toBe("Home");
  });

  it("interpolates placeholders", () => {
    expect(translate("en", "story.expires", { hours: 24 })).toBe("Stories disappear after 24 hours");
    expect(translate("ru", "create.uploading", { percent: 42 })).toContain("42%");
    expect(translate("uz-Latn", "profile.joined", { date: "2026" })).toContain("2026");
    expect(translate("en", "search.empty", { query: "uzon" })).toContain("uzon");
  });

  it("detects a browser locale", () => {
    expect(detectBrowserLocale()).toMatch(/^(ru|en|uz-Latn)$/);
  });
});

describe("locale aware formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(null)).toBe("0:00");
  });

  it("formats file sizes per locale", () => {
    expect(formatBytes(1536, "ru")).toContain("КБ");
    expect(formatBytes(1536, "en")).toContain("KB");
    expect(formatBytes(2_500_000_000, "uz-Latn")).toContain("GB");
  });

  it("formats numbers and relative times", () => {
    expect(formatFullNumber(12345, "en")).toBe("12,345");
    expect(intlLocale("uz-Latn")).toBe("uz-Latn");
    expect(intlLocale("klingon")).toBe("en");
    const now = new Date();
    expect(formatRelative(now, "ru")).toBe("только что");
    expect(formatRelative(new Date(Date.now() - 5 * 60_000), "en")).toContain("m ago");
    expect(formatRelative(new Date(Date.now() - 3 * 3_600_000), "uz-Latn")).toContain("soat oldin");
  });
});
