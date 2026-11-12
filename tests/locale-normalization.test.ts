import { describe, expect, it } from "vitest";
import { dictionaryFor, normalizeLocale } from "@/lib/i18n";
import { formatRelative, intlLocale } from "@/lib/utils";

describe("canonical Uzbek locale", () => {
  it("normalizes Uzbek variants and unknown values to uz", () => {
    for (const value of ["uz", "uz-Latn", "uz-Cyrl", "UZ-latn", "fr"]) {
      expect(normalizeLocale(value)).toBe("uz");
      expect(dictionaryFor(value)).toBe(dictionaryFor("uz"));
      expect(intlLocale(value)).toBe("uz");
    }
  });

  it("preserves Russian and English choices", () => {
    expect(normalizeLocale("ru")).toBe("ru");
    expect(normalizeLocale("en")).toBe("en");
    expect(intlLocale("ru")).toBe("ru");
    expect(intlLocale("en")).toBe("en");
  });

  it("formats legacy Uzbek values using Uzbek text", () => {
    expect(formatRelative(new Date(), "uz-Latn")).toBe("hozir");
  });
});
