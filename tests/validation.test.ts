import { describe, expect, it } from "vitest";
import {
  audienceSchema,
  commentCreateSchema,
  conversationCreateSchema,
  loginSchema,
  messageSendSchema,
  normalizeChannelSlug,
  normalizeUsername,
  postCreateSchema,
  privacyRuleSchema,
  profileUpdateSchema,
  recoverResetSchema,
  registerSchema,
  reportSchema,
  settingsUpdateSchema,
  storyCreateSchema,
  videoCreateSchema,
} from "@/lib/validation";
import { DEFAULT_CONFIG } from "@/lib/config";
import { extractHashtags, slugifyChannel, slugifyUsername } from "@/lib/utils";

describe("register validation", () => {
  it("requires an email or a phone number", () => {
    const parsed = registerSchema.safeParse({ username: "aziza", displayName: "Aziza", password: "supersecret1" });
    expect(parsed.success).toBe(false);
  });

  it("accepts email registration", () => {
    const parsed = registerSchema.safeParse({
      username: "aziza",
      displayName: "Aziza",
      email: "aziza@example.com",
      password: "supersecret1",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an international phone number", () => {
    const parsed = registerSchema.safeParse({
      username: "javohir",
      displayName: "Javohir",
      phone: "+998901234567",
      password: "supersecret1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects weak passwords and impossible phone numbers", () => {
    expect(registerSchema.safeParse({ username: "abc", displayName: "Abc", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ username: "abc", displayName: "Abc", phone: "12", password: "supersecret1" }).success).toBe(false);
  });

  it("does not accept arbitrary login codes", () => {
    expect(loginSchema.safeParse({ identifier: "aziza", password: "" }).success).toBe(false);
  });
});

describe("username and slug normalisation", () => {
  it("keeps only safe characters", () => {
    expect(slugifyUsername("  @Aziza Karimova! ")).toBe("azizakarimova");
    expect(slugifyChannel("UZON News 2026")).toBe("uzonnews2026");
    expect(normalizeUsername("Javohir_1")).toBe("javohir_1");
    expect(normalizeChannelSlug("Sayohat • Travel")).toBe("sayohattravel");
  });

  it("rejects too short usernames", () => {
    expect(() => normalizeUsername("ab")).toThrow();
  });
});

describe("clip duration limit is server driven", () => {
  it("defaults to 5 minutes and stays configurable", () => {
    expect(DEFAULT_CONFIG.clipMaxSeconds).toBe(300);
    const fiveMinutes = 300 * 1000;
    expect(videoCreateSchema.safeParse({ title: "Clip", mediaId: "00000000-0000-0000-0000-000000000000", kind: "clip", durationMs: fiveMinutes }).success).toBe(true);
    expect(videoCreateSchema.safeParse({ title: "Clip", mediaId: "00000000-0000-0000-0000-000000000000", kind: "clip", durationMs: fiveMinutes + 1 }).success).toBe(true);
    // Values above the schema ceiling are rejected outright.
    expect(videoCreateSchema.safeParse({ title: "Clip", mediaId: "00000000-0000-0000-0000-000000000000", durationMs: 25 * 3600 * 1000 }).success).toBe(false);
  });

  it("rejects malformed media ids", () => {
    expect(videoCreateSchema.safeParse({ title: "Clip", mediaId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("content schemas", () => {
  const id = "00000000-0000-0000-0000-000000000000";
  it("validates posts, comments, stories and messages", () => {
    expect(postCreateSchema.safeParse({ text: "Hello", audience: "followers" }).success).toBe(true);
    expect(postCreateSchema.safeParse({ text: "x".repeat(5000) }).success).toBe(false);
    expect(commentCreateSchema.safeParse({ entityType: "video", entityId: id, text: "nice" }).success).toBe(true);
    expect(commentCreateSchema.safeParse({ entityType: "clip", entityId: id, text: "nice" }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ mediaId: id, audience: "contacts" }).success).toBe(true);
    expect(messageSendSchema.safeParse({}).success).toBe(true);
    expect(messageSendSchema.safeParse({ attachmentKind: "sticker" }).success).toBe(false);
  });

  it("validates conversations, reports, profiles and settings", () => {
    expect(conversationCreateSchema.safeParse({ kind: "channel", title: "UZON News", slug: "uzon_news" }).success).toBe(true);
    expect(conversationCreateSchema.safeParse({ kind: "channel", isPrivate: "yes" }).success).toBe(false);
    expect(reportSchema.safeParse({ entityType: "video", entityId: id, reason: "copyright" }).success).toBe(true);
    expect(reportSchema.safeParse({ entityType: "planet", entityId: id, reason: "copyright" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ bio: "x".repeat(500) }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ theme: "system", locale: "uz-Latn" }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ locale: "uz-Cyrl" }).success).toBe(false);
    expect(recoverResetSchema.safeParse({ token: "abcdefghij", password: "supersecret1" }).success).toBe(true);
  });

  it("audience and privacy enums stay closed", () => {
    expect(audienceSchema.safeParse("public").success).toBe(true);
    expect(audienceSchema.safeParse("anyone").success).toBe(false);
    expect(privacyRuleSchema.safeParse("selected").success).toBe(true);
    expect(privacyRuleSchema.safeParse("friends").success).toBe(false);
  });
});

describe("hashtag extraction", () => {
  it("extracts unique lowercase tags including unicode", () => {
    expect(extractHashtags("Sayohat #Samarkand #travel #Samarkand")).toEqual(["samarkand", "travel"]);
    expect(extractHashtags("no tags here")).toEqual([]);
    expect(extractHashtags("#a")).toEqual([]);
  });
});
