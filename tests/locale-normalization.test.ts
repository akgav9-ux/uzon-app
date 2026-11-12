import { describe, expect, it } from "vitest";
import { dictionaryFor, normalizeLocale } from "@/lib/i18n";
import { formatRelative, intlLocale } from "@/lib/utils";
import { registerSchema, settingsUpdateSchema } from "@/lib/validation";
import { authCodeEmail, resetEmail } from "@/lib/mailer";

describe("canonical Uzbek locale", () => {
  it("normalizes Uzbek variants and unknown values to uz", () => {
    for (const value of ["uz", "uz-Latn", "uz-Cyrl", "UZ-latn", "fr"]) {
      expect(normalizeLocale(value)).toBe("uz");
      expect(dictionaryFor(value)).toBe(dictionaryFor("uz"));
      expect(intlLocale(value)).toBe("uz");
    }
  });

  it("validates registration with either email or phone and requires legal consent", () => {
    const base = {
      username: "test_user",
      displayName: "Test User",
      password: "securepass123",
      acceptedTerms: true as const,
      documentVersion: "2026-11-12" as const,
    };

    expect(registerSchema.parse({ ...base, email: "test@example.com" }).email).toBe("test@example.com");
    expect(registerSchema.parse({ ...base, phone: "+998901234567" }).phone).toBe("+998901234567");
    expect(registerSchema.safeParse(base).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, email: "test@example.com", acceptedTerms: false }).success).toBe(false);
    expect(registerSchema.parse({ ...base, email: "test@example.com", locale: "uz-Cyrl" }).locale).toBe("uz");
  });

  it("accepts legacy Uzbek values at the API boundary and stores canonical uz", () => {
    expect(settingsUpdateSchema.parse({ locale: "uz-Cyrl" }).locale).toBe("uz");
    expect(settingsUpdateSchema.parse({ locale: "uz-Latn" }).locale).toBe("uz");
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

  it("uses Uzbek for verification and password-reset emails across Uzbek variants", () => {
    expect(authCodeEmail("123456", "uz-Cyrl").subject).toBe("UZON tasdiqlash kodi");
    expect(resetEmail("https://example.com/reset", "UZ-latn").subject).toBe("UZON parolini tiklash");
  });
});
